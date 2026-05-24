import type { LineEnding } from "@/stores/session";

export const formatMarkdownForSave = (
  markdown: string,
  lineEnding: LineEnding,
  insertFinalNewline: boolean,
) => {
  const newline = lineEnding === "crlf" ? "\r\n" : "\n";
  const body = markdown.replace(/(?:\r\n|\r|\n)+$/u, "").replace(/\r\n|\r|\n/gu, newline);

  if (!body) {
    return "";
  }

  return insertFinalNewline ? `${body}${newline}` : body;
};
