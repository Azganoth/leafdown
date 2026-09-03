import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { NodeSchema } from "@milkdown/kit/transformer";
import { defaultHandlers } from "mdast-util-to-markdown";

import {
  BLOCK_ADJACENT_ATTRIBUTE_NAME,
  DEFAULT_BLOCK_ADJACENT,
  readBlockAdjacent,
} from "./blockSeparatorMarkdown";
import { joinsWithoutBlankLine } from "./markdownJoins";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["heading"]>>[2];

type StringifyParent = Parameters<NonNullable<RemarkStringifyHandlers["heading"]>>[1];

type JoinArguments = Parameters<StringifyState["join"][number]>;

// Milkdown types a stringify handler's node as `any`, so the heading is named here from the blocks
// the serializer joins.
type HeadingNode = Extract<JoinArguments[0], { type: "heading" }>;

export const HEADING_MARKDOWN_TYPE = "heading";
export const HEADING_SEPARATOR_ATTRIBUTE_NAME = "separator";
export const HEADING_CLOSING_SEQUENCE_ATTRIBUTE_NAME = "closingSequence";
export const HEADING_UNDERLINE_ATTRIBUTE_NAME = "underline";

const PARAGRAPH_MARKDOWN_TYPE = "paragraph";
const LIST_ITEM_MARKDOWN_TYPE = "listItem";
const HARD_BREAK_NODE_NAME = "hardbreak";

// The form a heading is written in when it has none of its own: one the editor created, and one
// whose authored form cannot be recovered. An ATX heading opened one space before its content,
// closed by nothing, and underlined by nothing.
export const DEFAULT_HEADING_SEPARATOR = " ";
const NO_HEADING_RUN = "";

const HEADING_SEPARATOR_PATTERN = /^[\t ]+$/u;
// The closing sequence carries the spacing before it, because the two together are the whole of
// what an ATX heading's line holds after its content and neither is read as anything else.
const HEADING_CLOSING_SEQUENCE_PATTERN = /^[\t ]+#+$/u;
const HEADING_UNDERLINE_PATTERN = /^(?:=+|-+)$/u;

// An empty ATX heading is its opening sequence and, where the file wrote one, a closing sequence.
// It is read ahead of a heading holding content, because the run closing an empty one would
// otherwise be read as the content it does not have.
const EMPTY_ATX_HEADING_PATTERN = /^#{1,6}([\t ]+#+)?$/u;
const ATX_HEADING_PATTERN = /^#{1,6}([\t ]+).*?([\t ]+#+)?$/u;
const SETEXT_UNDERLINE_PATTERN = /(=+|-+)$/u;
const TRAILING_WHITESPACE_PATTERN = /[\t ]+$/u;
// What the handler wrote for an ATX heading: the opening sequence, and the content one space past
// it where the heading holds any.
const WRITTEN_ATX_HEADING_PATTERN = /^(#{1,6})(?: (.*))?$/u;
// A line break inside an ATX heading is written as a character reference, so an underline standing
// on a line of its own is a tail only the setext form produces.
const WRITTEN_SETEXT_UNDERLINE_PATTERN = /\n(=+|-+)$/u;

export interface AuthoredHeadingForm {
  separator: string;
  closingSequence: string;
  underline: string;
}

const readRun = (source: object, name: string, pattern: RegExp, fallback: string) => {
  const run = (source as Record<string, unknown>)[name];

  return typeof run === "string" && pattern.test(run) ? run : fallback;
};

export const readHeadingSeparator = (source: object): string =>
  readRun(
    source,
    HEADING_SEPARATOR_ATTRIBUTE_NAME,
    HEADING_SEPARATOR_PATTERN,
    DEFAULT_HEADING_SEPARATOR,
  );

export const readHeadingClosingSequence = (source: object): string =>
  readRun(
    source,
    HEADING_CLOSING_SEQUENCE_ATTRIBUTE_NAME,
    HEADING_CLOSING_SEQUENCE_PATTERN,
    NO_HEADING_RUN,
  );

export const readHeadingUnderline = (source: object): string =>
  readRun(source, HEADING_UNDERLINE_ATTRIBUTE_NAME, HEADING_UNDERLINE_PATTERN, NO_HEADING_RUN);

// A heading's slice opens at its opening sequence, or at its first content character where it has
// none, whatever the container indented it by, and closes at the end of the line that ends it. An
// ATX heading is that one line, and a setext heading ends on its underline, which is the last line
// of the slice and still carries whatever the container wrote before it. Only a setext heading
// spans more than one line, so the slice also names which of the two forms it holds.
export const findHeadingForm = (raw: string): AuthoredHeadingForm => {
  const lastLine = raw.lastIndexOf("\n");

  if (lastLine >= 0) {
    const underline = SETEXT_UNDERLINE_PATTERN.exec(
      raw.slice(lastLine + 1).replace(TRAILING_WHITESPACE_PATTERN, ""),
    );

    return {
      separator: DEFAULT_HEADING_SEPARATOR,
      closingSequence: NO_HEADING_RUN,
      underline: underline?.[1] ?? NO_HEADING_RUN,
    };
  }

  const line = raw.replace(TRAILING_WHITESPACE_PATTERN, "");
  const empty = EMPTY_ATX_HEADING_PATTERN.exec(line);
  const atx = empty ?? ATX_HEADING_PATTERN.exec(line);

  return {
    separator: (empty ? undefined : atx?.[1]) ?? DEFAULT_HEADING_SEPARATOR,
    closingSequence: (empty ? empty[1] : atx?.[2]) ?? NO_HEADING_RUN,
    underline: NO_HEADING_RUN,
  };
};

// A setext heading's content stands on an ordinary line, so one joined to the paragraph above it
// without a blank line is read back as that paragraph's own text with the underline covering both.
// A tight list item is the only container that joins a paragraph to the block after it this way,
// and the join is read off the serializer rather than off the item's own `spread`, which is what
// decides it.
const continuesPrecedingParagraph = (
  node: HeadingNode,
  parent: StringifyParent,
  state: StringifyState,
) => {
  if (parent?.type !== LIST_ITEM_MARKDOWN_TYPE) {
    return false;
  }

  const index = parent.children.indexOf(node);
  const previous = index > 0 ? parent.children[index - 1] : undefined;

  return (
    previous?.type === PARAGRAPH_MARKDOWN_TYPE &&
    joinsWithoutBlankLine(previous, node, parent, state)
  );
};

// The handler writes an ATX heading as its opening sequence, one space, and the content, and
// closes nothing after it, so the authored form is put back by replacing that space and appending
// the run the file closed the line with. Neither is tracked, which is also how the handler's own
// `closeAtx` writes a closing sequence.
const withAtxHeadingForm = (value: string, node: HeadingNode) => {
  const written = WRITTEN_ATX_HEADING_PATTERN.exec(value);

  if (!written) {
    return value;
  }

  const [, sequence, content] = written;
  const opening =
    content === undefined ? sequence : `${sequence}${readHeadingSeparator(node)}${content}`;

  return opening + readHeadingClosingSequence(node);
};

// The handler sizes the underline to the content it just wrote, which cannot answer for the run a
// heading was authored with. Its character answers for the level rather than the file, so a
// heading moved between levels one and two is underlined by the character that level reads back
// as, at the length the file wrote.
const withSetextHeadingForm = (value: string, written: string, node: HeadingNode) => {
  const underline = readHeadingUnderline(node);

  return underline === NO_HEADING_RUN
    ? value
    : value.slice(0, value.length - written.length) + written.charAt(0).repeat(underline.length);
};

// `mdast-util-to-markdown` chooses between the two heading forms from one option for the whole
// document and sizes each run from the content it wrote, which is what the authored form replaces.
// The choice is reachable only through that option, so it carries the authored form for the length
// of the heading and the runs are put back on the handler's own output.
export const serializeHeading: NonNullable<RemarkStringifyHandlers["heading"]> = (
  node: HeadingNode,
  parent,
  state,
  info,
) => {
  const { closeAtx, setext } = state.options;

  state.options.closeAtx = false;
  state.options.setext =
    readHeadingUnderline(node) !== NO_HEADING_RUN &&
    !continuesPrecedingParagraph(node, parent, state);

  try {
    const value = defaultHandlers.heading(node, parent, state, info);
    const written = WRITTEN_SETEXT_UNDERLINE_PATTERN.exec(value);

    return written
      ? withSetextHeadingForm(value, written[1], node)
      : withAtxHeadingForm(value, node);
  } finally {
    Object.assign(state.options, { closeAtx, setext });
  }
};

// A heading is written on one line, or on a line its underline closes, so a hard break at its end
// has nothing to break onto.
const withoutTrailingHardBreak = (node: ProseNode) => {
  const lastChild = node.lastChild;

  return lastChild?.type.name === HARD_BREAK_NODE_NAME
    ? node.copy(node.content.cut(0, node.content.size - lastChild.nodeSize))
    : node;
};

// The preset's own runners open the mdast node themselves and carry only the level, so each is
// replaced rather than wrapped: the authored form has to reach the node the runner opens.
export const withHeadingForm = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: {
    ...schema.attrs,
    [HEADING_SEPARATOR_ATTRIBUTE_NAME]: {
      default: DEFAULT_HEADING_SEPARATOR,
      validate: "string",
    },
    [HEADING_CLOSING_SEQUENCE_ATTRIBUTE_NAME]: {
      default: NO_HEADING_RUN,
      validate: "string",
    },
    [HEADING_UNDERLINE_ATTRIBUTE_NAME]: {
      default: NO_HEADING_RUN,
      validate: "string",
    },
    [BLOCK_ADJACENT_ATTRIBUTE_NAME]: {
      default: DEFAULT_BLOCK_ADJACENT,
      validate: "boolean",
    },
  },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      state.openNode(type, {
        level: node.depth,
        [HEADING_SEPARATOR_ATTRIBUTE_NAME]: readHeadingSeparator(node),
        [HEADING_CLOSING_SEQUENCE_ATTRIBUTE_NAME]: readHeadingClosingSequence(node),
        [HEADING_UNDERLINE_ATTRIBUTE_NAME]: readHeadingUnderline(node),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node),
      });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      state.openNode(HEADING_MARKDOWN_TYPE, undefined, {
        depth: node.attrs.level,
        [HEADING_SEPARATOR_ATTRIBUTE_NAME]: readHeadingSeparator(node.attrs),
        [HEADING_CLOSING_SEQUENCE_ATTRIBUTE_NAME]: readHeadingClosingSequence(node.attrs),
        [HEADING_UNDERLINE_ATTRIBUTE_NAME]: readHeadingUnderline(node.attrs),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node.attrs),
      });
      state.next(withoutTrailingHardBreak(node).content);
      state.closeNode();
    },
  },
});
