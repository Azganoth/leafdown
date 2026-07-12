import { closeHistory } from "@milkdown/kit/prose/history";
import type { Node as ProseMirrorNode, Slice } from "@milkdown/kit/prose/model";
import type { EditorState, Selection, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { isRedoKey, isUndoKey } from "@/lib/input";
import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { isNonNullish } from "@/lib/predicates";

import {
  areProjectionMarksEqual,
  createProjectionMarkDescriptor,
  getProjectionDelimiterBounds,
  getProjectionReplacement,
  getSourceMarkers,
  isProjectionMarkerText,
  isProjectionMarkName,
  normalizeProjectionSourceAfterEdit,
  parseProjectionSource,
  SUPPORTED_PROJECTION_MARK_NAMES,
  type ParsedProjectionSource,
  type ProjectionDelimiterBounds,
  type ProjectionDelimiterSide,
  type ProjectionEditContext,
  type ProjectionEditKind,
  type ProjectionMarkDescriptor,
  type ProjectionReplacement,
} from "../utils/inlineSourceSyntax";
import {
  getCandidateMarksAtSelection,
  getMarkRangeAtSelection,
  type ActiveMarkRange,
} from "../utils/marks";
import { isCaretSelection, isTextCaretSelection } from "../utils/selections";
import { getRangeText, getTextBetween, type TextRange } from "../utils/textRanges";

const EMPTY_PROJECTION_STATE: InlineSourceProjectionPluginState = {
  pendingCommit: null,
  session: null,
  suppressAt: null,
};

export const leafdownInlineSourceProjectionPluginKey =
  new PluginKey<InlineSourceProjectionPluginState>("leafdownInlineSourceProjection");

interface ActiveProjectionRange extends ActiveMarkRange {
  marks: ProjectionMarkDescriptor[];
}

interface ProjectionSession extends TextRange {
  marks: ProjectionMarkDescriptor[];
  originalSource: string;
  originalText: string;
  redoStack: string[];
  undoStack: string[];
}

interface PendingProjectionCommit extends TextRange {
  replacement: ProjectionReplacement;
  selectionAnchor: number;
  selectionHead: number;
  suppressAt: number | null;
}

interface InlineSourceProjectionPluginState {
  pendingCommit: PendingProjectionCommit | null;
  session: ProjectionSession | null;
  suppressAt: number | null;
}

type ProjectionHistoryDirection = "redo" | "undo";

interface ProjectionSourceInsertionCandidate extends TextRange {
  marks: ProjectionMarkDescriptor[];
  originalText: string;
  source: string;
}

interface ProjectionSessionInput {
  from: number;
  marks: ProjectionMarkDescriptor[];
  originalSource: string;
  originalText: string;
}

type ProjectionMeta =
  | { type: "enter"; session: ProjectionSession }
  | { type: "enterFromUserEdit"; session: ProjectionSession }
  | { type: "userEdit"; previousSource: string }
  | { type: "localUndo"; currentSource: string }
  | { type: "localRedo"; currentSource: string }
  | {
      type: "restoreBeforeCommit";
      pendingCommit: PendingProjectionCommit | null;
      suppressAt: number | null;
    }
  | { type: "commitAfterRestore"; suppressAt: number | null };

export const createLeafdownInlineSourceProjectionPlugin = () =>
  $prose(
    () =>
      new Plugin<InlineSourceProjectionPluginState>({
        key: leafdownInlineSourceProjectionPluginKey,
        appendTransaction: (_transactions, _oldState, newState) =>
          appendProjectionTransaction(newState),
        props: {
          decorations: (state) => createProjectionDecorations(state),
          handleKeyDown: (view, event) => handleProjectionKeyDown(view, event),
          handlePaste: (view, event, slice) => handleProjectionPaste(view, event, slice),
          handleTextInput: (view, from, to, text) =>
            handleProjectionTextInput(view, from, to, text),
        },
        state: {
          init: () => EMPTY_PROJECTION_STATE,
          apply: (transaction, pluginState, _oldState, newState) =>
            applyProjectionTransaction(transaction, pluginState, newState),
        },
      }),
  );

export const finalizeInlineSourceProjection = (view: EditorView) => {
  const projectionState = getInlineSourceProjectionState(view.state);

  if (!projectionState.session) {
    return false;
  }

  const transaction = createFinalizeProjectionTransaction(view.state, projectionState.session);

  if (!transaction) {
    return false;
  }

  view.dispatch(transaction);

  return true;
};

export const hasActiveInlineSourceProjection = (state: EditorState) =>
  getInlineSourceProjectionState(state).session !== null;

export const hasTransientInlineSourceProjection = (state: EditorState) => {
  const projectionState = getInlineSourceProjectionState(state);

  return projectionState.session !== null || projectionState.pendingCommit !== null;
};

export const canUndoInlineSourceProjection = (state: EditorState) => {
  const { session } = getInlineSourceProjectionState(state);

  return session !== null && session.undoStack.length > 0;
};

export const canRedoInlineSourceProjection = (state: EditorState) => {
  const { session } = getInlineSourceProjectionState(state);

  return session !== null && session.redoStack.length > 0;
};

export const canDeferInlineSourceProjectionToNativeHistory = (state: EditorState) => {
  const { session } = getInlineSourceProjectionState(state);

  return session !== null && isCleanProjectionSession(state, session);
};

export const undoInlineSourceProjection = (view: EditorView) =>
  runProjectionLocalHistory(view, "undo");

export const redoInlineSourceProjection = (view: EditorView) =>
  runProjectionLocalHistory(view, "redo");

const runProjectionLocalHistory = (view: EditorView, direction: ProjectionHistoryDirection) => {
  const { session } = getInlineSourceProjectionState(view.state);

  if (!session) {
    return false;
  }

  const source = direction === "undo" ? session.undoStack.at(-1) : session.redoStack.at(-1);

  if (source === undefined) {
    if (isCleanProjectionSession(view.state, session)) {
      finalizeInlineSourceProjection(view);

      return false;
    }

    return true;
  }

  const currentSource = getProjectionSource(view.state, session);
  const transaction = replaceProjectionSource(view.state, session, source);
  const metaType = direction === "undo" ? "localUndo" : "localRedo";

  transaction.setMeta("addToHistory", false).setMeta(leafdownInlineSourceProjectionPluginKey, {
    currentSource,
    type: metaType,
  } satisfies ProjectionMeta);

  view.focus();
  view.dispatch(transaction);

  return true;
};

export const pasteIntoInlineSourceProjection = (view: EditorView, text: string) => {
  const session = getInlineSourceProjectionState(view.state).session;
  const { selection } = view.state;

  if (!session || !isRangeInsideProjection(selection, session)) {
    return false;
  }

  if (text.length === 0) {
    return true;
  }

  view.focus();
  dispatchProjectionEdit(view, selection.from, selection.to, text);

  return true;
};

export const isInlineSourceProjectionDirtyTransaction = (transaction: Transaction) => {
  const meta = getProjectionMeta(transaction);

  return meta?.type === "userEdit";
};

export const isInlineSourceProjectionHousekeepingTransaction = (transaction: Transaction) => {
  const meta = getProjectionMeta(transaction);

  return (
    meta?.type === "enter" ||
    meta?.type === "restoreBeforeCommit" ||
    meta?.type === "commitAfterRestore"
  );
};

const getInlineSourceProjectionState = (state: EditorState) =>
  leafdownInlineSourceProjectionPluginKey.getState(state) ?? EMPTY_PROJECTION_STATE;

const getProjectionMeta = (transaction: Transaction) =>
  transaction.getMeta(leafdownInlineSourceProjectionPluginKey) as ProjectionMeta | undefined;

const appendProjectionTransaction = (state: EditorState) => {
  const projectionState = getInlineSourceProjectionState(state);

  if (projectionState.pendingCommit) {
    return createCommitAfterRestoreTransaction(state, projectionState.pendingCommit);
  }

  if (projectionState.session) {
    if (isRangeInsideProjection(state.selection, projectionState.session)) {
      return null;
    }

    return createFinalizeProjectionTransaction(state, projectionState.session);
  }

  if (!isCaretSelection(state)) {
    return null;
  }

  if (projectionState.suppressAt === state.selection.from) {
    return null;
  }

  const activeMarkRange = getActiveProjectionMarkRange(state);

  if (!activeMarkRange) {
    return null;
  }

  return createEnterProjectionTransaction(state, activeMarkRange);
};

const applyProjectionTransaction = (
  transaction: Transaction,
  pluginState: InlineSourceProjectionPluginState,
  newState: EditorState,
): InlineSourceProjectionPluginState => {
  const meta = getProjectionMeta(transaction);

  if (meta?.type === "enter" || meta?.type === "enterFromUserEdit") {
    return {
      pendingCommit: null,
      session: meta.session,
      suppressAt: null,
    };
  }

  if (meta?.type === "restoreBeforeCommit") {
    return {
      pendingCommit: meta.pendingCommit,
      session: null,
      suppressAt: meta.suppressAt,
    };
  }

  if (meta?.type === "commitAfterRestore") {
    return {
      pendingCommit: null,
      session: null,
      suppressAt: meta.suppressAt,
    };
  }

  const suppressAt = getMappedSuppressPosition(pluginState.suppressAt, transaction);

  if (!pluginState.session) {
    return {
      ...pluginState,
      suppressAt,
    };
  }

  const session = mapProjectionSession(pluginState.session, transaction);

  if (meta?.type === "userEdit") {
    const nextSource = getProjectionSource(newState, session);

    return {
      pendingCommit: null,
      session: {
        ...session,
        redoStack: [],
        undoStack:
          meta.previousSource === nextSource
            ? session.undoStack
            : [...session.undoStack, meta.previousSource],
      },
      suppressAt,
    };
  }

  if (meta?.type === "localUndo") {
    return {
      pendingCommit: null,
      session: {
        ...session,
        redoStack: [...session.redoStack, meta.currentSource],
        undoStack: session.undoStack.slice(0, -1),
      },
      suppressAt,
    };
  }

  if (meta?.type === "localRedo") {
    return {
      pendingCommit: null,
      session: {
        ...session,
        redoStack: session.redoStack.slice(0, -1),
        undoStack: [...session.undoStack, meta.currentSource],
      },
      suppressAt,
    };
  }

  if (transaction.docChanged && !isRangeInsideProjection(newState.selection, session)) {
    return {
      pendingCommit: null,
      session: null,
      suppressAt,
    };
  }

  return {
    ...pluginState,
    session,
    suppressAt,
  };
};

const getMappedSuppressPosition = (suppressAt: number | null, transaction: Transaction) => {
  if (suppressAt === null) {
    return null;
  }

  const mappedSuppressAt = transaction.docChanged
    ? transaction.mapping.map(suppressAt, -1)
    : suppressAt;

  if (transaction.selectionSet && transaction.selection.from !== mappedSuppressAt) {
    return null;
  }

  return mappedSuppressAt;
};

const createProjectionDecorations = (state: EditorState) => {
  const session = getInlineSourceProjectionState(state).session;

  if (!session) {
    return DecorationSet.empty;
  }

  const source = getProjectionSource(state, session);
  const parsed = parseProjectionSource(source);
  const decorations = [
    Decoration.inline(session.from, session.to, {
      class: "leafdown-inline-source-projection",
      "data-leafdown-inline-source": session.marks.map((mark) => mark.markName).join(" "),
    }),
  ];

  if (parsed.type === "mark") {
    decorations.push(
      Decoration.inline(session.from, session.from + parsed.opening.length, {
        class: "leafdown-inline-source-projection__marker",
      }),
      Decoration.inline(session.from + parsed.opening.length, session.to - parsed.closing.length, {
        class: getProjectionContentClassName(parsed.marks),
      }),
      Decoration.inline(session.to - parsed.closing.length, session.to, {
        class: "leafdown-inline-source-projection__marker",
      }),
    );
  }

  return DecorationSet.create(state.doc, decorations);
};

const getProjectionContentClassName = (marks: ProjectionMarkDescriptor[]) =>
  [
    "leafdown-inline-source-projection__content",
    marks.some((mark) => mark.markName === "strong") &&
      "leafdown-inline-source-projection__content--strong",
    marks.some((mark) => mark.markName === "emphasis") &&
      "leafdown-inline-source-projection__content--emphasis",
    marks.some((mark) => mark.markName === "strike_through") &&
      "leafdown-inline-source-projection__content--strikethrough",
    marks.some((mark) => mark.markName === "inlineCode") &&
      "leafdown-inline-source-projection__content--inline-code",
  ]
    .filter(isNonNullish)
    .join(" ");

const handleProjectionTextInput = (view: EditorView, from: number, to: number, text: string) => {
  const session = getInlineSourceProjectionState(view.state).session;

  if (!session) {
    return handleProjectionSourceTextInput(view, from, to, text);
  }

  if (!isRangeInsideProjection({ from, to }, session)) {
    return false;
  }

  if (isOuterProjectionTextInsertion(session, from, to, text)) {
    return false;
  }

  dispatchProjectionEdit(view, from, to, text);

  return true;
};

const isOuterProjectionTextInsertion = (
  session: ProjectionSession,
  from: number,
  to: number,
  text: string,
) =>
  from === to &&
  text.length > 0 &&
  !isProjectionMarkerText(text) &&
  (from === session.from || from === session.to);

const handleProjectionSourceTextInput = (
  view: EditorView,
  from: number,
  to: number,
  text: string,
) => {
  if (from !== to || !isProjectionMarkerText(text)) {
    return false;
  }

  const candidate = getProjectionSourceInsertionCandidate(view.state, from, text);

  if (!candidate) {
    return false;
  }

  const transaction = replaceProjectionRange(
    view.state.tr,
    candidate.from,
    candidate.to,
    getLiteralTextReplacement(view.state, candidate.source),
  );

  transaction
    .setSelection(TextSelection.create(transaction.doc, candidate.from + text.length))
    .setStoredMarks([])
    .setMeta(leafdownInlineSourceProjectionPluginKey, {
      session: createProjectionSession({
        from: candidate.from,
        marks: candidate.marks,
        originalSource: candidate.source,
        originalText: candidate.originalText,
      }),
      type: "enterFromUserEdit",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  view.dispatch(transaction);

  return true;
};

const getProjectionSourceInsertionCandidate = (
  state: EditorState,
  position: number,
  markerText: string,
): ProjectionSourceInsertionCandidate | null => {
  if (markerText.length !== 1) {
    return null;
  }

  const $position = state.doc.resolve(position);

  if (!$position.parent.isTextblock) {
    return null;
  }

  const textAfter = getTextBetween(
    $position.parent,
    $position.parentOffset,
    $position.parent.content.size,
  );
  const closingMarkerIndex = textAfter.indexOf(markerText);

  if (closingMarkerIndex <= 0) {
    return null;
  }

  const source = `${markerText}${textAfter.slice(0, closingMarkerIndex + markerText.length)}`;
  const parsed = parseProjectionSource(source);

  if (parsed.type !== "mark") {
    return null;
  }

  const to = position + source.length - markerText.length;

  if (!isPlainTextRange(state, position, to)) {
    return null;
  }

  return {
    from: position,
    marks: parsed.marks,
    originalText: parsed.text,
    source,
    to,
  };
};

const isPlainTextRange = (state: EditorState, from: number, to: number) => {
  let isPlain = true;

  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText) {
      if (node.marks.length > 0) {
        isPlain = false;
        return false;
      }

      return true;
    }

    if (node.isInline) {
      isPlain = false;
      return false;
    }

    return true;
  });

  return isPlain;
};

const handleProjectionPaste = (view: EditorView, event: ClipboardEvent, slice: Slice) => {
  const session = getInlineSourceProjectionState(view.state).session;
  const { selection } = view.state;

  if (!session || !isRangeInsideProjection(selection, session)) {
    return false;
  }

  const text =
    event.clipboardData?.getData(TEXT_PLAIN_MIME_TYPE) ??
    getTextBetween(slice.content, 0, Number.MAX_SAFE_INTEGER);

  if (!text) {
    return false;
  }

  event.preventDefault();
  dispatchProjectionEdit(view, selection.from, selection.to, text);

  return true;
};

const handleProjectionKeyDown = (view: EditorView, event: KeyboardEvent) => {
  const session = getInlineSourceProjectionState(view.state).session;

  if (!session) {
    return false;
  }

  if (isUndoKey(event)) {
    const didUndo = undoInlineSourceProjection(view);

    if (didUndo) {
      event.preventDefault();
    }

    return didUndo;
  }

  if (isRedoKey(event)) {
    const didRedo = redoInlineSourceProjection(view);

    if (didRedo) {
      event.preventDefault();
    }

    return didRedo;
  }

  if (event.key === "Enter" || event.key === "Escape") {
    event.preventDefault();
    finalizeInlineSourceProjection(view);

    return true;
  }

  if (event.key !== "Backspace" && event.key !== "Delete") {
    return false;
  }

  const range = getDeletionRange(view.state, session, event.key);

  if (!range) {
    return false;
  }

  event.preventDefault();
  dispatchProjectionEdit(view, range.from, range.to, "");

  return true;
};

const dispatchProjectionEdit = (view: EditorView, from: number, to: number, text: string) => {
  const session = getInlineSourceProjectionState(view.state).session;

  if (!session) {
    return;
  }

  const previousSource = getProjectionSource(view.state, session);
  const edit = getProjectionEdit(previousSource, from - session.from, to - session.from, text);
  const editedSource = `${previousSource.slice(0, edit.from)}${text}${previousSource.slice(edit.to)}`;
  const nextSource = normalizeProjectionSourceAfterEdit(editedSource, edit.context);
  const nextRelativePosition = Math.min(edit.from + text.length, nextSource.length);
  const transaction = replaceProjectionRange(
    view.state.tr,
    session.from,
    session.to,
    getLiteralTextReplacement(view.state, nextSource),
  );
  const nextPosition = session.from + nextRelativePosition;

  transaction
    .setSelection(
      TextSelection.create(
        transaction.doc,
        Math.min(Math.max(nextPosition, session.from), transaction.doc.content.size),
      ),
    )
    .setStoredMarks([])
    .setMeta("addToHistory", false)
    .setMeta(leafdownInlineSourceProjectionPluginKey, {
      previousSource,
      type: "userEdit",
    } satisfies ProjectionMeta);

  view.dispatch(transaction);
};

const getProjectionEditKind = (from: number, to: number, text: string): ProjectionEditKind => {
  if (text.length > 0 && from === to) {
    return "insert";
  }

  if (text.length === 0) {
    return "delete";
  }

  return "replace";
};

const getProjectionEdit = (
  source: string,
  from: number,
  to: number,
  text: string,
): TextRange & { context: ProjectionEditContext } => {
  const normalizedFrom = Math.min(Math.max(from, 0), source.length);
  const normalizedTo = Math.min(Math.max(to, normalizedFrom), source.length);
  const kind = getProjectionEditKind(normalizedFrom, normalizedTo, text);
  const delimiterSide = getProjectionEditedDelimiterSide(
    source,
    normalizedFrom,
    normalizedTo,
    text,
  );

  if (kind === "insert" && !isProjectionMarkerText(text)) {
    const bounds = getProjectionDelimiterBounds(source);
    const remappedPosition = bounds
      ? getContentBoundaryInsertionPosition(bounds, normalizedFrom)
      : normalizedFrom;

    return {
      context: { delimiterSide: null, kind },
      from: remappedPosition,
      to: remappedPosition,
    };
  }

  return {
    context: { delimiterSide, kind },
    from: normalizedFrom,
    to: normalizedTo,
  };
};

const getProjectionEditedDelimiterSide = (
  source: string,
  from: number,
  to: number,
  text: string,
): ProjectionDelimiterSide | null => {
  const bounds = getProjectionDelimiterBounds(source);

  if (!bounds) {
    return null;
  }

  if (isProjectionMarkerText(text) && from === to) {
    if (from <= bounds.contentFrom) {
      return "opening";
    }

    if (from >= bounds.contentTo) {
      return "closing";
    }

    return null;
  }

  if (text.length === 0) {
    if (from < bounds.contentFrom) {
      return "opening";
    }

    if (to > bounds.contentTo) {
      return "closing";
    }
  }

  return null;
};

const getContentBoundaryInsertionPosition = (
  bounds: ProjectionDelimiterBounds,
  position: number,
) => {
  if (position <= bounds.contentFrom) {
    return bounds.contentFrom;
  }

  if (position >= bounds.contentTo) {
    return bounds.contentTo;
  }

  return position;
};

const createProjectionSession = ({
  from,
  marks,
  originalSource,
  originalText,
}: ProjectionSessionInput): ProjectionSession => ({
  from,
  marks,
  originalSource,
  originalText,
  redoStack: [],
  to: from + originalSource.length,
  undoStack: [],
});

const getDeletionRange = (
  state: EditorState,
  session: ProjectionSession,
  key: "Backspace" | "Delete",
): TextRange | null => {
  const { selection } = state;

  if (!isRangeInsideProjection(selection, session)) {
    return null;
  }

  if (!selection.empty) {
    return selection;
  }

  if (key === "Backspace") {
    return getPreviousCharacterRange(state, session, selection.from);
  }

  return getNextCharacterRange(state, session, selection.from);
};

const getPreviousCharacterRange = (
  state: EditorState,
  session: ProjectionSession,
  position: number,
): TextRange | null => {
  if (position <= session.from) {
    return null;
  }

  const textBefore = getTextBetween(state.doc, session.from, position);
  const character = Array.from(textBefore).at(-1);

  if (!character) {
    return null;
  }

  return {
    from: position - character.length,
    to: position,
  };
};

const getNextCharacterRange = (
  state: EditorState,
  session: ProjectionSession,
  position: number,
): TextRange | null => {
  if (position >= session.to) {
    return null;
  }

  const textAfter = getTextBetween(state.doc, position, session.to);
  const character = Array.from(textAfter)[0];

  if (!character) {
    return null;
  }

  return {
    from: position,
    to: position + character.length,
  };
};

const createEnterProjectionTransaction = (state: EditorState, range: ActiveProjectionRange) => {
  const originalText = getRangeText(state.doc, range);
  const sourceMarkers = getSourceMarkers(range.marks, originalText);
  const originalSource = `${sourceMarkers.opening}${originalText}${sourceMarkers.closing}`;
  const selectionOffset = Math.min(
    Math.max(state.selection.from - range.from, 0),
    originalText.length,
  );
  const selectionPosition = range.from + sourceMarkers.opening.length + selectionOffset;
  const session = createProjectionSession({
    from: range.from,
    marks: range.marks,
    originalSource,
    originalText,
  });
  const transaction = state.tr
    .replaceWith(range.to, range.to, state.schema.text(sourceMarkers.closing))
    .replaceWith(range.from, range.from, state.schema.text(sourceMarkers.opening));

  transaction
    .setSelection(TextSelection.create(transaction.doc, selectionPosition))
    .setStoredMarks([])
    .setMeta("addToHistory", false)
    .setMeta(leafdownInlineSourceProjectionPluginKey, {
      session,
      type: "enter",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  return transaction;
};

const createFinalizeProjectionTransaction = (
  state: EditorState,
  session: ProjectionSession,
): Transaction | null => {
  const source = getProjectionSource(state, session);
  const parsed = parseProjectionSource(source);
  const replacement = getProjectionReplacement(parsed);
  const shouldSuppressProjectionAtSelection = isRangeInsideProjection(state.selection, session);
  const restoreSelection = getMappedFinalizeSelection(
    state.selection,
    session,
    session.originalText.length,
    parsed,
  );
  const commitSelection = getMappedFinalizeSelection(
    state.selection,
    session,
    replacement.text.length,
    parsed,
  );
  const suppressAt =
    shouldSuppressProjectionAtSelection && restoreSelection.anchor === restoreSelection.head
      ? restoreSelection.anchor
      : null;

  if (source === session.originalSource && parsed.type === "mark") {
    return createCleanFinalizeProjectionTransaction(
      state,
      session,
      parsed,
      restoreSelection,
      suppressAt,
    );
  }

  return createRestoreBeforeCommitTransaction({
    commitSelection,
    replacement,
    restoreSelection,
    session,
    shouldSuppressProjectionAtSelection,
    source,
    state,
    suppressAt,
  });
};

interface RestoreBeforeCommitTransactionInput {
  commitSelection: { anchor: number; head: number };
  replacement: ProjectionReplacement;
  restoreSelection: { anchor: number; head: number };
  session: ProjectionSession;
  shouldSuppressProjectionAtSelection: boolean;
  source: string;
  state: EditorState;
  suppressAt: number | null;
}

const createRestoreBeforeCommitTransaction = ({
  commitSelection,
  replacement,
  restoreSelection,
  session,
  shouldSuppressProjectionAtSelection,
  source,
  state,
  suppressAt,
}: RestoreBeforeCommitTransactionInput) => {
  const pendingCommit =
    source === session.originalSource
      ? null
      : {
          from: session.from,
          replacement,
          selectionAnchor: commitSelection.anchor,
          selectionHead: commitSelection.head,
          suppressAt:
            shouldSuppressProjectionAtSelection && commitSelection.anchor === commitSelection.head
              ? commitSelection.anchor
              : null,
          to: session.from + session.originalText.length,
        };
  const transaction = replaceProjectionRange(
    state.tr,
    session.from,
    session.to,
    getMarkedTextReplacement(state, session.originalText, session.marks),
  );

  transaction
    .setSelection(
      TextSelection.create(transaction.doc, restoreSelection.anchor, restoreSelection.head),
    )
    .setStoredMarks([])
    .setMeta("addToHistory", false)
    .setMeta(leafdownInlineSourceProjectionPluginKey, {
      pendingCommit,
      suppressAt,
      type: "restoreBeforeCommit",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  return transaction;
};

const createCleanFinalizeProjectionTransaction = (
  state: EditorState,
  session: ProjectionSession,
  parsed: Extract<ParsedProjectionSource, { type: "mark" }>,
  restoreSelection: { anchor: number; head: number },
  suppressAt: number | null,
) => {
  const transaction = state.tr;

  transaction
    .delete(session.to - parsed.closing.length, session.to)
    .delete(session.from, session.from + parsed.opening.length);

  const markFrom = session.from;
  const markTo = session.from + session.originalText.length;

  if (markFrom < markTo) {
    for (const mark of session.marks) {
      transaction.addMark(markFrom, markTo, state.schema.marks[mark.markName].create(mark.attrs));
    }
  }

  transaction
    .setSelection(
      TextSelection.create(transaction.doc, restoreSelection.anchor, restoreSelection.head),
    )
    .setStoredMarks([])
    .setMeta("addToHistory", false)
    .setMeta(leafdownInlineSourceProjectionPluginKey, {
      pendingCommit: null,
      suppressAt,
      type: "restoreBeforeCommit",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  return transaction;
};

const createCommitAfterRestoreTransaction = (
  state: EditorState,
  pendingCommit: PendingProjectionCommit,
) => {
  const replacement =
    pendingCommit.replacement.type === "marked"
      ? getMarkedTextReplacement(
          state,
          pendingCommit.replacement.text,
          pendingCommit.replacement.marks,
        )
      : getLiteralTextReplacement(state, pendingCommit.replacement.text);
  const transaction = replaceProjectionRange(
    state.tr,
    pendingCommit.from,
    pendingCommit.to,
    replacement,
  );

  transaction
    .setSelection(
      TextSelection.create(
        transaction.doc,
        pendingCommit.selectionAnchor,
        pendingCommit.selectionHead,
      ),
    )
    .setStoredMarks([])
    .setMeta(leafdownInlineSourceProjectionPluginKey, {
      suppressAt: pendingCommit.suppressAt,
      type: "commitAfterRestore",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  return closeHistory(transaction);
};

const getMappedFinalizeSelection = (
  selection: Selection,
  session: ProjectionSession,
  replacementLength: number,
  parsed: ParsedProjectionSource,
) => ({
  anchor: getMappedFinalizeSelectionPosition(selection.anchor, session, replacementLength, parsed),
  head: getMappedFinalizeSelectionPosition(selection.head, session, replacementLength, parsed),
});

const getMappedFinalizeSelectionPosition = (
  position: number,
  session: ProjectionSession,
  replacementLength: number,
  parsed: ParsedProjectionSource,
) => {
  if (position <= session.from) {
    return position;
  }

  if (position >= session.to) {
    return session.from + replacementLength + (position - session.to);
  }

  const sourceOffset = position - session.from;

  if (parsed.type === "literal") {
    return session.from + Math.min(Math.max(sourceOffset, 0), replacementLength);
  }

  if (sourceOffset <= parsed.opening.length) {
    return session.from;
  }

  const closingStart = session.to - session.from - parsed.closing.length;

  if (sourceOffset >= closingStart) {
    return session.from + replacementLength;
  }

  return (
    session.from + Math.min(Math.max(sourceOffset - parsed.opening.length, 0), replacementLength)
  );
};

const replaceProjectionSource = (
  state: EditorState,
  session: ProjectionSession,
  source: string,
) => {
  const transaction = replaceProjectionRange(
    state.tr,
    session.from,
    session.to,
    getLiteralTextReplacement(state, source),
  );
  const selectionPosition = session.from + source.length;

  return transaction
    .setSelection(TextSelection.create(transaction.doc, selectionPosition))
    .setStoredMarks([])
    .scrollIntoView();
};

const replaceProjectionRange = (
  transaction: Transaction,
  from: number,
  to: number,
  replacement: ProseMirrorNode | null,
) => {
  if (!replacement) {
    return transaction.delete(from, to);
  }

  return transaction.replaceWith(from, to, replacement);
};

const getMarkedTextReplacement = (
  state: EditorState,
  text: string,
  marks: ProjectionMarkDescriptor[],
) => {
  if (text.length === 0) {
    return null;
  }

  return state.schema.text(
    text,
    marks.map((mark) => state.schema.marks[mark.markName].create(mark.attrs)),
  );
};

const getLiteralTextReplacement = (state: EditorState, text: string) => {
  if (text.length === 0) {
    return null;
  }

  return state.schema.text(text);
};

const getActiveProjectionMarkRange = (state: EditorState): ActiveProjectionRange | null => {
  const { selection } = state;

  if (!isTextCaretSelection(selection)) {
    return null;
  }

  const candidateMarks = getCandidateMarksAtSelection(state);

  for (const markName of SUPPORTED_PROJECTION_MARK_NAMES) {
    const markType = state.schema.marks[markName];
    if (!markType) {
      continue;
    }

    const activeMark = candidateMarks.find((mark) => mark.type === markType) ?? null;

    if (!activeMark) {
      continue;
    }

    const range = getMarkRangeAtSelection(state, activeMark);
    if (!range) {
      continue;
    }

    const marks = getProjectionMarksForRange(state, range);

    if (marks) {
      return {
        ...range,
        marks,
      };
    }
  }

  return null;
};

const getProjectionMarksForRange = (
  state: EditorState,
  range: ActiveMarkRange,
): ProjectionMarkDescriptor[] | null => {
  let supportedMarks: ProjectionMarkDescriptor[] | null = null;

  state.doc.nodesBetween(range.from, range.to, (node) => {
    if (node.isText) {
      const projectionMarks = getProjectionMarksFromTextNode(node);

      if (
        !projectionMarks.length ||
        !projectionMarks.some((mark) => mark.markName === range.mark.type.name) ||
        (supportedMarks && !areProjectionMarksEqual(supportedMarks, projectionMarks))
      ) {
        supportedMarks = null;
        return false;
      }

      supportedMarks ??= projectionMarks;

      return true;
    }

    if (node.isInline) {
      supportedMarks = null;
      return false;
    }

    return true;
  });

  return supportedMarks;
};

const getProjectionMarksFromTextNode = (node: ProseMirrorNode): ProjectionMarkDescriptor[] => {
  const inlineCode = node.marks.find((mark) => mark.type.name === "inlineCode");

  if (inlineCode) {
    return node.marks.length === 1
      ? [createProjectionMarkDescriptor("inlineCode", inlineCode.attrs)]
      : [];
  }

  if (node.marks.some((mark) => !isProjectionMarkName(mark.type.name))) {
    return [];
  }

  return SUPPORTED_PROJECTION_MARK_NAMES.flatMap((markName) => {
    const mark = node.marks.find((candidateMark) => candidateMark.type.name === markName);

    if (!mark) {
      return [];
    }

    return [createProjectionMarkDescriptor(markName, mark.attrs)];
  });
};

const isRangeInsideProjection = (range: TextRange, session: ProjectionSession) =>
  session.from <= range.from && range.to <= session.to;

const mapProjectionSession = (session: ProjectionSession, transaction: Transaction) => {
  if (!transaction.docChanged) {
    return session;
  }

  return {
    ...session,
    from: transaction.mapping.map(session.from, 1),
    to: transaction.mapping.map(session.to, -1),
  };
};

const getProjectionSource = (state: EditorState, session: ProjectionSession) =>
  getRangeText(state.doc, session);

const isCleanProjectionSession = (state: EditorState, session: ProjectionSession) =>
  getProjectionSource(state, session) === session.originalSource;
