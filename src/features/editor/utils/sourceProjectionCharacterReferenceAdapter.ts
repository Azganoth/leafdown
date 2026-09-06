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
  CHARACTER_REFERENCE_TERMINATOR,
  decodeWholeCharacterReference,
  readCharacterReferenceRun,
  readCompletedCharacterReference,
} from "./characterReferenceMarkdown";
import { getCandidateMarksAtPosition, getMarkRangeAtPosition } from "./marks";
import {
  decodeSourceProjectionEscapes,
  getProjectionContentClassName,
  isPlainTextRange,
  mapLiteralSourceOffsetToDocument,
  shouldHandleInlineObjectTextInput,
  type SourceProjectionAdapter,
  type SourceProjectionInsertionCandidate,
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

const createPreservedReferenceSlice = (
  state: EditorState,
  source: string,
  decoded: string,
  ambientMarks: readonly Mark[],
) =>
  createMarkedTextSlice(
    state,
    decoded,
    state.schema.marks[CHARACTER_REFERENCE_MARK_NAME]
      .create({ [CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME]: source })
      .addToSet([...ambientMarks]),
  );

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

// The keystroke that finishes a reference is what converts the run it spells, because nothing read
// off the document could: a file holding an escaped reference opens as the same literal text a
// freshly typed one does, node for node, so a trigger keyed to the caret leaving would convert the
// run the file deliberately escaped.
//
// The plain-text gate answers for the run being text this document holds as itself. A preserved
// reference is inert, on the rule its own escaping already follows, so typing `copy;` after
// `&amp;` leaves the file spelling both rather than converting across the ampersand one of them
// stands for; and a run crossing a mark carries syntax that is not the reference's to close.
const findTypedCharacterReferenceCandidate = (
  state: EditorState,
  position: number,
  text: string,
): SourceProjectionInsertionCandidate<CharacterReferenceSourceProjectionTarget> | null => {
  if (text !== CHARACTER_REFERENCE_TERMINATOR) {
    return null;
  }

  const $position = state.doc.resolve(position);

  if (!$position.parent.isTextblock) {
    return null;
  }

  const completed = readCompletedCharacterReference(
    getTextBetween($position.parent, 0, $position.parentOffset),
  );

  if (!completed) {
    return null;
  }

  const { decoded, source } = completed;
  const from = position - (source.length - CHARACTER_REFERENCE_TERMINATOR.length);

  if (!isPlainTextRange(state, from, position)) {
    return null;
  }

  return {
    closesHistory: true,
    from,
    selectionOffset: source.length,
    target: {
      adapterId: CHARACTER_REFERENCE_ADAPTER_ID,
      ambientMarks: [],
      from,
      originalContent: createPreservedReferenceSlice(state, source, decoded, []),
      originalContentSize: decoded.length,
      originalSource: source,
      to: from + decoded.length,
    },
    to: position,
  };
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
    findInsertionCandidate: findTypedCharacterReferenceCandidate,
    findTarget: findCharacterReferenceTarget,
    getPresentation: ({ ambientMarks }, source) => {
      const decoded = decodeWholeCharacterReference(source);
      const markNames = ambientMarks.map((mark) => mark.type.name);

      return {
        // The widget stands outside the document's marks, so the run's own styling reaches the
        // character through a class rather than through the marks the source carries.
        previews:
          decoded === null
            ? []
            : [{ className: getProjectionContentClassName(markNames), offset: 0, text: decoded }],
        sourceTypes: [CHARACTER_REFERENCE_ADAPTER_ID, ...markNames],
        spans:
          decoded === null
            ? []
            : [{ className: "leafdown-source-projection__marker", from: 0, to: source.length }],
      };
    },
    mapSelectionFromSource,
    mapSelectionToSource: (selection, target) => ({
      anchor: mapSelectionPositionToSource(selection.anchor, target),
      head: mapSelectionPositionToSource(selection.head, target),
    }),
    parseSource: (state, source, { ambientMarks }) => {
      const decoded = decodeWholeCharacterReference(source);

      if (decoded) {
        return {
          replacement: createPreservedReferenceSlice(state, source, decoded, ambientMarks),
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
