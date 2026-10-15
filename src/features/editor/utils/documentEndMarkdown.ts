import type { MarkdownNode } from "@milkdown/kit/transformer";

import { holdsRawHtmlBlock } from "./blockSeparatorMarkdown";
import { readCodeClosed } from "./codeMarkdown";
import { runsToDocumentEnd } from "./rawHtmlMarkdown";

export const TRAILING_BLANK_LINES_ATTRIBUTE_NAME = "trailingBlankLines";

export const DEFAULT_TRAILING_BLANK_LINES = 0;

const CODE_MARKDOWN_TYPE = "code";
const PARAGRAPH_MARKDOWN_TYPE = "paragraph";

// The containers a line written after the document is handed to, down to the block that ends it.
const END_CONTAINER_MARKDOWN_TYPES = new Set([
  "blockquote",
  "defList",
  "defListDescription",
  "footnoteDefinition",
  "leafdownCallout",
  "list",
  "listItem",
]);

export const readTrailingBlankLines = (source: object): number => {
  const count = (source as Record<string, unknown>)[TRAILING_BLANK_LINES_ATTRIBUTE_NAME];

  return typeof count === "number" ? count : DEFAULT_TRAILING_BLANK_LINES;
};

const isLineEnding = (character: string | undefined) => character === "\n" || character === "\r";
const isLineSpace = (character: string | undefined) => character === " " || character === "\t";

/**
 * The complete lines holding nothing but spaces or tabs that the source ends with. Whitespace on
 * the line its last line ending leaves open is not a line of its own, and is not counted.
 */
export const countTrailingBlankLines = (source: string) => {
  let index = source.length;
  let count = 0;

  while (isLineSpace(source[index - 1])) {
    index -= 1;
  }

  while (isLineEnding(source[index - 1])) {
    index -= source[index - 1] === "\n" && source[index - 2] === "\r" ? 2 : 1;

    let lineStart = index;

    while (isLineSpace(source[lineStart - 1])) {
      lineStart -= 1;
    }

    if (lineStart > 0 && !isLineEnding(source[lineStart - 1])) {
      break;
    }

    count += 1;
    index = lineStart;
  }

  return count;
};

const findLastBlock = (root: MarkdownNode) => {
  let block = root.children?.at(-1);

  while (block && END_CONTAINER_MARKDOWN_TYPES.has(block.type) && block.children?.length) {
    block = block.children.at(-1);
  }

  return block;
};

// A block that runs to the end of the file, such as a fence left open, ends on the root's own last
// line and holds the blank lines before it as content. A wrapper the parse gave no position is
// read through its content, and a block that answers neither keeps the lines it may own.
const reachesDocumentEnd = (root: MarkdownNode) => {
  const block = findLastBlock(root);

  if (block === undefined) {
    return false;
  }

  const end = root.position?.end.line;
  const blockEnd = (block.position ?? block.children?.at(-1)?.position)?.end.line;

  return end === undefined || blockEnd === undefined || blockEnd >= end;
};

/**
 * The blank lines the parsed document ends with, from the count recorded on its root before the
 * parse built any block. Lines the last block holds as its own content are not the document's.
 */
export const readParsedTrailingBlankLines = (root: MarkdownNode) =>
  reachesDocumentEnd(root) ? DEFAULT_TRAILING_BLANK_LINES : readTrailingBlankLines(root);

// A fence left open, and a raw HTML block whose kind closes only on its own end condition, run to
// the end of the file and take every line after them as content.
const runsToEnd = (block: MarkdownNode | undefined) => {
  if (block?.type === CODE_MARKDOWN_TYPE) {
    return !readCodeClosed(block);
  }

  if (block?.type !== PARAGRAPH_MARKDOWN_TYPE || !holdsRawHtmlBlock(block)) {
    return false;
  }

  const value = (block.children?.[0] as { value?: unknown } | undefined)?.value;

  return typeof value === "string" && runsToDocumentEnd(value);
};

/**
 * Writes the document's trailing blank lines after the line ending that closes its last line; a
 * trailing empty paragraph already ends the content on one. Where the last block runs to the end of
 * the file, no line can follow it without becoming part of it, so the record is not written and
 * the final newline is left to the save. A fence left open also writes its last line without the
 * line ending it needs to be read back, which loses an empty last line of its content.
 */
export const writeDocumentEnd = (markdown: string, root: MarkdownNode) => {
  const block = findLastBlock(root);

  if (runsToEnd(block)) {
    return block?.type === CODE_MARKDOWN_TYPE ? `${markdown}\n` : markdown;
  }

  const count = readTrailingBlankLines(root);

  if (count === 0) {
    return markdown;
  }

  const content = markdown === "" || markdown.endsWith("\n") ? markdown : `${markdown}\n`;

  return content + "\n".repeat(count);
};
