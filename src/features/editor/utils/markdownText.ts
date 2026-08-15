import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

const TRAILING_WHITESPACE_PATTERN = /\s+$/u;

export const serializeMarkdownText: NonNullable<RemarkStringifyHandlers["text"]> = (
  node: { value: string },
  _parent,
  state,
  info,
) => {
  const { value } = node;
  const trailingWhitespace = TRAILING_WHITESPACE_PATTERN.exec(value)?.[0] ?? "";
  const escaped = state.safe(value.slice(0, value.length - trailingWhitespace.length), {
    ...info,
    after: trailingWhitespace + info.after,
  });

  return escaped + trailingWhitespace;
};
