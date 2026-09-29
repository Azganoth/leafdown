import type { Node as ProseMirrorNode, ResolvedPos } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";

import { getSourceProjectionCanonicalState } from "../plugins/sourceProjection";

export interface TextStatistics {
  characters: number;
  charactersWithoutSpaces: number;
  words: number;
}

export type BlockPathSegment =
  | {
      kind:
        | "blockquote"
        | "destination"
        | "definitionDescription"
        | "definitionList"
        | "definitionTerm"
        | "footnoteDefinition"
        | "label"
        | "orderedList"
        | "paragraph"
        | "referenceDefinition"
        | "table"
        | "taskList"
        | "title"
        | "unorderedList";
    }
  | { kind: "codeBlock"; language: string | null }
  | { kind: "heading"; level: number }
  | { kind: "tableCell"; row: number; column: number };

export interface EditorDocumentStatus {
  /** The blocks holding a collapsed caret, outermost first; null while a selection is expanded. */
  blockPath: readonly BlockPathSegment[] | null;
  document: TextStatistics;
  selection: TextStatistics | null;
}

const EMPTY_STATISTICS: TextStatistics = { characters: 0, charactersWithoutSpaces: 0, words: 0 };

// Label and definition fields are Markdown metadata the reader never sees as prose.
const UNCOUNTED_NODE_NAMES = new Set(["definition", "footnote_definition_label"]);

const HTML_MARKUP_PATTERN = /<!--[\s\S]*?-->|<[^>]*>/gu;
const WHITESPACE_PATTERN = /^\s+$/u;
const LINE_BREAK_PATTERN = /^[\n\r]+$/u;

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const textblockStatistics = new WeakMap<ProseMirrorNode, TextStatistics>();
const documentStatistics = new WeakMap<ProseMirrorNode, TextStatistics>();

const addStatistics = (total: TextStatistics, next: TextStatistics): TextStatistics => ({
  characters: total.characters + next.characters,
  charactersWithoutSpaces: total.charactersWithoutSpaces + next.charactersWithoutSpaces,
  words: total.words + next.words,
});

const measureText = (text: string): TextStatistics => {
  if (!text) {
    return EMPTY_STATISTICS;
  }

  let words = 0;
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike) {
      words += 1;
    }
  }

  let characters = 0;
  let charactersWithoutSpaces = 0;
  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (LINE_BREAK_PATTERN.test(segment)) {
      continue;
    }

    characters += 1;
    if (!WHITESPACE_PATTERN.test(segment)) {
      charactersWithoutSpaces += 1;
    }
  }

  return { characters, charactersWithoutSpaces, words };
};

// Words never continue across an inline object, so each run of text around one is measured
// on its own; an image's description and live HTML's text are measured as runs of their own.
const measureInlineContent = (textblock: ProseMirrorNode) => {
  let statistics = EMPTY_STATISTICS;
  let run = "";
  const closeRun = () => {
    statistics = addStatistics(statistics, measureText(run));
    run = "";
  };

  textblock.forEach((child) => {
    if (child.isText) {
      run += child.text ?? "";
      return;
    }

    closeRun();

    if (child.type.name === "image") {
      statistics = addStatistics(statistics, measureText(String(child.attrs.alt ?? "")));
    } else if (child.type.name === "html") {
      const text = String(child.attrs.value ?? "").replaceAll(HTML_MARKUP_PATTERN, " ");
      statistics = addStatistics(statistics, measureText(text.trim()));
    }
  });
  closeRun();

  return statistics;
};

const measureTextblock = (textblock: ProseMirrorNode) => {
  const cached = textblockStatistics.get(textblock);

  if (cached) {
    return cached;
  }

  const statistics = measureInlineContent(textblock);
  textblockStatistics.set(textblock, statistics);
  return statistics;
};

const measureRange = (doc: ProseMirrorNode, from: number, to: number) => {
  let statistics = EMPTY_STATISTICS;

  doc.nodesBetween(from, to, (node, position) => {
    if (UNCOUNTED_NODE_NAMES.has(node.type.name)) {
      return false;
    }

    if (!node.isTextblock) {
      return true;
    }

    const contentStart = position + 1;
    const contentEnd = contentStart + node.content.size;
    const measured =
      from <= contentStart && contentEnd <= to
        ? measureTextblock(node)
        : measureInlineContent(
            node.cut(
              Math.max(from, contentStart) - contentStart,
              Math.min(to, contentEnd) - contentStart,
            ),
          );

    statistics = addStatistics(statistics, measured);
    return false;
  });

  return statistics;
};

const getListSegment = (list: ProseMirrorNode, item: ProseMirrorNode | null): BlockPathSegment => {
  if (item?.attrs.checked !== null && item?.attrs.checked !== undefined) {
    return { kind: "taskList" };
  }

  return { kind: list.type.name === "ordered_list" ? "orderedList" : "unorderedList" };
};

const getTableCellSegment = ($position: ResolvedPos, rowDepth: number): BlockPathSegment => ({
  kind: "tableCell",
  row: $position.index(rowDepth - 1) + 1,
  column: $position.index(rowDepth) + 1,
});

const getBlockPathSegment = ($position: ResolvedPos, depth: number): BlockPathSegment | null => {
  const node = $position.node(depth);

  switch (node.type.name) {
    case "paragraph":
      return $position.node(depth - 1).type.name === "table_cell" ||
        $position.node(depth - 1).type.name === "table_header"
        ? null
        : { kind: "paragraph" };
    case "heading":
      return { kind: "heading", level: Number(node.attrs.level) };
    case "blockquote":
      return { kind: "blockquote" };
    case "definition_list":
      return { kind: "definitionList" };
    case "definition_term":
      return { kind: "definitionTerm" };
    case "definition_description":
      return { kind: "definitionDescription" };
    case "bullet_list":
    case "ordered_list":
      return getListSegment(node, depth < $position.depth ? $position.node(depth + 1) : null);
    case "code_block":
      return { kind: "codeBlock", language: String(node.attrs.language ?? "") || null };
    case "table":
      return { kind: "table" };
    case "table_row":
    case "table_header_row":
      return depth < $position.depth ? getTableCellSegment($position, depth) : null;
    case "footnote_definition":
      return { kind: "footnoteDefinition" };
    case "footnote_definition_label":
    case "definition_label":
      return { kind: "label" };
    case "definition":
      return { kind: "referenceDefinition" };
    case "definition_destination":
      return { kind: "destination" };
    case "definition_title":
      return { kind: "title" };
    default:
      return null;
  }
};

const getBlockPath = ($position: ResolvedPos) => {
  const path: BlockPathSegment[] = [];

  for (let depth = 1; depth <= $position.depth; depth += 1) {
    const segment = getBlockPathSegment($position, depth);

    if (segment) {
      path.push(segment);
    }
  }

  return path;
};

const measureDocument = (doc: ProseMirrorNode) => {
  const cached = documentStatistics.get(doc);

  if (cached) {
    return cached;
  }

  const statistics = measureRange(doc, 0, doc.content.size);
  documentStatistics.set(doc, statistics);
  return statistics;
};

export const getEditorDocumentStatus = (state: EditorState): EditorDocumentStatus => {
  const { selection } = state;
  const canonical = getSourceProjectionCanonicalState(state);
  const doc = canonical?.doc ?? state.doc;
  const selectionRanges = canonical
    ? [
        {
          from: Math.min(canonical.anchor, canonical.head),
          to: Math.max(canonical.anchor, canonical.head),
        },
      ]
    : selection.ranges.map((range) => ({ from: range.$from.pos, to: range.$to.pos }));

  return {
    blockPath: selection.empty ? getBlockPath(selection.$head) : null,
    document: measureDocument(doc),
    selection: selection.empty
      ? null
      : selectionRanges.reduce(
          (total, range) => addStatistics(total, measureRange(doc, range.from, range.to)),
          EMPTY_STATISTICS,
        ),
  };
};

export const INACTIVE_EDITOR_DOCUMENT_STATUS: EditorDocumentStatus = {
  blockPath: null,
  document: EMPTY_STATISTICS,
  selection: null,
};

const blockPathSegmentsEqual = (left: BlockPathSegment, right: BlockPathSegment) => {
  const leftEntries = Object.entries(left);

  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([key, value]) => (right as Record<string, unknown>)[key] === value)
  );
};

const statisticsEqual = (left: TextStatistics | null, right: TextStatistics | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.characters === right.characters &&
    left.charactersWithoutSpaces === right.charactersWithoutSpaces &&
    left.words === right.words);

export const editorDocumentStatusesEqual = (
  left: EditorDocumentStatus,
  right: EditorDocumentStatus,
) =>
  statisticsEqual(left.document, right.document) &&
  statisticsEqual(left.selection, right.selection) &&
  (left.blockPath === right.blockPath ||
    (left.blockPath !== null &&
      right.blockPath !== null &&
      left.blockPath.length === right.blockPath.length &&
      left.blockPath.every((segment, index) => {
        const other = right.blockPath?.[index];

        return other !== undefined && blockPathSegmentsEqual(segment, other);
      })));
