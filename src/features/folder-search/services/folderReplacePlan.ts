import { formatMarkdownForSave, type LineEnding } from "@/features/document";
import type { DocumentReplacementPlan, MarkdownSearchTextParser } from "@/features/editor";

import { spliceReplacedLines } from "../utils/lineSplice";

/** The save settings a replaced file is written under, as Save would write it. */
export interface FolderReplaceSaveOptions {
  defaultLineEnding: LineEnding;
  insertFinalNewline: boolean;
}

export type FileReplacementOutcome =
  /** Replacing changes nothing the file holds. */
  | { kind: "unchanged" }
  /** The file would not read as its matches replaced, so it is left out. */
  | { kind: "refused" }
  | {
      kind: "planned";
      content: string;
      /** Whether the file is written as a save writes it, changing text outside the matches. */
      rewritesOtherText: boolean;
    };

/**
 * The text to write for a file no editor holds. Only the lines a replacement changes are written,
 * so lines a save would rewrite in its own form keep the bytes the file has. When those lines
 * cannot be placed on their own, or the result would not read as the file a save writes, the file
 * is written as a save writes it and marked as such.
 */
export const planFileReplacement = (
  parser: Pick<MarkdownSearchTextParser, "normalize">,
  original: string,
  lineEnding: LineEnding | null,
  { baseline, replaced }: DocumentReplacementPlan,
  { defaultLineEnding, insertFinalNewline }: FolderReplaceSaveOptions,
): FileReplacementOutcome => {
  if (replaced === null) {
    return { kind: "refused" };
  }

  if (replaced === baseline) {
    return { kind: "unchanged" };
  }

  const format = (markdown: string) =>
    formatMarkdownForSave(markdown, lineEnding ?? defaultLineEnding, insertFinalNewline);
  const saved = format(replaced);
  const savedBaseline = format(baseline);

  if (savedBaseline === original) {
    return { kind: "planned", content: saved, rewritesOtherText: false };
  }

  const spliced = spliceReplacedLines(original, savedBaseline, saved);

  if (spliced !== null && spliced !== original && format(parser.normalize(spliced)) === saved) {
    return { kind: "planned", content: spliced, rewritesOtherText: false };
  }

  return { kind: "planned", content: saved, rewritesOtherText: true };
};
