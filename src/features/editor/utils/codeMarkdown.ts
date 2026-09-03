import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { NodeSchema } from "@milkdown/kit/transformer";
import { defaultHandlers } from "mdast-util-to-markdown";

import {
  BLOCK_ADJACENT_ATTRIBUTE_NAME,
  DEFAULT_BLOCK_ADJACENT,
  readBlockAdjacent,
} from "./blockSeparatorMarkdown";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["code"]>>[2];

type JoinArguments = Parameters<StringifyState["join"][number]>;

// Milkdown types a stringify handler's node as `any`, so the block is named here from the blocks
// the serializer joins.
type CodeNode = Extract<JoinArguments[0], { type: "code" }>;

export const CODE_MARKDOWN_TYPE = "code";
export const CODE_FENCED_ATTRIBUTE_NAME = "fenced";

// The form a block is written in when it has none of its own: one the editor created, and one
// whose authored form cannot be recovered. A fence is the form that carries every block, because
// it is the only one an info string can be written on.
export const DEFAULT_CODE_FENCED = true;

// A fence opens on three or more of one character. Indented code opens on the four spaces that
// make it, so a slice standing on a run of either character was written as a fence.
const CODE_FENCE_PATTERN = /^(?:`{3,}|~{3,})/u;

export const readCodeFenced = (source: object): boolean =>
  (source as Record<string, unknown>)[CODE_FENCED_ATTRIBUTE_NAME] !== false;

// An indented block's slice opens at the line its indentation is written on, and a fence's opens
// at the fence itself, past whatever indentation the file gave it. Neither the value nor the info
// string says which form held the block, so the head of that slice is what names it: indented code
// can never stand on a fence run, because the four spaces that open it stand there first.
export const findCodeFenced = (raw: string): boolean => CODE_FENCE_PATTERN.test(raw);

// `mdast-util-to-markdown` chooses between the two code forms from one option for the whole
// document, and its indented branch also holds the conditions CommonMark puts on that form: a
// block carrying an info string, opening or closing on a blank line, or holding nothing but
// whitespace cannot be written indented, and is fenced whatever the file wrote. The choice is
// reachable only through that option, so it carries the authored form for the length of the block.
export const serializeCode: NonNullable<RemarkStringifyHandlers["code"]> = (
  node: CodeNode,
  parent,
  state,
  info,
) => {
  const { fences } = state.options;

  state.options.fences = readCodeFenced(node);

  try {
    return defaultHandlers.code(node, parent, state, info);
  } finally {
    state.options.fences = fences;
  }
};

// The preset's own runner opens the mdast node itself and carries only the info string, so it is
// replaced rather than wrapped: the authored form has to reach the node the runner opens. The
// separator every block carries travels with it, the way each block Leafdown holds another form for
// carries it in that form's own module.
export const withCodeForm = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: {
    ...schema.attrs,
    [CODE_FENCED_ATTRIBUTE_NAME]: {
      default: DEFAULT_CODE_FENCED,
      validate: "boolean",
    },
    [BLOCK_ADJACENT_ATTRIBUTE_NAME]: {
      default: DEFAULT_BLOCK_ADJACENT,
      validate: "boolean",
    },
  },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      const value = node.value as string | undefined;

      state.openNode(type, {
        language: node.lang ?? "",
        [CODE_FENCED_ATTRIBUTE_NAME]: readCodeFenced(node),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node),
      });

      if (value) {
        state.addText(value);
      }

      state.closeNode();
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      state.addNode(CODE_MARKDOWN_TYPE, undefined, node.content.firstChild?.text ?? "", {
        lang: node.attrs.language,
        [CODE_FENCED_ATTRIBUTE_NAME]: readCodeFenced(node.attrs),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node.attrs),
      });
    },
  },
});
