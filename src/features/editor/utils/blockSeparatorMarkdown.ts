import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { NodeSchema } from "@milkdown/kit/transformer";

import { interruptsParagraphAsHtmlBlock, RAW_HTML_MARKDOWN_TYPE } from "./rawHtmlMarkdown";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["root"]>>[2];

interface SeparatorNode {
  type: string;
  title?: string | null;
  children?: readonly SeparatorNode[];
}

export const BLOCK_ADJACENT_ATTRIBUTE_NAME = "adjacent";

// The separator a block is written with when it carries no record of one: one the editor created,
// and one whose authored separator cannot be recovered. A blank line is the separator every pair
// of blocks reads back as the two blocks that wrote it.
export const DEFAULT_BLOCK_ADJACENT = false;

const PARAGRAPH_MARKDOWN_TYPE = "paragraph";
const BLOCKQUOTE_MARKDOWN_TYPE = "blockquote";
const CODE_MARKDOWN_TYPE = "code";
const DEFINITION_MARKDOWN_TYPE = "definition";
const FOOTNOTE_DEFINITION_MARKDOWN_TYPE = "footnoteDefinition";
const HEADING_MARKDOWN_TYPE = "heading";
const HTML_MARKDOWN_TYPE = "html";
const LIST_MARKDOWN_TYPE = "list";
const LIST_ITEM_MARKDOWN_TYPE = "listItem";
const TABLE_MARKDOWN_TYPE = "table";
const THEMATIC_BREAK_MARKDOWN_TYPE = "thematicBreak";

// CommonMark replaces U+0000 with U+FFFD while parsing, so no block can carry one and the marker
// cannot collide with document content. A deferred escape spends the same character and is always
// followed by ASCII punctuation, which is what keeps the two apart in the assembled document.
const BLOCK_SEPARATOR_MARKER = "\u0000j";

const TRAILING_WHITESPACE_PATTERN = /[\t ]+$/u;

// The constructs that open a block on a line the paragraph above it would otherwise continue. A
// container writes its own prefix onto the line afterwards, so the line is read here as the block
// wrote it, without one.
const ATX_HEADING_PATTERN = /^#{1,6}(?:[\t ]|$)/u;
// An info string cannot hold a backtick when the fence is spelled with them, which is the one case
// where a run of three opens no block. A fence carries whatever indentation it was authored with,
// and CommonMark still reads one under three spaces, so the run is not always first on the line.
const CODE_FENCE_PATTERN = /^ {0,3}(?:`{3,}[^`]*|~{3,}.*)$/u;
const BLOCKQUOTE_PATTERN = /^>/u;
// A marker interrupts only where the item it opens holds content on the marker's own line, and an
// ordered list interrupts only where it starts at one.
const BULLET_LIST_ITEM_PATTERN = /^[-+*][\t ]+\S/u;
const ORDERED_LIST_ITEM_PATTERN = /^1[.)][\t ]+\S/u;
// GFM opens a footnote definition on its label wherever the line stands, which a link reference
// definition's own label does not do.
const FOOTNOTE_DEFINITION_PATTERN = /^\[\^[^\]]+\]:/u;
// A thematic break spends three markers or more, counted across the line rather than inside one
// run of it, and admits nothing else but spaces and tabs.
const THEMATIC_BREAK_PATTERNS: Record<string, RegExp> = {
  "*": /^(?:[\t ]*\*){3,}[\t ]*$/u,
  "-": /^(?:[\t ]*-){3,}[\t ]*$/u,
  _: /^(?:[\t ]*_){3,}[\t ]*$/u,
};
// A run of hyphens carrying nothing else underlines the paragraph above it instead of breaking it,
// which is the same reading `serializeThematicBreak` gives way to inside a tight list item.
const SETEXT_UNDERLINE_PATTERN = /^-+$/u;
// A definition takes its title from the line after it where it was written without one, so a line
// opening one is read as part of the definition rather than as the block it was authored as.
const TITLE_OPENERS = "\"'(";

// What the block before this one does with the line that follows it, which is what decides whether
// the blank line between them can go.
type PrecedingBlock =
  // A raw HTML block runs to the next blank line, so the blank line is what ends it.
  | "html"
  // A heading, a thematic break, and a fence the serializer closes each end on a line of their own,
  // and any block may open on the line after them.
  | "closed"
  // A definition ends at its title, and takes one from the line below where it holds none.
  | "definition"
  // Everything else ends with a paragraph a plain line continues or a table a plain line extends,
  // so only a line that opens a block of its own can follow it.
  | "open";

// A container hands the line after it to the block it ends with: a blockquote and a list item both
// continue their last paragraph lazily, so the separator is decided by the innermost block rather
// than by the sibling that holds it. A table's rows are not blocks and a raw HTML block's value is
// not one either, so neither is descended into.
const CONTAINER_MARKDOWN_TYPES = new Set([
  BLOCKQUOTE_MARKDOWN_TYPE,
  FOOTNOTE_DEFINITION_MARKDOWN_TYPE,
  LIST_MARKDOWN_TYPE,
  LIST_ITEM_MARKDOWN_TYPE,
]);

const CLOSED_MARKDOWN_TYPES = new Set([
  CODE_MARKDOWN_TYPE,
  HEADING_MARKDOWN_TYPE,
  THEMATIC_BREAK_MARKDOWN_TYPE,
]);

// The preset wraps a block-level raw HTML node in a paragraph, so the block reaches the serializer
// as a paragraph holding one HTML node and nothing else. A paragraph holding HTML beside its own
// text is ordinary text and ends where any paragraph does.
const holdsRawHtmlBlock = (node: SeparatorNode) => {
  const [child, ...rest] = node.children ?? [];

  return (
    rest.length === 0 &&
    (child?.type === HTML_MARKDOWN_TYPE || child?.type === RAW_HTML_MARKDOWN_TYPE)
  );
};

export const readBlockAdjacent = (source: object): boolean =>
  (source as Record<string, unknown>)[BLOCK_ADJACENT_ATTRIBUTE_NAME] === true;

const findInnermostBlock = (node: SeparatorNode): SeparatorNode | undefined => {
  let block: SeparatorNode | undefined = node;

  while (block && CONTAINER_MARKDOWN_TYPES.has(block.type)) {
    block = block.children?.[block.children.length - 1];
  }

  return block;
};

const classifyPrecedingBlock = (node: SeparatorNode): PrecedingBlock => {
  const block = findInnermostBlock(node);

  if (block === undefined) {
    return "open";
  }

  if (block.type === PARAGRAPH_MARKDOWN_TYPE) {
    return holdsRawHtmlBlock(block) ? "html" : "open";
  }

  if (CLOSED_MARKDOWN_TYPES.has(block.type)) {
    return "closed";
  }

  return block.type === DEFINITION_MARKDOWN_TYPE ? "definition" : "open";
};

const opensThematicBreak = (line: string) => {
  const pattern = THEMATIC_BREAK_PATTERNS[line.charAt(0)];

  return pattern !== undefined && pattern.test(line) && !SETEXT_UNDERLINE_PATTERN.test(line);
};

// Whether the block the serializer just wrote opens on a line the paragraph above it cannot take
// as its own. The written line answers this rather than the node, because a construct can be
// written in a form that opens nothing: a setext heading opens on ordinary text, an item whose
// content begins below its marker leaves that marker alone on the line, and a run of hyphens
// underlines the paragraph above instead of breaking it.
const interruptsParagraph = (node: SeparatorNode, value: string) => {
  // A table writes a header row and the delimiter row beneath it, which is the pair GFM reads as a
  // table wherever it lands, so the form is decided by the node rather than measured again here.
  if (node.type === TABLE_MARKDOWN_TYPE) {
    return true;
  }

  const line = value.split("\n")[0] ?? "";

  return (
    ATX_HEADING_PATTERN.test(line) ||
    CODE_FENCE_PATTERN.test(line) ||
    BLOCKQUOTE_PATTERN.test(line) ||
    BULLET_LIST_ITEM_PATTERN.test(line) ||
    ORDERED_LIST_ITEM_PATTERN.test(line) ||
    FOOTNOTE_DEFINITION_PATTERN.test(line) ||
    opensThematicBreak(line) ||
    interruptsParagraphAsHtmlBlock(line)
  );
};

// A definition without a title reads the line below it as one, so a block opening on a title's
// quote or parenthesis would be swallowed into the definition rather than left as itself.
const opensDefinitionTitle = (previous: SeparatorNode, value: string) =>
  !previous.title && TITLE_OPENERS.includes(value.charAt(0));

const findPrecedingSibling = (node: SeparatorNode, parent: SeparatorNode | undefined) => {
  const index = parent?.children?.indexOf(node) ?? -1;

  return index > 0 ? parent?.children?.[index - 1] : undefined;
};

// Whether the blank line the serializer puts between two blocks can be taken back out. The pair is
// decided here rather than at the node, because dropping a separator is the direction that merges
// two blocks: a heading edited into a paragraph still carries the separator the heading was
// authored with, and the file has to be written as the document reads now.
export const joinsPrecedingBlock = (
  node: SeparatorNode,
  parent: SeparatorNode | undefined,
  value: string,
) => {
  const previous = findPrecedingSibling(node, parent);

  if (previous === undefined) {
    return false;
  }

  switch (classifyPrecedingBlock(previous)) {
    case "html": {
      return false;
    }
    case "closed": {
      return true;
    }
    case "definition": {
      return !opensDefinitionTitle(previous, value);
    }
    default: {
      return interruptsParagraph(node, value);
    }
  }
};

// The blank line between two blocks is written before the second block is, so no handler can weigh
// it against the block it separates. Marking the block instead leaves the separator decidable in
// the assembled document, where `resolveBlockSeparators` takes the line back out.
export const markBlockSeparators = (state: StringifyState) => {
  const handle = state.handle;
  const marked = (node: SeparatorNode, parent: never, handleState: never, info: never) => {
    const value = handle(node, parent, handleState, info);

    return readBlockAdjacent(node) && joinsPrecedingBlock(node, parent, value)
      ? BLOCK_SEPARATOR_MARKER + value
      : value;
  };

  // `containerPhrasing` peeks the next child through `handle.handlers` rather than through the
  // handler itself, so the zwitch's own fields are carried over. Peeking past the wrapper is also
  // what keeps a marker out of the one character the peek reads.
  state.handle = Object.assign(marked, handle);

  return () => {
    state.handle = handle;
  };
};

// A container writes its own prefix onto every line it holds, including the blank one, so the line
// a marker cancels is the one spelling that prefix and nothing else.
export const resolveBlockSeparators = (document: string) => {
  let text = document;
  let index = text.indexOf(BLOCK_SEPARATOR_MARKER);

  while (index >= 0) {
    const lineStart = text.lastIndexOf("\n", index - 1) + 1;
    const prefix = text.slice(lineStart, index).replace(TRAILING_WHITESPACE_PATTERN, "");
    const previousStart = lineStart === 0 ? -1 : text.lastIndexOf("\n", lineStart - 2) + 1;
    const separates =
      previousStart >= 0 &&
      text.slice(previousStart, lineStart - 1).replace(TRAILING_WHITESPACE_PATTERN, "") === prefix;
    const written = text.slice(0, index) + text.slice(index + BLOCK_SEPARATOR_MARKER.length);

    text = separates ? written.slice(0, previousStart) + written.slice(lineStart) : written;
    index = text.indexOf(BLOCK_SEPARATOR_MARKER);
  }

  return text;
};

const blockAdjacentAttrs = {
  [BLOCK_ADJACENT_ATTRIBUTE_NAME]: {
    default: DEFAULT_BLOCK_ADJACENT,
    validate: "boolean",
  },
} as const;

// The preset's own runners open the mdast node themselves and carry only the fields they know, so
// each is replaced rather than wrapped: the authored separator has to reach the node the runner
// opens. Only the two blocks Leafdown holds no other form for are replaced here; the rest carry
// the separator alongside the form their own module already writes.
export const withBlockquoteSeparator = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: { ...schema.attrs, ...blockAdjacentAttrs },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      state
        .openNode(type, { [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node) })
        .next(node.children)
        .closeNode();
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      state
        .openNode(BLOCKQUOTE_MARKDOWN_TYPE, undefined, {
          [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node.attrs),
        })
        .next(node.content)
        .closeNode();
    },
  },
});

export const withFootnoteDefinitionSeparator = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: { ...schema.attrs, ...blockAdjacentAttrs },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      state
        .openNode(type, {
          label: node.label as string,
          [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node),
        })
        .next(node.children)
        .closeNode();
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      state
        .openNode(FOOTNOTE_DEFINITION_MARKDOWN_TYPE, undefined, {
          label: node.attrs.label,
          identifier: node.attrs.label,
          [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node.attrs),
        })
        .next(node.content)
        .closeNode();
    },
  },
});
