import { closeHistory } from "@milkdown/kit/prose/history";
import type { Slice } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { isRedoKey, isUndoKey } from "@/lib/input";
import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";

import {
  applyLiteralSourceProjectionEdit,
  createLiteralSourceProjectionSlice,
  findSourceProjectionInsertionCandidate,
  findSourceProjectionTarget,
  type SourceProjectionAdapter,
  type SourceProjectionEdit,
  type SourceProjectionTarget,
  type SourceProjectionTargetMatch,
} from "../utils/sourceProjectionAdapters";
import { getRangeText, getTextBetween, type TextRange } from "../utils/textRanges";

const EMPTY_PROJECTION_STATE: SourceProjectionPluginState = {
  pendingCommit: null,
  session: null,
  suppressAfterEnter: false,
  suppressAt: null,
};

export const leafdownSourceProjectionPluginKey = new PluginKey<SourceProjectionPluginState>(
  "leafdownSourceProjection",
);

interface ProjectionSession extends TextRange {
  adapter: SourceProjectionAdapter;
  redoStack: string[];
  target: SourceProjectionTarget;
  undoStack: string[];
}

interface PendingProjectionCommit extends TextRange {
  replacement: Slice;
  selectionAnchor: number | null;
  selectionHead: number | null;
  suppressAt: number | null;
}

interface SourceProjectionPluginState {
  pendingCommit: PendingProjectionCommit | null;
  session: ProjectionSession | null;
  suppressAfterEnter: boolean;
  suppressAt: number | null;
}

type ProjectionHistoryDirection = "redo" | "undo";

type ProjectionMeta =
  | { type: "delegateEnter" }
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

export const createSourceProjectionProsePlugin = (adapters?: readonly SourceProjectionAdapter[]) =>
  new Plugin<SourceProjectionPluginState>({
    key: leafdownSourceProjectionPluginKey,
    appendTransaction: (_transactions, _oldState, newState) =>
      appendProjectionTransaction(newState, adapters),
    props: {
      decorations: (state) => createProjectionDecorations(state),
      handleKeyDown: (view, event) => handleProjectionKeyDown(view, event),
      handlePaste: (view, event, slice) => handleProjectionPaste(view, event, slice),
      handleTextInput: (view, from, to, text) =>
        handleProjectionTextInput(view, from, to, text, adapters),
    },
    state: {
      init: () => EMPTY_PROJECTION_STATE,
      apply: (transaction, pluginState, _oldState, newState) =>
        applyProjectionTransaction(transaction, pluginState, newState),
    },
  });

export const createLeafdownSourceProjectionPlugin = () =>
  $prose(() => createSourceProjectionProsePlugin());

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
    meta?.type === "delegateEnter" ||
    meta?.type === "enter" ||
    meta?.type === "restoreBeforeCommit" ||
    meta?.type === "commitAfterRestore"
  );
};

const getSourceProjectionState = (state: EditorState) =>
  leafdownSourceProjectionPluginKey.getState(state) ?? EMPTY_PROJECTION_STATE;

const getProjectionMeta = (transaction: Transaction) =>
  transaction.getMeta(leafdownSourceProjectionPluginKey) as ProjectionMeta | undefined;

const appendProjectionTransaction = (
  state: EditorState,
  adapters?: readonly SourceProjectionAdapter[],
) => {
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

  if (projectionState.suppressAt === state.selection.from) {
    return null;
  }

  const match = findSourceProjectionTarget(state, adapters);

  if (!match) {
    return null;
  }

  return createEnterProjectionTransaction(state, match);
};

const applyProjectionTransaction = (
  transaction: Transaction,
  pluginState: SourceProjectionPluginState,
  newState: EditorState,
): SourceProjectionPluginState => {
  const meta = getProjectionMeta(transaction);

  if (meta?.type === "delegateEnter") {
    return {
      ...pluginState,
      suppressAfterEnter: true,
    };
  }

  if (meta?.type === "enter" || meta?.type === "enterFromUserEdit") {
    return {
      pendingCommit: null,
      session: meta.session,
      suppressAfterEnter: false,
      suppressAt: null,
    };
  }

  if (meta?.type === "restoreBeforeCommit") {
    return {
      pendingCommit: meta.pendingCommit,
      session: null,
      suppressAfterEnter: pluginState.suppressAfterEnter,
      suppressAt: meta.suppressAt,
    };
  }

  if (meta?.type === "commitAfterRestore") {
    return {
      pendingCommit: null,
      session: null,
      suppressAfterEnter: pluginState.suppressAfterEnter,
      suppressAt: meta.suppressAt,
    };
  }

  const didHandleDelegatedEnter = pluginState.suppressAfterEnter && transaction.docChanged;
  const suppressAfterEnter = didHandleDelegatedEnter ? false : pluginState.suppressAfterEnter;
  const suppressAt =
    didHandleDelegatedEnter && transaction.selection.empty
      ? transaction.selection.from
      : getMappedSuppressPosition(pluginState.suppressAt, transaction);

  if (!pluginState.session) {
    return {
      ...pluginState,
      suppressAfterEnter,
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
      suppressAfterEnter,
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
      suppressAfterEnter,
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
      suppressAfterEnter,
      suppressAt,
    };
  }

  if (transaction.docChanged && !isRangeInsideProjection(newState.selection, session)) {
    return {
      pendingCommit: null,
      session: null,
      suppressAfterEnter,
      suppressAt,
    };
  }

  return {
    ...pluginState,
    session,
    suppressAfterEnter,
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
  const presentation = session.adapter.getPresentation(session.target, source);
  const decorations = [
    Decoration.inline(session.from, session.to, {
      class: "leafdown-source-projection",
      "data-leafdown-source": presentation.sourceTypes.join(" "),
    }),
  ];

  for (const span of presentation.spans) {
    const from = session.from + Math.min(Math.max(span.from, 0), source.length);
    const to = session.from + Math.min(Math.max(span.to, 0), source.length);

    if (from < to) {
      decorations.push(
        Decoration.inline(from, to, {
          class: span.className,
        }),
      );
    }
  }

  return DecorationSet.create(state.doc, decorations);
};

const handleProjectionTextInput = (
  view: EditorView,
  from: number,
  to: number,
  text: string,
  adapters?: readonly SourceProjectionAdapter[],
) => {
  const session = getSourceProjectionState(view.state).session;

  if (!session) {
    return handleProjectionSourceTextInput(view, from, to, text, adapters);
  }

  if (!isRangeInsideProjection({ from, to }, session)) {
    return false;
  }

  const edit = getRelativeProjectionEdit(session, from, to, text);

  if (
    session.adapter.shouldHandleTextInput?.(getProjectionSource(view.state, session), edit) ===
    false
  ) {
    return false;
  }

  dispatchProjectionEdit(view, from, to, text);

  return true;
};

const handleProjectionSourceTextInput = (
  view: EditorView,
  from: number,
  to: number,
  text: string,
  adapters?: readonly SourceProjectionAdapter[],
) => {
  if (from !== to) {
    return false;
  }

  const match = findSourceProjectionInsertionCandidate(view.state, from, text, adapters);

  if (!match) {
    return false;
  }

  const { adapter, candidate } = match;

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
      session: createProjectionSession(adapter, candidate.target),
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

  if (event.key === "Enter") {
    view.dispatch(
      view.state.tr.setMeta("addToHistory", false).setMeta(leafdownSourceProjectionPluginKey, {
        type: "delegateEnter",
      } satisfies ProjectionMeta),
    );
    finalizeSourceProjection(view);

    return false;
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
  const edit = getRelativeProjectionEdit(session, from, to, text);
  const result = (session.adapter.applyEdit ?? applyLiteralSourceProjectionEdit)(
    previousSource,
    edit,
  );
  const transaction = replaceProjectionRange(
    view.state.tr,
    session.from,
    session.to,
    createLiteralSourceProjectionSlice(view.state, result.source),
  );
  const nextPosition = session.from + result.selectionOffset;

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

const getRelativeProjectionEdit = (
  session: ProjectionSession,
  from: number,
  to: number,
  text: string,
): SourceProjectionEdit => ({
  from: from - session.from,
  text,
  to: to - session.from,
});

const createProjectionSession = (
  adapter: SourceProjectionAdapter,
  target: SourceProjectionTarget,
): ProjectionSession => ({
  adapter,
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

const createEnterProjectionTransaction = (
  state: EditorState,
  { adapter, target }: SourceProjectionTargetMatch,
) => {
  const selection = adapter.mapSelectionToSource(state.selection, target);
  const session = createProjectionSession(adapter, target);
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
  const { adapter } = session;
  const parsed = adapter.parseSource(state, source);
  const original = {
    ...adapter.parseSource(state, session.target.originalSource),
    replacement: session.target.originalContent,
    replacementSize: session.target.originalContentSize,
  };
  const shouldSuppressProjectionAtSelection = isRangeInsideProjection(state.selection, session);
  const restoreSelection = shouldSuppressProjectionAtSelection
    ? adapter.mapSelectionFromSource(state.selection, session, original)
    : null;
  const commitSelection = shouldSuppressProjectionAtSelection
    ? adapter.mapSelectionFromSource(state.selection, session, parsed)
    : null;
  const suppressAt =
    restoreSelection && restoreSelection.anchor === restoreSelection.head
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
    source,
    state,
    suppressAt,
  });
};

interface RestoreBeforeCommitTransactionInput {
  commitSelection: { anchor: number; head: number } | null;
  replacement: Slice;
  restoreSelection: { anchor: number; head: number } | null;
  session: ProjectionSession;
  source: string;
  state: EditorState;
  suppressAt: number | null;
}

const createRestoreBeforeCommitTransaction = ({
  commitSelection,
  replacement,
  restoreSelection,
  session,
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
          selectionAnchor: commitSelection?.anchor ?? null,
          selectionHead: commitSelection?.head ?? null,
          suppressAt:
            commitSelection && commitSelection.anchor === commitSelection.head
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

  if (restoreSelection) {
    transaction.setSelection(
      TextSelection.create(transaction.doc, restoreSelection.anchor, restoreSelection.head),
    );
  }

  transaction
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
  restoreSelection: { anchor: number; head: number } | null,
  suppressAt: number | null,
) => {
  const transaction = session.adapter.restoreCleanTarget(state, session);

  if (restoreSelection) {
    transaction.setSelection(
      TextSelection.create(transaction.doc, restoreSelection.anchor, restoreSelection.head),
    );
  }

  transaction
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

  if (pendingCommit.selectionAnchor !== null && pendingCommit.selectionHead !== null) {
    transaction.setSelection(
      TextSelection.create(
        transaction.doc,
        pendingCommit.selectionAnchor,
        pendingCommit.selectionHead,
      ),
    );
  }

  transaction
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
