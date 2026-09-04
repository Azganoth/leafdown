import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { NodeSchema } from "@milkdown/kit/transformer";
import { defaultHandlers } from "mdast-util-to-markdown";

import {
  BLOCK_ADJACENT_ATTRIBUTE_NAME,
  DEFAULT_BLOCK_ADJACENT,
  readBlockAdjacent,
} from "./blockSeparatorMarkdown";

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

// CommonMark replaces U+0000 with U+FFFD while parsing, so no block can carry one and the
// marker cannot collide with document content. A block separator spends `j` after it and a
// deferred escape spends ASCII punctuation, so neither reads as this one. The pair brackets the
// authored prefix, which leaves the run readable however the prefix is spelled.
const CONTINUATION_MARKER = "\u0000c";

const WHITESPACE_PATTERN = /[\t ]/u;
// What a container spells on the lines under the one it opens on, split into the parts a line has
// to match to stay inside it: a quote marker, and the indentation an item's content stands at.
// A run of indentation is one part because matching it is matching each item it stacks in turn.
const CONTAINER_PART_PATTERN = /[\t ]{0,3}>[\t ]?|[\t ]+/gu;
// CommonMark opens no leaf block four columns deep, and indented code cannot interrupt a
// paragraph, so a line the file indented that far carries no block marker whatever it spells.
const BLOCK_OPENING_INDENT = 4;
// The block markers `state.safe` escapes at a line start that spell nothing else. An asterisk, an
// underscore, a backtick, or a tilde there could equally delimit a mark, and a bracket or an angle
// could open a link or raw HTML, so those stay with the passes that answer against the whole line.
const BLOCK_MARKERS = "#+-=>";
// A marker CommonMark reads at most nine digits ahead of, escaped on the delimiter rather than on
// the digits that lead it.
const ORDERED_MARKER_PATTERN = /^(\d{1,9})\\([.)])/u;

interface ContinuationLine {
  // Whether a block marker at the line's content could open the block it spells.
  opens: boolean;
  // Whether the containers the document holds now still take the prefix the file wrote.
  restorable: boolean;
}

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

const readIndent = (authored: string, from: number) => {
  let indent = 0;

  while (WHITESPACE_PATTERN.test(authored.charAt(from + indent))) {
    indent += 1;
  }

  return indent;
};

// How the prefix the file wrote stands against the one the containers spell. A tab counts as the
// single character it is rather than as the columns it advances, which can only leave the line
// measured shallower than the file wrote it, and a line measured shallow keeps its escapes.
const readContinuationLine = (written: string, authored: string): ContinuationLine => {
  let index = 0;
  let measured = true;

  for (const part of written.match(CONTAINER_PART_PATTERN) ?? []) {
    if (part.includes(">")) {
      let marker = index;

      while (marker - index < 3 && WHITESPACE_PATTERN.test(authored.charAt(marker))) {
        marker += 1;
      }

      // A quote the line does not spell closes every container inside it, so nothing further along
      // the line takes a column and what stands there is indentation the line carries.
      if (authored.charAt(marker) !== ">") {
        break;
      }

      index = marker + 1;

      if (WHITESPACE_PATTERN.test(authored.charAt(index))) {
        index += 1;
      }

      continue;
    }

    // A run of indentation stacks every item it covers into one part, so a line spelling only some
    // of it hides which of them still took their share and how many columns that left.
    if (readIndent(authored, index) < part.length) {
      measured = false;
      break;
    }

    index += part.length;
  }

  const indent = readIndent(authored, index);

  return {
    opens: !measured || indent < BLOCK_OPENING_INDENT,
    // A prefix spelling a container the document no longer holds would open one of its own, which
    // costs content rather than form. Anything the containers do not take has to be indentation.
    restorable: index + indent === authored.length,
  };
};

const withoutBlockMarkerEscape = (content: string) => {
  if (content.charAt(0) === "\\" && BLOCK_MARKERS.includes(content.charAt(1))) {
    return content.slice(1);
  }

  return content.replace(ORDERED_MARKER_PATTERN, "$1$2");
};

/// Puts each marked line behind the prefix the file wrote it with. A container writes its own
/// prefix onto every line it holds, so the prefix standing before a marker is the one the
/// containers spell and the authored one takes its place. The escapes go back with it: `state.safe`
/// escapes a block marker wherever a line could open one, and a line the file indented four columns
/// past its containers opens none. The document is read once, a line at a time, because a paragraph
/// the file hard-wrapped carries a marker on every line it holds and each line carries only the one
/// its own block wrote.
export const resolveContinuations = (document: string) => {
  const resolved: string[] = [];
  let read = 0;
  let index = document.indexOf(CONTINUATION_MARKER);

  while (index >= 0) {
    const start = index + CONTINUATION_MARKER.length;
    const close = document.indexOf(CONTINUATION_MARKER, start);
    const lineStart = document.lastIndexOf("\n", index - 1) + 1;
    const lineEnd = document.indexOf("\n", start);
    const end = lineEnd < 0 ? document.length : lineEnd;
    const written = document.slice(lineStart, index);

    resolved.push(document.slice(read, lineStart));

    // A marker the closing one never followed stands for no prefix, which leaves the line as the
    // containers wrote it.
    if (close < 0 || close > end) {
      resolved.push(written, document.slice(start, end));
    } else {
      const authored = document.slice(start, close);
      const content = document.slice(close + CONTINUATION_MARKER.length, end);
      const line = readContinuationLine(written, authored);

      resolved.push(
        line.restorable ? authored : written,
        line.restorable && !line.opens ? withoutBlockMarkerEscape(content) : content,
      );
    }

    read = end;
    index = document.indexOf(CONTINUATION_MARKER, end);
  }

  resolved.push(document.slice(read));

  return resolved.join("");
};

/// Marks each line a record answers for. A block writes its lines with nothing in front of them and
/// the containers holding it add their prefix afterwards, so the line a record answers for is only
/// identifiable once every handler has run; `resolveContinuations` puts the authored prefix in place
/// of the one the containers wrote. A line the record does not reach keeps that prefix, which is
/// what answers for a block the editor has since added a line to.
export const markContinuationLines = (value: string, continuations: readonly string[]) => {
  if (continuations.length === 0) {
    return value;
  }

  return value
    .split("\n")
    .map((line, index) => {
      const authored = index === 0 ? undefined : continuations[index - 1];

      return authored === undefined || line === ""
        ? line
        : CONTINUATION_MARKER + authored + CONTINUATION_MARKER + line;
    })
    .join("\n");
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
