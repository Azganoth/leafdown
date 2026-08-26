import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { defaultHandlers } from "mdast-util-to-markdown";

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

const scopeDestinationParentheses = (state: StringifyState, url: string | null | undefined) => {
  const enclosing = state.unsafe;
  const relaxed = enclosing.filter((pattern) => !isDestinationParenthesis(pattern));

  // An image in a link label serializes inside the link handler, so the patterns an unbalanced
  // destination needs are put back rather than assumed still present.
  state.unsafe = hasBalancedParentheses(url ?? "")
    ? relaxed
    : [...relaxed, ...DESTINATION_PARENTHESES];

  return () => {
    state.unsafe = enclosing;
  };
};

export const serializeMarkdownLink: NonNullable<RemarkStringifyHandlers["link"]> = Object.assign(
  (...[node, parent, state, info]: Parameters<typeof defaultHandlers.link>) => {
    const restore = scopeDestinationParentheses(state, node.url);

    try {
      return defaultHandlers.link(node, parent, state, info);
    } finally {
      restore();
    }
  },
  { peek: defaultHandlers.link.peek },
);

export const serializeMarkdownImage: NonNullable<RemarkStringifyHandlers["image"]> = Object.assign(
  (...[node, parent, state, info]: Parameters<typeof defaultHandlers.image>) => {
    const restore = scopeDestinationParentheses(state, node.url);

    try {
      return defaultHandlers.image(node, parent, state, info);
    } finally {
      restore();
    }
  },
  { peek: defaultHandlers.image.peek },
);
