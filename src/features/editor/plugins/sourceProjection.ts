import { closeHistory } from "@milkdown/kit/prose/history";
import type { Slice } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { isRedoKey, isUndoKey } from "@/lib/input";
import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";

import { isCaretSelection } from "../utils/selections";
import {
  createLiteralSourceProjectionSlice,
  findSourceProjectionTarget,
  getSourceProjectionAdapter,
  getSourceProjectionInsertionCandidate,
  type SourceProjectionTarget,
} from "../utils/sourceProjectionAdapters";
import {
  getProjectionDelimiterBounds,
  isProjectionMarkerText,
  normalizeProjectionSourceAfterEdit,
  type ProjectionDelimiterBounds,
  type ProjectionDelimiterSide,
  type ProjectionEditContext,
  type ProjectionEditKind,
} from "../utils/sourceProjectionSyntax";
import { getRangeText, getTextBetween, type TextRange } from "../utils/textRanges";

const EMPTY_PROJECTION_STATE: SourceProjectionPluginState = {
  pendingCommit: null,
  session: null,
  suppressAt: null,
};

export const leafdownSourceProjectionPluginKey = new PluginKey<SourceProjectionPluginState>(
  "leafdownSourceProjection",
);

interface ProjectionSession extends TextRange {
  redoStack: string[];
  target: SourceProjectionTarget;
  undoStack: string[];
}

interface PendingProjectionCommit extends TextRange {
  replacement: Slice;
  selectionAnchor: number;
  selectionHead: number;
  suppressAt: number | null;
}

interface SourceProjectionPluginState {
  pendingCommit: PendingProjectionCommit | null;
  session: ProjectionSession | null;
  suppressAt: number | null;
}

type ProjectionHistoryDirection = "redo" | "undo";

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

export const createLeafdownSourceProjectionPlugin = () =>
  $prose(
    () =>
      new Plugin<SourceProjectionPluginState>({
        key: leafdownSourceProjectionPluginKey,
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

export const finalizeSourceProjection = (view: EditorView) => {
  const projectionState = getSourceProjectionState(view.state);

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

export const hasActiveSourceProjection = (state: EditorState) =>
  getSourceProjectionState(state).session !== null;

export const hasTransientSourceProjection = (state: EditorState) => {
  const projectionState = getSourceProjectionState(state);

  return projectionState.session !== null || projectionState.pendingCommit !== null;
};

export const canUndoSourceProjection = (state: EditorState) => {
  const { session } = getSourceProjectionState(state);

  return session !== null && session.undoStack.length > 0;
};

export const canRedoSourceProjection = (state: EditorState) => {
  const { session } = getSourceProjectionState(state);

  return session !== null && session.redoStack.length > 0;
};

export const canDeferSourceProjectionToNativeHistory = (state: EditorState) => {
  const { session } = getSourceProjectionState(state);

  return session !== null && isCleanProjectionSession(state, session);
};

export const undoSourceProjection = (view: EditorView) => runProjectionLocalHistory(view, "undo");

export const redoSourceProjection = (view: EditorView) => runProjectionLocalHistory(view, "redo");

const runProjectionLocalHistory = (view: EditorView, direction: ProjectionHistoryDirection) => {
  const { session } = getSourceProjectionState(view.state);

  if (!session) {
    return false;
  }

  const source = direction === "undo" ? session.undoStack.at(-1) : session.redoStack.at(-1);

  if (source === undefined) {
    if (isCleanProjectionSession(view.state, session)) {
      finalizeSourceProjection(view);

      return false;
    }

    return true;
  }

  const currentSource = getProjectionSource(view.state, session);
  const transaction = replaceProjectionSource(view.state, session, source);
  const metaType = direction === "undo" ? "localUndo" : "localRedo";

  transaction.setMeta("addToHistory", false).setMeta(leafdownSourceProjectionPluginKey, {
    currentSource,
    type: metaType,
  } satisfies ProjectionMeta);

  view.focus();
  view.dispatch(transaction);

  return true;
};

export const pasteIntoSourceProjection = (view: EditorView, text: string) => {
  const session = getSourceProjectionState(view.state).session;
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

export const isSourceProjectionDirtyTransaction = (transaction: Transaction) => {
  const meta = getProjectionMeta(transaction);

  return meta?.type === "userEdit";
};

export const isSourceProjectionHousekeepingTransaction = (transaction: Transaction) => {
  const meta = getProjectionMeta(transaction);

  return (
    meta?.type === "enter" ||
    meta?.type === "restoreBeforeCommit" ||
    meta?.type === "commitAfterRestore"
  );
};

const getSourceProjectionState = (state: EditorState) =>
  leafdownSourceProjectionPluginKey.getState(state) ?? EMPTY_PROJECTION_STATE;

const getProjectionMeta = (transaction: Transaction) =>
  transaction.getMeta(leafdownSourceProjectionPluginKey) as ProjectionMeta | undefined;

const appendProjectionTransaction = (state: EditorState) => {
  const projectionState = getSourceProjectionState(state);

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

  const target = findSourceProjectionTarget(state);

  if (!target) {
    return null;
  }

  return createEnterProjectionTransaction(state, target);
};

const applyProjectionTransaction = (
  transaction: Transaction,
  pluginState: SourceProjectionPluginState,
  newState: EditorState,
): SourceProjectionPluginState => {
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
  const session = getSourceProjectionState(state).session;

  if (!session) {
    return DecorationSet.empty;
  }

  const source = getProjectionSource(state, session);
  const presentation = getSourceProjectionAdapter(session.target).getPresentation(
    session.target,
    source,
  );
  const decorations = [
    Decoration.inline(session.from, session.to, {
      class: "leafdown-source-projection",
      "data-leafdown-source": presentation.sourceTypes.join(" "),
    }),
  ];

  if (presentation.contentClassName) {
    decorations.push(
      Decoration.inline(session.from, session.from + presentation.openingLength, {
        class: "leafdown-source-projection__marker",
      }),
      Decoration.inline(
        session.from + presentation.openingLength,
        session.to - presentation.closingLength,
        {
          class: presentation.contentClassName,
        },
      ),
      Decoration.inline(session.to - presentation.closingLength, session.to, {
        class: "leafdown-source-projection__marker",
      }),
    );
  }

  return DecorationSet.create(state.doc, decorations);
};

const handleProjectionTextInput = (view: EditorView, from: number, to: number, text: string) => {
  const session = getSourceProjectionState(view.state).session;

  if (!session) {
    return handleProjectionSourceTextInput(view, from, to, text);
  }

  if (!isRangeInsideProjection({ from, to }, session)) {
    return false;
  }

  if (isOuterProjectionTextInsertion(view.state, session, from, to, text)) {
    return false;
  }

  dispatchProjectionEdit(view, from, to, text);

  return true;
};

const isOuterProjectionTextInsertion = (
  state: EditorState,
  session: ProjectionSession,
  from: number,
  to: number,
  text: string,
) =>
  from === to &&
  text.length > 0 &&
  !isActiveProjectionMarkerText(getProjectionSource(state, session), text) &&
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

  const candidate = getSourceProjectionInsertionCandidate(view.state, from, text);

  if (!candidate) {
    return false;
  }

  const transaction = replaceProjectionRange(
    view.state.tr,
    candidate.from,
    candidate.to,
    createLiteralSourceProjectionSlice(view.state, candidate.target.originalSource),
  );

  transaction
    .setSelection(TextSelection.create(transaction.doc, candidate.from + candidate.selectionOffset))
    .setStoredMarks([])
    .setMeta(leafdownSourceProjectionPluginKey, {
      session: createProjectionSession(candidate.target),
      type: "enterFromUserEdit",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  view.dispatch(transaction);

  return true;
};

const handleProjectionPaste = (view: EditorView, event: ClipboardEvent, slice: Slice) => {
  const session = getSourceProjectionState(view.state).session;
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
  const session = getSourceProjectionState(view.state).session;

  if (!session) {
    return false;
  }

  if (isUndoKey(event)) {
    const didUndo = undoSourceProjection(view);

    if (didUndo) {
      event.preventDefault();
    }

    return didUndo;
  }

  if (isRedoKey(event)) {
    const didRedo = redoSourceProjection(view);

    if (didRedo) {
      event.preventDefault();
    }

    return didRedo;
  }

  if (event.key === "Enter" || event.key === "Escape") {
    event.preventDefault();
    finalizeSourceProjection(view);

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
  const session = getSourceProjectionState(view.state).session;

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
    createLiteralSourceProjectionSlice(view.state, nextSource),
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
    .setMeta(leafdownSourceProjectionPluginKey, {
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

  if (kind === "insert" && !isActiveProjectionMarkerText(source, text)) {
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

  if (isActiveProjectionMarkerText(source, text) && from === to) {
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

const isActiveProjectionMarkerText = (source: string, text: string) => {
  const bounds = getProjectionDelimiterBounds(source);

  if (!bounds) {
    return isProjectionMarkerText(text);
  }

  return text.length > 0 && Array.from(text).every((character) => character === bounds.marker);
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

const createProjectionSession = (target: SourceProjectionTarget): ProjectionSession => ({
  from: target.from,
  redoStack: [],
  target,
  to: target.from + target.originalSource.length,
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

const createEnterProjectionTransaction = (state: EditorState, target: SourceProjectionTarget) => {
  const adapter = getSourceProjectionAdapter(target);
  const selection = adapter.mapSelectionToSource(state.selection, target);
  const session = createProjectionSession(target);
  const transaction = adapter.createEnterTransaction(state, target);

  transaction
    .setSelection(TextSelection.create(transaction.doc, selection.anchor, selection.head))
    .setStoredMarks([])
    .setMeta("addToHistory", false)
    .setMeta(leafdownSourceProjectionPluginKey, {
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
  const adapter = getSourceProjectionAdapter(session.target);
  const parsed = adapter.parseSource(state, source);
  const original = {
    ...adapter.parseSource(state, session.target.originalSource),
    replacement: session.target.originalContent,
    replacementSize: session.target.originalContentSize,
  };
  const shouldSuppressProjectionAtSelection = isRangeInsideProjection(state.selection, session);
  const restoreSelection = adapter.mapSelectionFromSource(state.selection, session, original);
  const commitSelection = adapter.mapSelectionFromSource(state.selection, session, parsed);
  const suppressAt =
    shouldSuppressProjectionAtSelection && restoreSelection.anchor === restoreSelection.head
      ? restoreSelection.anchor
      : null;

  if (source === session.target.originalSource) {
    return createCleanFinalizeProjectionTransaction(state, session, restoreSelection, suppressAt);
  }

  return createRestoreBeforeCommitTransaction({
    commitSelection,
    replacement: parsed.replacement,
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
  replacement: Slice;
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
    source === session.target.originalSource
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
          to: session.from + session.target.originalContentSize,
        };
  const transaction = replaceProjectionRange(
    state.tr,
    session.from,
    session.to,
    session.target.originalContent,
  );

  transaction
    .setSelection(
      TextSelection.create(transaction.doc, restoreSelection.anchor, restoreSelection.head),
    )
    .setStoredMarks([])
    .setMeta("addToHistory", false)
    .setMeta(leafdownSourceProjectionPluginKey, {
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
  restoreSelection: { anchor: number; head: number },
  suppressAt: number | null,
) => {
  const transaction = getSourceProjectionAdapter(session.target).restoreCleanTarget(state, session);

  transaction
    .setSelection(
      TextSelection.create(transaction.doc, restoreSelection.anchor, restoreSelection.head),
    )
    .setStoredMarks([])
    .setMeta("addToHistory", false)
    .setMeta(leafdownSourceProjectionPluginKey, {
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
  const transaction = replaceProjectionRange(
    state.tr,
    pendingCommit.from,
    pendingCommit.to,
    pendingCommit.replacement,
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
    .setMeta(leafdownSourceProjectionPluginKey, {
      suppressAt: pendingCommit.suppressAt,
      type: "commitAfterRestore",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  return closeHistory(transaction);
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
    createLiteralSourceProjectionSlice(state, source),
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
  replacement: Slice,
) => transaction.replace(from, to, replacement);

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
  getProjectionSource(state, session) === session.target.originalSource;
