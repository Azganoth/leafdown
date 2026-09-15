import { inlineCodeSchema } from "@milkdown/kit/preset/commonmark";
import { markRule } from "@milkdown/kit/prose";
import { $inputRule } from "@milkdown/kit/utils";

import { findCellCodeSpanPipeEscapes, isInsideTableCell } from "../utils/codeMarkdown";
import { readEnclosingInlineConstructs } from "../utils/logicalLinkMarkdown";

const CODE_SPAN_INPUT_RULE = /(?:`)([^`]+)(?:`)$/u;

// The preset's rule keeps the content as typed. A cell reads a backslash before a pipe back out of
// a code span, so the span typed there holds what the file would read from the same source.
export const createLeafdownCodeSpanInputRule = () =>
  $inputRule((ctx) =>
    markRule(CODE_SPAN_INPUT_RULE, inlineCodeSchema.type(ctx), {
      beforeDispatch: ({ match, start, tr }) => {
        if (!isInsideTableCell(readEnclosingInlineConstructs(tr.doc.resolve(start)))) {
          return;
        }

        for (const offset of findCellCodeSpanPipeEscapes(match[1]).toReversed()) {
          tr.delete(start + offset, start + offset + 1);
        }
      },
    }),
  );
