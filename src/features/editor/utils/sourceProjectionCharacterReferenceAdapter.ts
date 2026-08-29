import {
  Fragment,
  Slice,
  type Mark,
  type Node as ProseMirrorNode,
} from "@milkdown/kit/prose/model";
import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";

import {
  CHARACTER_REFERENCE_MARK_NAME,
  CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME,
  decodeWholeCharacterReference,
  readCharacterReferenceRun,
} from "./characterReferenceMarkdown";
import { getCandidateMarksAtPosition, getMarkRangeAtPosition } from "./marks";
import {
  decodeSourceProjectionEscapes,
  mapLiteralSourceOffsetToDocument,
  shouldHandleInlineObjectTextInput,
  type SourceProjectionAdapter,
  type SourceProjectionParseResult,
  type SourceProjectionSessionRange,
  type SourceProjectionTarget,
} from "./sourceProjectionAdapters";
import { getTextBetween } from "./textRanges";

const CHARACTER_REFERENCE_ADAPTER_ID = "character-reference";

interface CharacterReferenceSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: typeof CHARACTER_REFERENCE_ADAPTER_ID;
  ambientMarks: readonly Mark[];
}

const findReferenceMark = (node: ProseMirrorNode | null | undefined) =>
  node?.marks.find((mark) => mark.type.name === CHARACTER_REFERENCE_MARK_NAME) ?? null;

const readMarkSource = (mark: Mark) => {
  const source = mark.attrs[CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME];

  return typeof source === "string" ? source : "";
};

const createMarkedTextSlice = (state: EditorState, text: string, marks: readonly Mark[]) =>
  text ? new Slice(Fragment.from(state.schema.text(text, marks)), 0, 0) : Slice.empty;

// The stored source is projected only where it still spells the text it marks, which is the
// predicate the serializer writes it under. A run the source no longer describes saves as its
// characters, so showing the reference there would promise a form the file will not hold.
//
// References written back to back share one mark range, and each is its own object: the caret
// reaches the one it stands against, and breaking that one leaves its neighbours preserved. A
// position between two belongs to the reference that follows it, as it does between two marks.
const createCharacterReferenceTarget = (
  state: EditorState,
  position: number,
  mark: Mark,
): CharacterReferenceSourceProjectionTarget | null => {
  const range = getMarkRangeAtPosition(state, position, mark);

  if (!range) {
    return null;
  }

  const source = readMarkSource(mark);
  const run = readCharacterReferenceRun(source, getTextBetween(state.doc, range.from, range.to));

  if (!run) {
    return null;
  }

  const size = run.decoded.length;
  const offset = Math.min(position - range.from, run.count * size - 1);
  const from = range.from + Math.floor(offset / size) * size;
  const to = from + size;

  return {
    adapterId: CHARACTER_REFERENCE_ADAPTER_ID,
    ambientMarks: mark.type.removeFromSet(state.doc.resolve(from).nodeAfter?.marks ?? []),
    from,
    originalContent: state.doc.slice(from, to),
    originalContentSize: size,
    originalSource: source,
    to,
  };
};

const findCharacterReferenceTarget = (
  state: EditorState,
): CharacterReferenceSourceProjectionTarget | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || selection.$from.parent !== selection.$to.parent) {
    return null;
  }

  if (selection.empty) {
    const $cursor = selection.$cursor;

    if (!$cursor) {
      return null;
    }

    const markAfter = findReferenceMark($cursor.nodeAfter);
    const targetAfter =
      markAfter && createCharacterReferenceTarget(state, selection.from, markAfter);

    if (targetAfter) {
      return targetAfter;
    }

    const markBefore = findReferenceMark($cursor.nodeBefore);

    return markBefore ? createCharacterReferenceTarget(state, selection.from, markBefore) : null;
  }

  const mark =
    getCandidateMarksAtPosition(state, selection.from).find(
      (candidate) => candidate.type.name === CHARACTER_REFERENCE_MARK_NAME,
    ) ?? null;
  const target = mark && createCharacterReferenceTarget(state, selection.from, mark);

  return target && target.from <= selection.from && selection.to <= target.to ? target : null;
};

// The reference is one character on screen and its source is syntax end to end, so the caret rests
// against it rather than inside it: entering from the left starts at the beginning of the source,
// entering from the right starts at the end.
const mapSelectionPositionToSource = (
  position: number,
  target: CharacterReferenceSourceProjectionTarget,
) => {
  if (position <= target.from) {
    return position;
  }

  return position >= target.to
    ? target.from + target.originalSource.length + (position - target.to)
    : target.from;
};

const mapAtomicSelectionPositionFromSource = (
  position: number,
  session: SourceProjectionSessionRange,
  result: SourceProjectionParseResult,
) => {
  if (position <= session.from) {
    return position;
  }

  return position >= session.to
    ? session.from + result.replacementSize + (position - session.to)
    : session.from;
};

const mapLiteralSelectionPositionFromSource = (
  position: number,
  session: SourceProjectionSessionRange,
  result: SourceProjectionParseResult,
) => {
  if (position <= session.from) {
    return position;
  }

  if (position >= session.to) {
    return session.from + result.replacementSize + (position - session.to);
  }

  return session.from + mapLiteralSourceOffsetToDocument(result.source, position - session.from);
};

const mapSelectionFromSource = (
  selection: Selection,
  session: SourceProjectionSessionRange,
  result: SourceProjectionParseResult,
) => {
  const mapPosition =
    decodeWholeCharacterReference(result.source) === null
      ? mapLiteralSelectionPositionFromSource
      : mapAtomicSelectionPositionFromSource;

  return {
    anchor: mapPosition(selection.anchor, session, result),
    head: mapPosition(selection.head, session, result),
  };
};

export const createCharacterReferenceSourceProjectionAdapter =
  (): SourceProjectionAdapter<CharacterReferenceSourceProjectionTarget> => ({
    id: CHARACTER_REFERENCE_ADAPTER_ID,
    createEnterTransaction: (state, target) =>
      state.tr.replace(
        target.from,
        target.to,
        createMarkedTextSlice(state, target.originalSource, target.ambientMarks),
      ),
    findTarget: findCharacterReferenceTarget,
    getPresentation: ({ ambientMarks }, source) => ({
      sourceTypes: [CHARACTER_REFERENCE_ADAPTER_ID, ...ambientMarks.map((mark) => mark.type.name)],
      spans:
        decodeWholeCharacterReference(source) === null
          ? []
          : [{ className: "leafdown-source-projection__marker", from: 0, to: source.length }],
    }),
    mapSelectionFromSource,
    mapSelectionToSource: (selection, target) => ({
      anchor: mapSelectionPositionToSource(selection.anchor, target),
      head: mapSelectionPositionToSource(selection.head, target),
    }),
    parseSource: (state, source, { ambientMarks }) => {
      const decoded = decodeWholeCharacterReference(source);

      if (decoded) {
        const marks = state.schema.marks[CHARACTER_REFERENCE_MARK_NAME]
          .create({ [CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME]: source })
          .addToSet([...ambientMarks]);

        return {
          replacement: createMarkedTextSlice(state, decoded, marks),
          replacementSize: decoded.length,
          source,
        };
      }

      const literal = decodeSourceProjectionEscapes(source);

      return {
        replacement: createMarkedTextSlice(state, literal, ambientMarks),
        replacementSize: literal.length,
        source,
      };
    },
    restoreCleanTarget: (state, session) =>
      state.tr.replace(session.from, session.to, session.target.originalContent),
    shouldHandleTextInput: shouldHandleInlineObjectTextInput,
  });
