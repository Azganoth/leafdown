import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { NodeSchema } from "@milkdown/kit/transformer";
import { defaultHandlers } from "mdast-util-to-markdown";

import {
  BLOCK_ADJACENT_ATTRIBUTE_NAME,
  DEFAULT_BLOCK_ADJACENT,
  readBlockAdjacent,
} from "./blockSeparatorMarkdown";
import { markContinuationLines, readPrefixColumns } from "./linePrefixMarkdown";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["paragraph"]>>[2];

type JoinArguments = Parameters<StringifyState["join"][number]>;

// Milkdown types a stringify handler's node as `any`, so the block is named here from the blocks
// the serializer joins.
type ParagraphNode = Extract<JoinArguments[0], { type: "paragraph" }>;

export const PARAGRAPH_MARKDOWN_TYPE = "paragraph";
export const HEADING_MARKDOWN_TYPE = "heading";
export const CONTINUATIONS_ATTRIBUTE_NAME = "continuations";

// The lines a block carries when it holds no record of them: one the editor created, and one whose
// authored lines cannot be recovered. Each continuation line is then written with the prefix its
// containers spell, which is the form every block whose text spans lines reads back as.
export const DEFAULT_CONTINUATIONS: readonly string[] = [];

const HARD_BREAK_NODE_NAME = "hardbreak";

// Everything a continuation line stands behind: the quote markers it repeats and the whitespace
// after them. A parse strips the indentation such a line opens with and reads a bare `>` as a
// quote rather than as content, so the run is the prefix and what follows it is the line.
const CONTINUATION_PREFIX_PATTERN = /^(?:[\t ]*>)*[\t ]*/u;
// CommonMark ends a line on a carriage return, a line feed, or the pair, and a file spelling its
// endings either of the first two ways still holds the lines a record answers for.
const LINE_ENDING_PATTERN = /\r\n|[\n\r]/u;

export const validateContinuations = (value: unknown) => {
  if (!Array.isArray(value) || value.some((line) => typeof line !== "string")) {
    throw new RangeError("Expected a line prefix for each of a block's later lines");
  }
};

export const readContinuations = (source: object): string[] => {
  const recorded = (source as Record<string, unknown>)[CONTINUATIONS_ATTRIBUTE_NAME];

  return Array.isArray(recorded) && recorded.every((line) => typeof line === "string")
    ? [...recorded]
    : [...DEFAULT_CONTINUATIONS];
};

/// Reads what each line after a block's first stood behind in the file. Exported for colocated
/// tests.
export const findContinuations = (raw: string): string[] =>
  raw
    .split(LINE_ENDING_PATTERN)
    .slice(1)
    .map((line) => CONTINUATION_PREFIX_PATTERN.exec(line)?.[0] ?? "");

export interface AtomLinePrefix {
  // What the line's record stands for once the atom holds the rest.
  prefix: string;
  // The whitespace the atom's value opens the line with.
  kept: string;
}

/// Splits what a line stood behind between its record and the inline atom the line opens inside.
/// The parse takes at most three columns of indentation off a line that opens inside raw HTML and
/// none off one that opens inside a code span, and the value keeps the rest, so a record holding the
/// whole run would write that rest a second time. A tab the parse took only part of leaves the value
/// holding a space for each column it did not take. Raw HTML reads the whitespace between its
/// attributes the same however it is spelled, so its value takes the tab the file wrote. A code span
/// holds those spaces as content, so its record writes the part the parse took off as spaces instead,
/// which puts the value at the column it stood at. Exported for colocated tests.
export const splitAtomLinePrefix = (
  recorded: string,
  kept: string,
  valueSpellsTab: boolean,
): AtomLinePrefix | undefined => {
  if (recorded.endsWith(kept)) {
    return { kept, prefix: recorded.slice(0, recorded.length - kept.length) };
  }

  for (let spaces = 1; kept.charAt(spaces - 1) === " "; spaces += 1) {
    const rest = kept.slice(spaces);

    if (recorded.endsWith(`\t${rest}`)) {
      const before = recorded.slice(0, recorded.length - rest.length - 1);

      if (valueSpellsTab) {
        return { kept: `\t${rest}`, prefix: before };
      }

      const padding =
        readPrefixColumns(recorded.slice(0, before.length + 1)) -
        spaces -
        readPrefixColumns(before);

      return padding < 0 ? undefined : { kept, prefix: before + " ".repeat(padding) };
    }
  }

  return undefined;
};

export const serializeParagraph: NonNullable<RemarkStringifyHandlers["paragraph"]> = (
  node: ParagraphNode,
  parent,
  state,
  info,
) =>
  markContinuationLines(
    defaultHandlers.paragraph(node, parent, state, info),
    readContinuations(node),
  );

// The preset's own runner opens the mdast node itself and carries only the children, so it is
// replaced rather than wrapped: the authored form has to reach the node the runner opens. The
// separator every block carries travels with it, the way each block Leafdown holds another form
// for carries it in that form's own module.
export const withParagraphForm = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: {
    ...schema.attrs,
    [CONTINUATIONS_ATTRIBUTE_NAME]: {
      default: DEFAULT_CONTINUATIONS,
      validate: validateContinuations,
    },
    [BLOCK_ADJACENT_ATTRIBUTE_NAME]: {
      default: DEFAULT_BLOCK_ADJACENT,
      validate: "boolean",
    },
  },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      state.openNode(type, {
        [CONTINUATIONS_ATTRIBUTE_NAME]: readContinuations(node),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node),
      });

      if (node.children) {
        state.next(node.children);
      } else {
        state.addText((node.value as string | undefined) ?? "");
      }

      state.closeNode();
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      state.openNode(PARAGRAPH_MARKDOWN_TYPE, undefined, {
        [CONTINUATIONS_ATTRIBUTE_NAME]: readContinuations(node.attrs),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node.attrs),
      });
      // A paragraph ends its line where its last child ends, so a hard break there has nothing to
      // break onto and the preset drops it. Rebuilding the runner keeps that.
      state.next(
        node.lastChild?.type.name === HARD_BREAK_NODE_NAME
          ? node.content.cut(0, node.content.size - node.lastChild.nodeSize)
          : node.content,
      );
      state.closeNode();
    },
  },
});
