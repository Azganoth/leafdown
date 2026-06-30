import type { LineEnding } from "./documentState";

const TRAILING_LINE_ENDINGS_PATTERN = /(?:\r\n|\r|\n)+$/u;
const LINE_ENDING_PATTERN = /\r\n|\r|\n/gu;

export const formatMarkdownForSave = (
  markdown: string,
  lineEnding: LineEnding,
  insertFinalNewline: boolean,
) => {
  const newline = lineEnding === "crlf" ? "\r\n" : "\n";
  const body = markdown
    .replace(TRAILING_LINE_ENDINGS_PATTERN, "")
    .replace(LINE_ENDING_PATTERN, newline);

  if (!body) {
    return "";
  }

  return insertFinalNewline ? `${body}${newline}` : body;
};
