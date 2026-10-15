import type { LineEnding } from "./documentState";

const LINE_ENDING_PATTERN = /\r\n|\r|\n/gu;
const LF_PATTERN = /\n/gu;
// The text ends on a blank line: two line endings, or one standing alone.
const ENDS_ON_BLANK_LINE_PATTERN = /(?:^|\n)\n$/u;

/**
 * The text a save writes for the Markdown a document holds. A line ending that closes a blank line
 * belongs to that line, which the document keeps under either final-newline setting; the setting
 * decides only the line ending after the last line of content.
 */
export const formatMarkdownForSave = (
  markdown: string,
  lineEnding: LineEnding,
  insertFinalNewline: boolean,
) => {
  const newline = lineEnding === "crlf" ? "\r\n" : "\n";
  const text = markdown.replace(LINE_ENDING_PATTERN, "\n");

  if (ENDS_ON_BLANK_LINE_PATTERN.test(text)) {
    return text.replace(LF_PATTERN, newline);
  }

  const body = text.endsWith("\n") ? text.slice(0, -1) : text;

  if (!body) {
    return "";
  }

  return (insertFinalNewline ? `${body}\n` : body).replace(LF_PATTERN, newline);
};
