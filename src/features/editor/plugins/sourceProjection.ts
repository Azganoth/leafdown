import {
  ParserReady,
  SerializerReady,
  parserCtx,
  remarkCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { closeHistory } from "@milkdown/kit/prose/history";
import type { Slice } from "@milkdown/kit/prose/model";
import type { EditorState, Selection, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $proseAsync } from "@milkdown/kit/utils";

import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";

import {
  applyLiteralSourceProjectionEdit,
  createLiteralSourceProjectionSlice,
  createMarkSourceProjectionAdapter,
  findSourceProjectionInsertionCandidate,
  findSourceProjectionTarget,
  type SourceProjectionAdapter,
  type SourceProjectionEdit,
  type SourceProjectionTarget,
  type SourceProjectionTargetMatch,
} from "../utils/sourceProjectionAdapters";
import { createFootnoteReferenceSourceProjectionAdapter } from "../utils/sourceProjectionFootnoteReferenceAdapter";
import { createLinkSourceProjectionAdapter } from "../utils/sourceProjectionLinkAdapter";
import { getRangeText, getTextBetween, type TextRange } from "../utils/textRanges";

const EMPTY_PROJECTION_STATE: SourceProjectionPluginState = {
  isLinkLabelHovered: false,
  pendingCommit: null,
  session: null,
  suppressedSelection: null,
};

export const leafdownSourceProjectionPluginKey = new PluginKey<SourceProjectionPluginState>(
  "leafdownSourceProjection",
);
export const SOURCE_PROJECTION_ENTRY_SUPPRESSION_META = "leafdownSourceProjectionSkipEntry";

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
  suppressedSelection: SuppressedProjectionSelection | null;
}

interface SuppressedProjectionSelection {
  anchor: number;
  head: number;
}

interface SourceProjectionPluginState {
  isLinkLabelHovered: boolean;
  pendingCommit: PendingProjectionCommit | null;
  session: ProjectionSession | null;
  suppressedSelection: SuppressedProjectionSelection | null;
}

type ProjectionHistoryDirection = "redo" | "undo";

type ProjectionMeta =
  | { type: "enter"; session: ProjectionSession }
  | { type: "enterFromUserEdit"; session: ProjectionSession }
  | { type: "userEdit"; previousSource: string }
  | { type: "localUndo"; currentSource: string }
  | { type: "localRedo"; currentSource: string }
  | { isHovered: boolean; type: "linkLabelHover" }
  | {
      type: "restoreBeforeCommit";
      pendingCommit: PendingProjectionCommit | null;
      suppressedSelection: SuppressedProjectionSelection | null;
    }
  | {
      type: "commitAfterRestore";
      suppressedSelection: SuppressedProjectionSelection | null;
    };

export const createSourceProjectionProsePlugin = (adapters: readonly SourceProjectionAdapter[]) =>
  new Plugin<SourceProjectionPluginState>({
    key: leafdownSourceProjectionPluginKey,
    appendTransaction: (transactions, _oldState, newState) =>
      appendProjectionTransaction(transactions, newState, adapters),
    // A change captured in native history while the document holds projected source replays
    // against coordinates the commit discards. `filterTransaction` is the only hook that runs
    // before the history plugin reads the meta.
    filterTransaction: (transaction, state) => {
      if (transaction.docChanged && hasActiveSourceProjection(state)) {
        transaction.setMeta("addToHistory", false);
      }

      return true;
    },
    props: {
      decorations: (state) => createProjectionDecorations(state),
      handleDOMEvents: {
        mouseout: (view, event) => handleProjectionLinkLabelMouseOut(view, event),
        mouseover: (view, event) => handleProjectionLinkLabelMouseOver(view, event),
        paste: (view, event) => handleProjectionPaste(view, event as ClipboardEvent),
      },
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
  $proseAsync(async (ctx) => {
    await Promise.all([ctx.wait(ParserReady), ctx.wait(SerializerReady)]);

    const parser = ctx.get(parserCtx);
    const remark = ctx.get(remarkCtx);
    const serializer = ctx.get(serializerCtx);

    return createSourceProjectionProsePlugin([
      createLinkSourceProjectionAdapter({
        parser,
        remark,
        serializer,
      }),
      createMarkSourceProjectionAdapter({
        parser,
        remark,
        serializer,
      }),
      createFootnoteReferenceSourceProjectionAdapter({
        parser,
        serializer,
      }),
    ]);
  });

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

export const getSourceProjectionClipboardSlice = (state: EditorState): Slice | null => {
  const { session } = getSourceProjectionState(state);
  const { selection } = state;

  if (!session || selection.empty || !isRangeInsideProjection(selection, session)) {
    return null;
  }

  const source = getProjectionSource(state, session);
  const parsed = session.adapter.parseSource(state, source, session.target);
  const semantic =
    source === session.target.originalSource
      ? {
          ...parsed,
          replacement: session.target.originalContent,
          replacementSize: session.target.originalContentSize,
        }
      : parsed;

  if (
    session.adapter.canCopySelectionSemantically &&
    !session.adapter.canCopySelectionSemantically(selection, session, semantic)
  ) {
    return null;
  }

  const mappedSelection = session.adapter.mapSelectionFromSource(selection, session, semantic);

  if (mappedSelection.anchor === mappedSelection.head) {
    return null;
  }

  const transaction = replaceProjectionRange(
    state.tr,
    session.from,
    session.to,
    semantic.replacement,
  );
  const selectionInCanonicalDocument = TextSelection.create(
    transaction.doc,
    mappedSelection.anchor,
    mappedSelection.head,
  );

  return selectionInCanonicalDocument.content();
};

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

export const deleteSourceProjectionSelection = (view: EditorView) => {
  const session = getSourceProjectionState(view.state).session;
  const { selection } = view.state;

  if (!session || selection.empty || !isRangeInsideProjection(selection, session)) {
    return false;
  }

  view.focus();
  dispatchProjectionEdit(view, selection.from, selection.to, "");

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

const appendProjectionTransaction = (
  transactions: readonly Transaction[],
  state: EditorState,
  adapters: readonly SourceProjectionAdapter[],
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

  if (areSelectionsEqual(projectionState.suppressedSelection, state.selection)) {
    return null;
  }

  if (
    transactions.some(
      (transaction) => transaction.getMeta(SOURCE_PROJECTION_ENTRY_SUPPRESSION_META) === true,
    )
  ) {
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

  if (meta?.type === "enter" || meta?.type === "enterFromUserEdit") {
    return {
      isLinkLabelHovered: false,
      pendingCommit: null,
      session: meta.session,
      suppressedSelection: null,
    };
  }

  if (meta?.type === "restoreBeforeCommit") {
    return {
      isLinkLabelHovered: false,
      pendingCommit: meta.pendingCommit,
      session: null,
      suppressedSelection: meta.suppressedSelection,
    };
  }

  if (meta?.type === "commitAfterRestore") {
    return {
      isLinkLabelHovered: false,
      pendingCommit: null,
      session: null,
      suppressedSelection: meta.suppressedSelection,
    };
  }

  if (meta?.type === "linkLabelHover") {
    return {
      ...pluginState,
      isLinkLabelHovered: meta.isHovered,
    };
  }

  const suppressedSelection = getMappedSuppressedSelection(
    pluginState.suppressedSelection,
    transaction,
  );

  if (!pluginState.session) {
    return {
      ...pluginState,
      suppressedSelection,
    };
  }

  const session = mapProjectionSession(pluginState.session, transaction);

  if (meta?.type === "userEdit") {
    const nextSource = getProjectionSource(newState, session);

    return {
      isLinkLabelHovered: false,
      pendingCommit: null,
      session: {
        ...session,
        redoStack: [],
        undoStack:
          meta.previousSource === nextSource
            ? session.undoStack
            : [...session.undoStack, meta.previousSource],
      },
      suppressedSelection,
    };
  }

  if (meta?.type === "localUndo") {
    return {
      isLinkLabelHovered: false,
      pendingCommit: null,
      session: {
        ...session,
        redoStack: [...session.redoStack, meta.currentSource],
        undoStack: session.undoStack.slice(0, -1),
      },
      suppressedSelection,
    };
  }

  if (meta?.type === "localRedo") {
    return {
      isLinkLabelHovered: false,
      pendingCommit: null,
      session: {
        ...session,
        redoStack: session.redoStack.slice(0, -1),
        undoStack: [...session.undoStack, meta.currentSource],
      },
      suppressedSelection,
    };
  }

  if (transaction.docChanged && !isRangeInsideProjection(newState.selection, session)) {
    return {
      isLinkLabelHovered: false,
      pendingCommit: null,
      session: null,
      suppressedSelection,
    };
  }

  return {
    ...pluginState,
    session,
    suppressedSelection,
  };
};

const getMappedSuppressedSelection = (
  suppressedSelection: SuppressedProjectionSelection | null,
  transaction: Transaction,
) => {
  if (!suppressedSelection || transaction.docChanged) {
    return null;
  }

  if (transaction.selectionSet && !areSelectionsEqual(suppressedSelection, transaction.selection)) {
    return null;
  }

  return suppressedSelection;
};

const areSelectionsEqual = (
  suppressedSelection: SuppressedProjectionSelection | null,
  selection: Selection,
) =>
  suppressedSelection?.anchor === selection.anchor && suppressedSelection.head === selection.head;

const createProjectionDecorations = (state: EditorState) => {
  const projectionState = getSourceProjectionState(state);
  const { session } = projectionState;

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
          class: getProjectionPresentationClassName(span.className, projectionState),
        }),
      );
    }
  }

  return DecorationSet.create(state.doc, decorations);
};

const LINK_LABEL_PRESENTATION_CLASS_NAME = "leafdown-source-projection__content--link-label";
const LINK_LABEL_HOVERED_CLASS_NAME = "leafdown-source-projection__content--link-label-hovered";

const getProjectionPresentationClassName = (
  className: string,
  { isLinkLabelHovered }: SourceProjectionPluginState,
) =>
  isLinkLabelHovered && className.split(" ").includes(LINK_LABEL_PRESENTATION_CLASS_NAME)
    ? `${className} ${LINK_LABEL_HOVERED_CLASS_NAME}`
    : className;

const getLinkLabelPresentationElement = (target: EventTarget | null) =>
  target instanceof Element ? target.closest(`.${LINK_LABEL_PRESENTATION_CLASS_NAME}`) : null;

const setProjectionLinkLabelHover = (view: EditorView, isHovered: boolean) => {
  const projectionState = getSourceProjectionState(view.state);

  if (!projectionState.session || projectionState.isLinkLabelHovered === isHovered) {
    return;
  }

  view.dispatch(
    view.state.tr.setMeta(leafdownSourceProjectionPluginKey, {
      isHovered,
      type: "linkLabelHover",
    } satisfies ProjectionMeta),
  );
};

const handleProjectionLinkLabelMouseOver = (view: EditorView, event: Event) => {
  if (!getLinkLabelPresentationElement(event.target)) {
    return false;
  }

  setProjectionLinkLabelHover(view, true);

  return false;
};

const handleProjectionLinkLabelMouseOut = (view: EditorView, event: Event) => {
  if (
    !getLinkLabelPresentationElement(event.target) ||
    getLinkLabelPresentationElement((event as MouseEvent).relatedTarget)
  ) {
    return false;
  }

  setProjectionLinkLabelHover(view, false);

  return false;
};

const handleProjectionTextInput = (
  view: EditorView,
  from: number,
  to: number,
  text: string,
  adapters: readonly SourceProjectionAdapter[],
) => {
  const session = getSourceProjectionState(view.state).session;

  if (!session) {
    return handleProjectionSourceTextInput(view, from, to, text, adapters);
  }

  if (!isRangeInsideProjection({ from, to }, session)) {
    return false;
  }

  // ProseMirror keeps the node an IME composes into alive only across a minimal change, and
  // the projection's edit path replaces its whole range.
  if (view.composing) {
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
  adapters: readonly SourceProjectionAdapter[],
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

const handleProjectionPaste = (view: EditorView, event: ClipboardEvent, slice?: Slice) => {
  const session = getSourceProjectionState(view.state).session;
  const { selection } = view.state;

  if (!session || !isRangeInsideProjection(selection, session)) {
    return false;
  }

  const text =
    event.clipboardData?.getData(TEXT_PLAIN_MIME_TYPE) ||
    (slice ? getTextBetween(slice.content, 0, Number.MAX_SAFE_INTEGER) : "");

  if (!text && !event.clipboardData && !slice) {
    return false;
  }

  event.preventDefault();

  if (text) {
    dispatchProjectionEdit(view, selection.from, selection.to, text);
  }

  return true;
};

const handleProjectionKeyDown = (view: EditorView, event: KeyboardEvent) => {
  const session = getSourceProjectionState(view.state).session;

  if (!session) {
    return false;
  }

  if (event.key === "Enter") {
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
  const parsed = adapter.parseSource(state, source, session.target);
  const original = {
    ...adapter.parseSource(state, session.target.originalSource, session.target),
    replacement: session.target.originalContent,
    replacementSize: session.target.originalContentSize,
  };
  const shouldSuppressProjectionAtSelection = isRangeInsideProjection(state.selection, session);
  const shouldMapCrossingTextSelection =
    state.selection instanceof TextSelection &&
    state.selection.from < session.to &&
    session.from < state.selection.to;
  const shouldMapSelection = shouldSuppressProjectionAtSelection || shouldMapCrossingTextSelection;
  const restoreSelection = shouldMapSelection
    ? adapter.mapSelectionFromSource(state.selection, session, original)
    : null;
  const commitSelection = shouldMapSelection
    ? adapter.mapSelectionFromSource(state.selection, session, parsed)
    : null;
  const suppressedSelection = shouldSuppressProjectionAtSelection ? restoreSelection : null;

  if (source === session.target.originalSource) {
    return createCleanFinalizeProjectionTransaction(
      state,
      session,
      restoreSelection,
      suppressedSelection,
    );
  }

  return createRestoreBeforeCommitTransaction({
    commitSelection,
    replacement: parsed.replacement,
    restoreSelection,
    session,
    source,
    state,
    suppressedSelection,
  });
};

interface RestoreBeforeCommitTransactionInput {
  commitSelection: { anchor: number; head: number } | null;
  replacement: Slice;
  restoreSelection: { anchor: number; head: number } | null;
  session: ProjectionSession;
  source: string;
  state: EditorState;
  suppressedSelection: SuppressedProjectionSelection | null;
}

const createRestoreBeforeCommitTransaction = ({
  commitSelection,
  replacement,
  restoreSelection,
  session,
  source,
  state,
  suppressedSelection,
}: RestoreBeforeCommitTransactionInput) => {
  const pendingCommit =
    source === session.target.originalSource
      ? null
      : {
          from: session.from,
          replacement,
          selectionAnchor: commitSelection?.anchor ?? null,
          selectionHead: commitSelection?.head ?? null,
          suppressedSelection: commitSelection,
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
      suppressedSelection,
      type: "restoreBeforeCommit",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  return transaction;
};

const createCleanFinalizeProjectionTransaction = (
  state: EditorState,
  session: ProjectionSession,
  restoreSelection: { anchor: number; head: number } | null,
  suppressedSelection: SuppressedProjectionSelection | null,
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
      suppressedSelection,
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
      suppressedSelection: pendingCommit.suppressedSelection,
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
