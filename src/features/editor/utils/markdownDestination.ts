import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { defaultHandlers } from "mdast-util-to-markdown";

import {
  decodeCharacterReferences,
  findCharacterReferenceSources,
  readAuthoredDescription,
} from "./characterReferenceMarkdown";
import {
  chooseTitleMarker,
  readTitleMarker,
  TITLE_MARKER_PAIRS,
  type TitleMarker,
  withAuthoredTitle,
} from "./markdownTitle";
import {
  readDestinationMarker,
  readDestinationSeparator,
  readTitleSeparator,
  usesAngleDestination,
} from "./referenceLinkMarkdown";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["link"]>>[2];
type UnsafePattern = StringifyState["unsafe"][number];

const DESTINATION_PARENTHESES: readonly UnsafePattern[] = [
  { character: "(", inConstruct: "destinationRaw" },
  { character: ")", inConstruct: "destinationRaw" },
];

const isDestinationParenthesis = (pattern: UnsafePattern) =>
  pattern.inConstruct === "destinationRaw" &&
  (pattern.character === "(" || pattern.character === ")");

// A raw destination holds parentheses while they stay balanced, so only a run that would close the
// destination early needs an escape.
const hasBalancedParentheses = (url: string) => {
  let depth = 0;

  for (const character of url) {
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;

      if (depth < 0) {
        return false;
      }
    }
  }

  return depth === 0;
};

const isAmpersand = (pattern: UnsafePattern) => pattern.character === "&";

const DESTINATION_CONSTRUCTS = ["destinationLiteral", "destinationRaw"] as const;
const REGULAR_EXPRESSION_SYNTAX_PATTERN = /[$()*+.?[\\\]^{|}]/gu;

// A phrasing pattern stays in scope inside a destination, because the paragraph is still on the
// stack, and it constrains its character by that construct rather than by what follows it. The
// tail alone decides a reference, so the ones this destination spells out narrow the pattern to
// exactly the ampersands that open one. The label keeps the pattern it had: it holds its own text
// and is answered by the text handler.
const scopeAmpersand = (
  pattern: UnsafePattern,
  url: string,
  authored: boolean,
): UnsafePattern[] => {
  const outsideDestination: UnsafePattern = {
    ...pattern,
    notInConstruct: [...DESTINATION_CONSTRUCTS],
  };
  // An authored destination is written where its references still decode to the target, so every
  // ampersand in it reaches the file bare.
  const references = authored ? new Set<string>() : findCharacterReferenceSources(url);

  if (references.size === 0) {
    return [outsideDestination];
  }

  const tails = [...references]
    .map((source) => source.slice(1).replace(REGULAR_EXPRESSION_SYNTAX_PATTERN, String.raw`\$&`))
    .join("|");

  return [
    outsideDestination,
    { character: "&", after: `(?:${tails})`, inConstruct: [...DESTINATION_CONSTRUCTS] },
  ];
};

const scopeDestination = (
  state: StringifyState,
  url: string | null | undefined,
  authored: boolean,
) => {
  const enclosing = state.unsafe;
  const relaxed = enclosing.flatMap((pattern) => {
    if (isDestinationParenthesis(pattern)) {
      return [];
    }

    return isAmpersand(pattern) ? scopeAmpersand(pattern, url ?? "", authored) : [pattern];
  });

  // An image in a link label serializes inside the link handler, so the patterns an unbalanced
  // destination needs are put back rather than assumed still present.
  state.unsafe = hasBalancedParentheses(url ?? "")
    ? relaxed
    : [...relaxed, ...DESTINATION_PARENTHESES];

  return () => {
    state.unsafe = enclosing;
  };
};

// A description the document carries is inline source rather than text, so it reaches the file as
// it stands instead of through the escaping that would turn its markers into characters. Both
// image handlers write the label before they open the destination or the reference tail, so the
// first value the handler makes safe is the description and every value after it is not.
const scopeDescription = (state: StringifyState, description: string | null) => {
  if (description === null) {
    return () => {};
  }

  const enclosing = state.safe;
  let pending = true;

  state.safe = (value, config) => {
    if (!pending) {
      return enclosing.call(state, value, config);
    }

    pending = false;

    return description;
  };

  return () => {
    state.safe = enclosing;
  };
};

// The authored destination is written where its references still decode to the target the document
// holds. Every ampersand in it belongs to a reference the author wrote, so the run reaches the file
// as it was authored and reads back as the destination the document carries.
const withAuthoredUrl = <T extends { url?: string | null }>(node: T) => {
  const authored = (node as { authoredUrl?: unknown }).authoredUrl;

  return typeof authored === "string" && decodeCharacterReferences(authored) === node.url
    ? { authored: true, node: { ...node, url: authored } }
    : { authored: false, node };
};

export const serializeMarkdownLink: NonNullable<RemarkStringifyHandlers["link"]> = Object.assign(
  (...[node, parent, state, info]: Parameters<typeof defaultHandlers.link>) => {
    const { authored, node: destination } = withAuthoredUrl(node);
    const restore = scopeDestination(state, destination.url, authored);

    try {
      return withAuthoredTitle(destination, state.options, () =>
        defaultHandlers.link(destination, parent, state, info),
      );
    } finally {
      restore();
    }
  },
  { peek: defaultHandlers.link.peek },
);

type DefinitionNode = Parameters<typeof defaultHandlers.definition>[0];

// The construct a title is written inside decides which quote the run gives up a backslash for. A
// parenthesized title is written inside none of them, because the marker it is held between is only
// ever chosen for a title spelling no parenthesis, and every other pattern is out of scope for a
// definition already.
const TITLE_CONSTRUCTS = {
  '"': "titleQuote",
  "'": "titleApostrophe",
  "(": null,
} as const satisfies Record<TitleMarker, "titleApostrophe" | "titleQuote" | null>;

const withConstruct = (
  state: StringifyState,
  construct: Parameters<StringifyState["enter"]>[0],
  write: () => string,
) => {
  const exit = state.enter(construct);

  try {
    return write();
  } finally {
    exit();
  }
};

const writeDefinitionLabel = (node: DefinitionNode, state: StringifyState) =>
  withConstruct(state, "label", () =>
    state.safe(state.associationId(node), { before: "[", after: "]" }),
  );

const writeDefinitionDestination = (node: DefinitionNode, state: StringifyState, after: string) => {
  const url = node.url;

  return usesAngleDestination(url, readDestinationMarker(node))
    ? withConstruct(
        state,
        "destinationLiteral",
        () => `<${state.safe(url, { before: "<", after: ">" })}>`,
      )
    : withConstruct(state, "destinationRaw", () => state.safe(url, { before: " ", after }));
};

const writeDefinitionTitle = (node: DefinitionNode, state: StringifyState, title: string) => {
  const marker = chooseTitleMarker(title, readTitleMarker(node));
  const [opening, closing] = TITLE_MARKER_PAIRS[marker];
  const construct = TITLE_CONSTRUCTS[marker];
  const write = () =>
    `${opening}${state.safe(title, { before: opening, after: closing })}${closing}`;

  return construct === null ? write() : withConstruct(state, construct, write);
};

// The handler owns three of the four choices a definition spells — the form its destination is
// written in, the marker its title is held between, and the whitespace runs between the three — so
// it writes the line itself rather than steering the default one, which reads each of them off the
// document instead. Every run still reaches the file through `state.safe`, under the construct the
// default handler names for it, so what a destination or a title escapes is unchanged.
export const serializeMarkdownDefinition: NonNullable<RemarkStringifyHandlers["definition"]> = (
  ...[node, , state]: Parameters<typeof defaultHandlers.definition>
) => {
  const title = node.title;
  // What the destination is written against: the run before the title, or the line ending that
  // closes a definition carrying none.
  const trailing = title ? readTitleSeparator(node) : "\n";
  const restore = scopeDestination(state, node.url, false);
  const exit = state.enter("definition");

  try {
    const label = writeDefinitionLabel(node, state);
    const destination = writeDefinitionDestination(node, state, trailing);
    const head = `[${label}]:${readDestinationSeparator(node)}${destination}`;

    return title ? `${head}${trailing}${writeDefinitionTitle(node, state, title)}` : head;
  } finally {
    exit();
    restore();
  }
};

export const serializeMarkdownImage: NonNullable<RemarkStringifyHandlers["image"]> = Object.assign(
  (...[node, parent, state, info]: Parameters<typeof defaultHandlers.image>) => {
    const { authored, node: destination } = withAuthoredUrl(node);
    const restoreDescription = scopeDescription(state, readAuthoredDescription(node));
    const restore = scopeDestination(state, destination.url, authored);

    try {
      return withAuthoredTitle(destination, state.options, () =>
        defaultHandlers.image(destination, parent, state, info),
      );
    } finally {
      restore();
      restoreDescription();
    }
  },
  { peek: defaultHandlers.image.peek },
);

export const serializeMarkdownImageReference: NonNullable<
  RemarkStringifyHandlers["imageReference"]
> = Object.assign(
  (...[node, parent, state, info]: Parameters<typeof defaultHandlers.imageReference>) => {
    const restore = scopeDescription(state, readAuthoredDescription(node));

    try {
      return defaultHandlers.imageReference(node, parent, state, info);
    } finally {
      restore();
    }
  },
  { peek: defaultHandlers.imageReference.peek },
);
