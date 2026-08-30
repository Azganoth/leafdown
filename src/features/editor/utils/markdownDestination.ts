import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { defaultHandlers } from "mdast-util-to-markdown";

import {
  decodeCharacterReferences,
  findCharacterReferenceSources,
} from "./characterReferenceMarkdown";
import { withAuthoredTitle } from "./markdownTitle";

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

// A definition writes its destination outside any tail, so nothing in it needs a parenthesis
// escaped, and its title ends the line rather than sitting before a `)`.
export const serializeMarkdownDefinition: NonNullable<RemarkStringifyHandlers["definition"]> = (
  ...[node, parent, state, info]: Parameters<typeof defaultHandlers.definition>
) => {
  const restore = scopeDestination(state, node.url, false);

  try {
    return withAuthoredTitle(
      node,
      state.options,
      () => defaultHandlers.definition(node, parent, state, info),
      "",
    );
  } finally {
    restore();
  }
};

export const serializeMarkdownImage: NonNullable<RemarkStringifyHandlers["image"]> = Object.assign(
  (...[node, parent, state, info]: Parameters<typeof defaultHandlers.image>) => {
    const { authored, node: destination } = withAuthoredUrl(node);
    const restore = scopeDestination(state, destination.url, authored);

    try {
      return withAuthoredTitle(destination, state.options, () =>
        defaultHandlers.image(destination, parent, state, info),
      );
    } finally {
      restore();
    }
  },
  { peek: defaultHandlers.image.peek },
);
