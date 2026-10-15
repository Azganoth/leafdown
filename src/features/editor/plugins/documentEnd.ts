import { AllSelection, Plugin, type Selection, type Transaction } from "@milkdown/kit/prose/state";
import { ReplaceStep } from "@milkdown/kit/prose/transform";
import { $prose, $remark } from "@milkdown/kit/utils";

import {
  countTrailingBlankLines,
  DEFAULT_TRAILING_BLANK_LINES,
  readTrailingBlankLines,
  TRAILING_BLANK_LINES_ATTRIBUTE_NAME,
} from "../utils/documentEndMarkdown";

/// Records on the root the blank lines the source ends with, which no block holds a position for
/// once the parse has built them.
export const createLeafdownDocumentEndRemarkPlugin = () =>
  $remark("leafdownDocumentEnd", () => () => (tree, file) => {
    (tree as unknown as Record<string, unknown>)[TRAILING_BLANK_LINES_ATTRIBUTE_NAME] =
      typeof file.value === "string"
        ? countTrailingBlankLines(file.value)
        : DEFAULT_TRAILING_BLANK_LINES;
  });

// Typing, deleting, cutting, or pasting over Select All replaces the document the blank lines
// followed. Every other edit, including one that replaces every block from a narrower selection,
// leaves them after whichever block now ends the document.
const replacesWholeDocument = (transaction: Transaction, selection: Selection) =>
  selection instanceof AllSelection &&
  transaction.steps.some(
    (step, index) =>
      step instanceof ReplaceStep &&
      step.from === 0 &&
      step.to === transaction.docs[index]?.content.size,
  );

/// Clears the document's trailing blank lines with the content a whole-document replacement
/// removes. The change is appended to the replacement, so history undoes and redoes both together.
export const createLeafdownDocumentEndPlugin = () =>
  $prose(
    () =>
      new Plugin({
        appendTransaction: (transactions, oldState, newState) => {
          if (readTrailingBlankLines(newState.doc.attrs) === DEFAULT_TRAILING_BLANK_LINES) {
            return null;
          }

          let selection = oldState.selection;

          for (const transaction of transactions) {
            if (
              transaction.getMeta("addToHistory") !== false &&
              replacesWholeDocument(transaction, selection)
            ) {
              return newState.tr.setDocAttribute(
                TRAILING_BLANK_LINES_ATTRIBUTE_NAME,
                DEFAULT_TRAILING_BLANK_LINES,
              );
            }

            selection = transaction.selection;
          }

          return null;
        },
      }),
  );
