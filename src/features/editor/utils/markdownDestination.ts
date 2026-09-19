import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { defaultHandlers } from "mdast-util-to-markdown";

import {
  decodeCharacterReferences,
  findCharacterReferenceSources,
  readAuthoredDescription,
  readWrittenTitle,
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

// The pattern that escapes exactly the ampersands opening a reference the value spells out, or
// null where it spells none.
const escapeReferences = (value: string): UnsafePattern | null => {
  const references = findCharacterReferenceSources(value);

  if (references.size === 0) {
    return null;
  }

  const tails = [...references]
    .map((source) => source.slice(1).replace(REGULAR_EXPRESSION_SYNTAX_PATTERN, String.raw`\$&`))
    .join("|");

  return { character: "&", after: `(?:${tails})` };
};

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
  const reference = authored ? null : escapeReferences(url);

  return reference
    ? [outsideDestination, { ...reference, inConstruct: [...DESTINATION_CONSTRUCTS] }]
    : [outsideDestination];
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
// it stands instead of through the escaping that would turn its markers into characters. The image
// handler writes the label before it opens the destination, so the first value the handler makes
// safe is the description and every value after it is not.
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

const withWrittenTitle = <T extends { title?: string | null }>(node: T) => {
  if (!node.title) {
    return { authored: false, node };
  }

  const written = readWrittenTitle(node, node.title);

  return { authored: written.authored, node: { ...node, title: written.title } };
};

// A title's ampersands are escaped by the one pattern given here, which is none for an authored
// title, whose ampersands all reach the file bare because its references still decode to the title
// the document holds.
const withTitleAmpersands = (
  state: StringifyState,
  reference: UnsafePattern | null,
  write: () => string,
) => {
  const enclosing = state.unsafe;
  const scoped = enclosing.filter((pattern) => !isAmpersand(pattern));

  state.unsafe = reference ? [...scoped, reference] : scoped;

  try {
    return write();
  } finally {
    state.unsafe = enclosing;
  }
};

const TITLE_CONSTRUCT_NAMES: readonly string[] = ["titleApostrophe", "titleQuote"];

// The default handler writes its own title one construct inside the one it opens for the object,
// which tells that call apart from the title of anything its label holds.
const scopeAuthoredTitle = (state: StringifyState, authored: boolean) => {
  if (!authored) {
    return () => {};
  }

  const enclosing = state.safe;
  const depth = state.stack.length + 2;

  state.safe = (value, config) =>
    state.stack.length === depth && TITLE_CONSTRUCT_NAMES.includes(state.stack.at(-1) ?? "")
      ? withTitleAmpersands(state, null, () => enclosing.call(state, value, config))
      : enclosing.call(state, value, config);

  return () => {
    state.safe = enclosing;
  };
};

export const serializeMarkdownLink: NonNullable<RemarkStringifyHandlers["link"]> = Object.assign(
  (...[node, parent, state, info]: Parameters<typeof defaultHandlers.link>) => {
    const { authored, node: destination } = withAuthoredUrl(node);
    const { authored: titled, node: link } = withWrittenTitle(destination);
    const restore = scopeDestination(state, link.url, authored);
    const restoreTitle = scopeAuthoredTitle(state, titled);

    try {
      return withAuthoredTitle(link, state.options, () =>
        defaultHandlers.link(link, parent, state, info),
      );
    } finally {
      restoreTitle();
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

type ReferenceNode = Parameters<typeof defaultHandlers.linkReference>[0];

const UNESCAPED_PIPE_PATTERN = /(?<!\\)((?:\\\\)*)\|/gu;

// A label is written as the file spelled it, because a reference matches its definition on that
// spelling, escapes included, and `mdast-util-to-markdown` writes it from a stack it clears, so no
// construct around it decides an escape. A cell still closes on a `|`, so a label spelled outside
// one keeps the row by giving up the match rather than the cell.
const writeLabel = (
  state: StringifyState,
  node: Parameters<StringifyState["associationId"]>[0],
) => {
  const label = state.associationId(node);

  return state.stack.includes("tableCell") ? label.replace(UNESCAPED_PIPE_PATTERN, "$1\\|") : label;
};

const ESCAPE_PATTERN = /\\[!-/:-@[-`{-~]|[\S\s]/gu;

// A text holding nothing but characters spells the same text with a backslash added before any of
// its punctuation, which is what a label written with an escape its text does not need still is.
const addsOnlyEscapes = (text: string, label: string) => {
  const textUnits = text.match(ESCAPE_PATTERN) ?? [];
  const labelUnits = label.match(ESCAPE_PATTERN) ?? [];

  return (
    textUnits.length === labelUnits.length &&
    textUnits.every(
      (unit, index) =>
        unit === labelUnits[index] || (unit.length === 1 && `\\${unit}` === labelUnits[index]),
    )
  );
};

// The collapsed and shortcut forms spell their label once, as the text, so they are written only
// where the text spells the label. Plain text spelled with fewer escapes than the label is written
// as the label instead, which reads back as the same text.
const writeReference = (
  opening: string,
  text: string,
  label: string,
  referenceType: ReferenceNode["referenceType"],
  plain: boolean,
) => {
  if (referenceType === "full" || !text) {
    return `${opening}${text}][${label}]`;
  }

  const spelled = text === label || (plain && addsOnlyEscapes(text, label)) ? label : null;

  if (spelled === null) {
    return `${opening}${text}][${label}]`;
  }

  return referenceType === "shortcut" ? `${opening}${spelled}]` : `${opening}${spelled}][]`;
};

export const serializeMarkdownLinkReference: NonNullable<RemarkStringifyHandlers["linkReference"]> =
  Object.assign(
    (...[node, , state, info]: Parameters<typeof defaultHandlers.linkReference>) => {
      const tracker = state.createTracker(info);
      const opening = tracker.move("[");
      const text = withConstruct(state, "linkReference", () =>
        withConstruct(state, "label", () =>
          state.containerPhrasing(node, { before: opening, after: "]", ...tracker.current() }),
        ),
      );

      return writeReference(
        opening,
        text,
        writeLabel(state, node),
        node.referenceType,
        node.children.every((child) => child.type === "text"),
      );
    },
    { peek: defaultHandlers.linkReference.peek },
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

// A definition is written outside any paragraph, so no phrasing pattern escapes an ampersand in
// its title, and a title spelling a reference the author escaped is given the escape here.
const writeDefinitionTitle = (node: DefinitionNode, state: StringifyState, title: string) => {
  const written = readWrittenTitle(node, title);
  const marker = chooseTitleMarker(written.title, readTitleMarker(node));
  const [opening, closing] = TITLE_MARKER_PAIRS[marker];
  const construct = TITLE_CONSTRUCTS[marker];
  const reference = written.authored ? null : escapeReferences(written.title);
  const write = () =>
    withTitleAmpersands(
      state,
      reference,
      () => `${opening}${state.safe(written.title, { before: opening, after: closing })}${closing}`,
    );

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
    const label = writeLabel(state, node);
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
    const { authored: titled, node: image } = withWrittenTitle(destination);
    const restoreDescription = scopeDescription(state, readAuthoredDescription(node));
    const restore = scopeDestination(state, image.url, authored);
    const restoreTitle = scopeAuthoredTitle(state, titled);

    try {
      return withAuthoredTitle(image, state.options, () =>
        defaultHandlers.image(image, parent, state, info),
      );
    } finally {
      restoreTitle();
      restore();
      restoreDescription();
    }
  },
  { peek: defaultHandlers.image.peek },
);

// A description the document carries is inline source rather than text, so it reaches the file as
// it stands and is never written as the label in its place.
export const serializeMarkdownImageReference: NonNullable<
  RemarkStringifyHandlers["imageReference"]
> = Object.assign(
  (...[node, , state]: Parameters<typeof defaultHandlers.imageReference>) => {
    const opening = "![";
    const description = readAuthoredDescription(node);
    const text =
      description ??
      withConstruct(state, "imageReference", () =>
        withConstruct(state, "label", () => state.safe(node.alt, { before: opening, after: "]" })),
      );

    return writeReference(
      opening,
      text,
      writeLabel(state, node),
      node.referenceType,
      description === null,
    );
  },
  { peek: defaultHandlers.imageReference.peek },
);
