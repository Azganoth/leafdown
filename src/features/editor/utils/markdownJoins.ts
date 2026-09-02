import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["thematicBreak"]>>[2];

type JoinArguments = Parameters<StringifyState["join"][number]>;

// Asking `mdast-util-to-markdown` what it will write between two blocks, by the resolution it uses
// itself, so the answer cannot drift from the blank line it actually emits.
export const joinsWithoutBlankLine = (
  left: JoinArguments[0],
  right: JoinArguments[1],
  parent: JoinArguments[2],
  state: StringifyState,
) => {
  let index = state.join.length;

  while (index--) {
    const result = state.join[index](left, right, parent, state);

    if (result === true || result === 1) {
      break;
    }

    if (typeof result === "number") {
      return result === 0;
    }

    if (result === false) {
      return false;
    }
  }

  return false;
};
