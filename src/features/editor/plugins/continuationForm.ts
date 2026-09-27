import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import { CODE_SPAN_MARKDOWN_TYPE } from "../utils/codeMarkdown";
import {
  CONTINUATIONS_ATTRIBUTE_NAME,
  findContinuations,
  HEADING_MARKDOWN_TYPE,
  PARAGRAPH_MARKDOWN_TYPE,
  splitAtomLinePrefix,
} from "../utils/continuationMarkdown";
import { HTML_MARKDOWN_TYPE } from "../utils/rawHtmlMarkdown";

// The blocks whose text stands on lines of its own. A setext heading's underline is one of them:
// the run it spells belongs to the heading's own form, but the whitespace before that run is the
// line's, and the two are independent. An ATX heading holds a line break as a character reference
// and never spans lines, so its slice yields no record at all.
const RECORDED_MARKDOWN_TYPES = new Set([PARAGRAPH_MARKDOWN_TYPE, HEADING_MARKDOWN_TYPE]);

// The inline nodes whose value holds the lines it spans as the parse left them, indentation included.
const ATOM_MARKDOWN_TYPES = new Set([HTML_MARKDOWN_TYPE, CODE_SPAN_MARKDOWN_TYPE]);

const LINE_ENDING_PATTERN = /\r\n|[\n\r]/u;
const SPLIT_LINE_ENDING_PATTERN = /(\r\n|[\n\r])/u;
const LEADING_WHITESPACE_PATTERN = /^[\t ]*/u;

// Hands each line an atom opens inside the part of its record the atom's value does not already
// hold. A value whose lines no longer match the slice's, as a code span's does once the parse strips
// the line ending its padding stood on, keeps the records as they are.
const settleAtomLines = (
  node: MarkdownNode,
  source: string,
  blockStart: number,
  continuations: string[],
) => {
  for (const child of node.children ?? []) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    const value = child.value;

    if (
      ATOM_MARKDOWN_TYPES.has(child.type) &&
      typeof value === "string" &&
      start !== undefined &&
      end !== undefined
    ) {
      // Line endings stand at the odd indexes, so the value's lines stand at the even ones.
      const parts = value.split(SPLIT_LINE_ENDING_PATTERN);
      const first = source.slice(blockStart, start).split(LINE_ENDING_PATTERN).length - 1;

      if (source.slice(start, end).split(LINE_ENDING_PATTERN).length * 2 - 1 === parts.length) {
        for (let index = 2; index < parts.length; index += 2) {
          const line = first + index / 2 - 1;
          const recorded = continuations[line];
          const text = parts[index] ?? "";
          const kept = LEADING_WHITESPACE_PATTERN.exec(text)?.[0] ?? "";
          const split =
            recorded === undefined
              ? undefined
              : splitAtomLinePrefix(recorded, kept, child.type === HTML_MARKDOWN_TYPE);

          if (split !== undefined) {
            continuations[line] = split.prefix;
            parts[index] = split.kept + text.slice(kept.length);
          }
        }

        if (child.type === HTML_MARKDOWN_TYPE) {
          child.value = parts.join("");
        }
      }
    }

    settleAtomLines(child, source, blockStart, continuations);
  }
};

// The parse concatenates a block's lines into its text with whatever each stood behind taken off,
// and records neither the prefixes nor where the lines fell, so the form survives only in the slice
// of the file the node was built from. A node the parser gave no position keeps the default.
const markAuthoredForm = (node: MarkdownNode, source: string) => {
  for (const child of node.children ?? []) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;

    if (RECORDED_MARKDOWN_TYPES.has(child.type) && start !== undefined && end !== undefined) {
      const continuations = findContinuations(source.slice(start, end));

      settleAtomLines(child, source, start, continuations);
      (child as Record<string, unknown>)[CONTINUATIONS_ATTRIBUTE_NAME] = continuations;
    }

    markAuthoredForm(child, source);
  }
};

export const createLeafdownContinuationFormPlugin = () =>
  $remark("leafdownContinuationForm", () => () => (tree, file) => {
    markAuthoredForm(tree as MarkdownNode, String(file));
  });
