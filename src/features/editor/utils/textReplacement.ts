import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";

import { settleFootnoteDefinitionLabels } from "../plugins/footnoteDefinitionLabel";
import { settleReferenceDefinitionFields } from "../plugins/referenceDefinitionFields";
import { settleSourceProjection } from "../plugins/sourceProjection";
import { CHARACTER_REFERENCE_MARK_NAME } from "./characterReferenceMarkdown";
import type { TextRange } from "./textRanges";
import {
  findDocumentTextMatches,
  getSearchableText,
  SEARCHABLE_TEXT_SEPARATOR,
  type SearchableTextRange,
  type TextSearchQuery,
} from "./textSearch";

// The replacement takes the formatting the replaced text started with. That is read from the text
// itself rather than as typing would, which drops a link or code span ending with the match. A
// character reference names the one character it was written for, so it does not carry over.
export const replaceTextRange = (
  transaction: Transaction,
  range: TextRange,
  replacement: string,
) => {
  const from = transaction.mapping.map(range.from);
  const to = transaction.mapping.map(range.to);

  if (replacement === "") {
    return transaction.delete(from, to);
  }

  const marks = (transaction.doc.resolve(from).nodeAfter?.marks ?? []).filter(
    (mark) => mark.type.name !== CHARACTER_REFERENCE_MARK_NAME,
  );

  return transaction.replaceWith(from, to, transaction.doc.type.schema.text(replacement, marks));
};

/** Replaces every range, last first, so the earlier ranges still name the text they did. */
export const replaceTextRanges = (
  transaction: Transaction,
  ranges: readonly TextRange[],
  replacement: string,
) => {
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    replaceTextRange(transaction, ranges[index], replacement);
  }

  return transaction;
};

/** The state a save writes from, settled on a copy so that nothing is dispatched. */
export const settleStateForSave = (state: EditorState) =>
  settleReferenceDefinitionFields(settleFootnoteDefinitionLabels(settleSourceProjection(state)));

export interface DocumentReplacementPlan {
  /** The searchable text before the replacement, which the matches index into. */
  text: string;
  matches: SearchableTextRange[];
  /** The Markdown a save writes as the document stands, or empty when nothing matches. */
  baseline: string;
  /**
   * The Markdown a save writes once every match is replaced, or null when the document would not
   * read as the matches replaced, such as a footnote label that cannot take the new text. It is
   * the baseline when nothing matches.
   */
  replaced: string | null;
}

const getReplacedText = (
  text: string,
  matches: readonly SearchableTextRange[],
  replacement: string,
) => {
  let result = "";
  let offset = 0;

  for (const { end, start } of matches) {
    result += text.slice(offset, start) + replacement;
    offset = end;
  }

  // A run emptied by the replacement is no run at all, as it is in the document it leaves.
  return (result + text.slice(offset))
    .split(SEARCHABLE_TEXT_SEPARATOR)
    .filter((run) => run !== "")
    .join(SEARCHABLE_TEXT_SEPARATOR);
};

/**
 * Replaces every match in a settled copy of `state` as `Replace all` would, and reads the Markdown
 * a save would write before and after, without dispatching anything.
 */
export const planStateReplacement = (
  state: EditorState,
  query: TextSearchQuery,
  replacement: string,
  serialize: (doc: ProseMirrorNode) => string,
): DocumentReplacementPlan => {
  const settled = settleStateForSave(state);
  const searchable = getSearchableText(settled.doc);
  const found = findDocumentTextMatches(searchable, query);
  const matches = found.map(({ offsets }) => offsets);

  // Most files of a folder hold no match, and serializing one costs about as much as reading it.
  if (found.length === 0) {
    return { text: searchable.text, matches, baseline: "", replaced: "" };
  }

  const baseline = serialize(settled.doc);

  const transaction = replaceTextRanges(
    settled.tr,
    found.map(({ range }) => range),
    replacement,
  );
  const next = settleStateForSave(settled.applyTransaction(transaction).state);
  const expected = getReplacedText(searchable.text, matches, replacement);

  return {
    text: searchable.text,
    matches,
    baseline,
    replaced: getSearchableText(next.doc).text === expected ? serialize(next.doc) : null,
  };
};
