import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { defaultHandlers } from "mdast-util-to-markdown";

import { decodeCharacterReferences } from "./characterReferenceMarkdown";

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

// A phrasing pattern stays in scope inside a destination, because the paragraph is still on the
// stack, so an ampersand there is escaped on the same possibility the text handler answers.
const isAmpersand = (pattern: UnsafePattern) => pattern.character === "&";

const scopeDestination = (
  state: StringifyState,
  url: string | null | undefined,
  authored: boolean,
) => {
  const enclosing = state.unsafe;
  const relaxed = enclosing.filter(
    (pattern) => !isDestinationParenthesis(pattern) && !(authored && isAmpersand(pattern)),
  );

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
      return defaultHandlers.link(destination, parent, state, info);
    } finally {
      restore();
    }
  },
  { peek: defaultHandlers.link.peek },
);

export const serializeMarkdownImage: NonNullable<RemarkStringifyHandlers["image"]> = Object.assign(
  (...[node, parent, state, info]: Parameters<typeof defaultHandlers.image>) => {
    const { authored, node: destination } = withAuthoredUrl(node);
    const restore = scopeDestination(state, destination.url, authored);

    try {
      return defaultHandlers.image(destination, parent, state, info);
    } finally {
      restore();
    }
  },
  { peek: defaultHandlers.image.peek },
);
