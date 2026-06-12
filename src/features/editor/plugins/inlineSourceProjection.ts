import { closeHistory } from "@milkdown/kit/prose/history";
import type { Mark, Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Selection, Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export const leafdownInlineSourceProjectionPluginKey =
  new PluginKey<InlineSourceProjectionPluginState>("leafdownInlineSourceProjection");

interface TextRange {
  from: number;
  to: number;
}

interface ActiveMarkRange extends TextRange {
  mark: Mark;
}

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

interface ProjectionReplacement {
  marks?: ProjectionMarkDescriptor[];
  text: string;
}

type ProjectionMarkName = "emphasis" | "strong";
type ProjectionEditKind = "delete" | "insert" | "replace";
type ProjectionDelimiterSide = "closing" | "opening";

interface ProjectionMarkDescriptor {
  attrs: Record<string, unknown>;
  markName: ProjectionMarkName;
}

interface ProjectionBoundaryDelimiters {
  closing: string;
  contentFrom: number;
  contentTo: number;
  marker: string;
  opening: string;
}

interface ProjectionEditContext {
  delimiterSide: ProjectionDelimiterSide | null;
  kind: ProjectionEditKind;
}

interface ProjectionSourceInsertionCandidate extends TextRange {
  session: ProjectionSession;
  source: string;
}

type ProjectionMeta =
  | { session: ProjectionSession; type: "enter" }
  | { session: ProjectionSession; type: "enterFromUserEdit" }
  | { previousSource: string; type: "userEdit" }
  | { currentSource: string; type: "localUndo" }
  | { currentSource: string; type: "localRedo" }
  | {
      pendingCommit: PendingProjectionCommit | null;
      suppressAt: number | null;
      type: "finalizeRestore";
    }
  | { suppressAt: number | null; type: "finalizeCommit" };

type ParsedProjectionSource =
  | {
      closing: string;
      marks: ProjectionMarkDescriptor[];
      opening: string;
      text: string;
      type: "mark";
    }
  | { text: string; type: "literal" };

const supportedProjectionMarkNames = ["strong", "emphasis"] as const;

const emptyProjectionState: InlineSourceProjectionPluginState = {
  pendingCommit: null,
  session: null,
  suppressAt: null,
};

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
          init: () => emptyProjectionState,
          apply: (transaction, pluginState, oldState, newState) =>
            applyProjectionTransaction(transaction, pluginState, oldState, newState),
        },
      }),
  );

export const finalizeInlineSourceProjection = (view: EditorView) => {
  const projectionState = getInlineSourceProjectionState(view.state);

  if (!projectionState.session) {
    return false;
  }

  const transaction = createFinalizeRestoreTransaction(view.state, projectionState.session);

  if (!transaction) {
    return false;
  }

  view.dispatch(transaction);

  return true;
};

export const hasActiveInlineSourceProjection = (state: EditorState) =>
  Boolean(getInlineSourceProjectionState(state).session);

export const hasTransientInlineSourceProjection = (state: EditorState) => {
  const projectionState = getInlineSourceProjectionState(state);

  return Boolean(projectionState.session || projectionState.pendingCommit);
};

export const canUndoInlineSourceProjection = (state: EditorState) => {
  const session = getInlineSourceProjectionState(state).session;

  return Boolean(session && session.undoStack.length > 0);
};

export const canRedoInlineSourceProjection = (state: EditorState) => {
  const session = getInlineSourceProjectionState(state).session;

  return Boolean(session && session.redoStack.length > 0);
};

export const undoInlineSourceProjection = (view: EditorView) => {
  const session = getInlineSourceProjectionState(view.state).session;
  const source = session?.undoStack.at(-1);

  if (!session) {
    return false;
  }

  if (source === undefined) {
    return true;
  }

  const currentSource = getProjectionSource(view.state, session);
  const transaction = replaceProjectionSource(view.state, session, source);

  transaction.setMeta("addToHistory", false).setMeta(leafdownInlineSourceProjectionPluginKey, {
    currentSource,
    type: "localUndo",
  } satisfies ProjectionMeta);

  view.focus();
  view.dispatch(transaction);

  return true;
};

export const redoInlineSourceProjection = (view: EditorView) => {
  const session = getInlineSourceProjectionState(view.state).session;
  const source = session?.redoStack.at(-1);

  if (!session) {
    return false;
  }

  if (source === undefined) {
    return true;
  }

  const currentSource = getProjectionSource(view.state, session);
  const transaction = replaceProjectionSource(view.state, session, source);

  transaction.setMeta("addToHistory", false).setMeta(leafdownInlineSourceProjectionPluginKey, {
    currentSource,
    type: "localRedo",
  } satisfies ProjectionMeta);

  view.focus();
  view.dispatch(transaction);

  return true;
};

export const replaceInlineSourceProjectionSelection = (view: EditorView, text: string) => {
  const session = getInlineSourceProjectionState(view.state).session;
  const { selection } = view.state;

  if (!session || !text || !isRangeInsideProjection(selection, session)) {
    return false;
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
    meta?.type === "enter" || meta?.type === "finalizeRestore" || meta?.type === "finalizeCommit"
  );
};

const getInlineSourceProjectionState = (state: EditorState) =>
  leafdownInlineSourceProjectionPluginKey.getState(state) ?? emptyProjectionState;

const getProjectionMeta = (transaction: Transaction) =>
  transaction.getMeta(leafdownInlineSourceProjectionPluginKey) as ProjectionMeta | undefined;

const appendProjectionTransaction = (state: EditorState) => {
  const projectionState = getInlineSourceProjectionState(state);

  if (projectionState.pendingCommit) {
    return createFinalizeCommitTransaction(state, projectionState.pendingCommit);
  }

  if (projectionState.session) {
    if (isSelectionInsideProjection(state.selection, projectionState.session)) {
      return null;
    }

    return createFinalizeRestoreTransaction(state, projectionState.session);
  }

  if (!isCaretSelection(state)) {
    return null;
  }

  if (projectionState.suppressAt === state.selection.from) {
    return null;
  }

  const activeMarkRange = getActiveProjectionMarkRange(state);

  return activeMarkRange ? createEnterProjectionTransaction(state, activeMarkRange) : null;
};

const applyProjectionTransaction = (
  transaction: Transaction,
  pluginState: InlineSourceProjectionPluginState,
  oldState: EditorState,
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

  if (meta?.type === "finalizeRestore") {
    return {
      pendingCommit: meta.pendingCommit,
      session: null,
      suppressAt: meta.suppressAt,
    };
  }

  if (meta?.type === "finalizeCommit") {
    return {
      pendingCommit: null,
      session: null,
      suppressAt: meta.suppressAt,
    };
  }

  const session = pluginState.session
    ? mapProjectionSession(pluginState.session, transaction)
    : null;
  const suppressAt = getMappedSuppressPosition(pluginState.suppressAt, transaction);

  if (!session) {
    return {
      ...pluginState,
      suppressAt,
    };
  }

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

  if (transaction.docChanged && !isSelectionInsideProjection(newState.selection, session)) {
    return {
      pendingCommit: null,
      session: null,
      suppressAt,
    };
  }

  void oldState;

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
    marks.some((mark) => mark.markName === "strong")
      ? "leafdown-inline-source-projection__content--strong"
      : null,
    marks.some((mark) => mark.markName === "emphasis")
      ? "leafdown-inline-source-projection__content--emphasis"
      : null,
  ]
    .filter(Boolean)
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
      session: candidate.session,
      type: "enterFromUserEdit",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  view.dispatch(transaction);

  return true;
};

const handleProjectionPaste = (view: EditorView, event: ClipboardEvent, slice: unknown) => {
  const session = getInlineSourceProjectionState(view.state).session;
  const { selection } = view.state;

  if (!session || !isRangeInsideProjection(selection, session)) {
    return false;
  }

  const text = event.clipboardData?.getData("text/plain") ?? getTextFromClipboardSlice(slice) ?? "";

  if (!text) {
    return false;
  }

  event.preventDefault();
  dispatchProjectionEdit(view, selection.from, selection.to, text);

  return true;
};

const getTextFromClipboardSlice = (slice: unknown) =>
  typeof slice === "object" &&
  slice !== null &&
  "content" in slice &&
  typeof slice.content === "object" &&
  slice.content !== null &&
  "textBetween" in slice.content &&
  typeof slice.content.textBetween === "function"
    ? String(slice.content.textBetween(0, Number.MAX_SAFE_INTEGER, "\n", "\n"))
    : null;

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
    const delimiters = getProjectionBoundaryDelimiters(source);
    const remappedPosition = delimiters
      ? getContentBoundaryInsertionPosition(delimiters, normalizedFrom)
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
  const delimiters = getProjectionBoundaryDelimiters(source);

  if (!delimiters) {
    return null;
  }

  if (isProjectionMarkerText(text) && from === to) {
    if (from <= delimiters.contentFrom) {
      return "opening";
    }

    if (from >= delimiters.contentTo) {
      return "closing";
    }

    return null;
  }

  if (text.length === 0) {
    if (from < delimiters.contentFrom) {
      return "opening";
    }

    if (to > delimiters.contentTo) {
      return "closing";
    }
  }

  return null;
};

const getContentBoundaryInsertionPosition = (
  delimiters: ProjectionBoundaryDelimiters,
  position: number,
) => {
  if (position <= delimiters.contentFrom) {
    return delimiters.contentFrom;
  }

  if (position >= delimiters.contentTo) {
    return delimiters.contentTo;
  }

  return position;
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

  const textAfter = $position.parent.textBetween(
    $position.parentOffset,
    $position.parent.content.size,
    "\n",
    "\n",
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
    session: {
      from: position,
      marks: parsed.marks,
      originalSource: source,
      originalText: parsed.text,
      redoStack: [],
      to: position + source.length,
      undoStack: [],
    },
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

  const textBefore = state.doc.textBetween(session.from, position, "\n", "\n");
  const character = Array.from(textBefore).at(-1);

  return character
    ? {
        from: position - character.length,
        to: position,
      }
    : null;
};

const getNextCharacterRange = (
  state: EditorState,
  session: ProjectionSession,
  position: number,
): TextRange | null => {
  if (position >= session.to) {
    return null;
  }

  const textAfter = state.doc.textBetween(position, session.to, "\n", "\n");
  const character = Array.from(textAfter)[0];

  return character
    ? {
        from: position,
        to: position + character.length,
      }
    : null;
};

const createEnterProjectionTransaction = (state: EditorState, range: ActiveProjectionRange) => {
  const originalText = state.doc.textBetween(range.from, range.to, "\n", "\n");
  const sourceMarkers = getSourceMarkers(range.marks);
  const originalSource = `${sourceMarkers.opening}${originalText}${sourceMarkers.closing}`;
  const selectionOffset = Math.min(
    Math.max(state.selection.from - range.from, 0),
    originalText.length,
  );
  const selectionPosition = range.from + sourceMarkers.opening.length + selectionOffset;
  const session = {
    from: range.from,
    marks: range.marks,
    originalSource,
    originalText,
    redoStack: [],
    to: range.from + originalSource.length,
    undoStack: [],
  } satisfies ProjectionSession;
  const transaction = state.tr.replaceWith(range.from, range.to, state.schema.text(originalSource));

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

const createFinalizeRestoreTransaction = (
  state: EditorState,
  session: ProjectionSession,
): Transaction | null => {
  const source = getProjectionSource(state, session);
  const parsed = parseProjectionSource(source);
  const replacement = getProjectionReplacement(parsed, source);
  const shouldSuppressProjectionAtSelection = isSelectionInsideProjection(state.selection, session);
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
      suppressAt:
        shouldSuppressProjectionAtSelection && restoreSelection.anchor === restoreSelection.head
          ? restoreSelection.anchor
          : null,
      type: "finalizeRestore",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  return transaction;
};

const createFinalizeCommitTransaction = (
  state: EditorState,
  pendingCommit: PendingProjectionCommit,
) => {
  const transaction = replaceProjectionRange(
    state.tr,
    pendingCommit.from,
    pendingCommit.to,
    pendingCommit.replacement.marks
      ? getMarkedTextReplacement(
          state,
          pendingCommit.replacement.text,
          pendingCommit.replacement.marks,
        )
      : getLiteralTextReplacement(state, pendingCommit.replacement.text),
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
      type: "finalizeCommit",
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
) => (replacement ? transaction.replaceWith(from, to, replacement) : transaction.delete(from, to));

const getMarkedTextReplacement = (
  state: EditorState,
  text: string,
  marks: ProjectionMarkDescriptor[],
) =>
  text.length > 0
    ? state.schema.text(
        text,
        marks.map((mark) => state.schema.marks[mark.markName].create(mark.attrs)),
      )
    : null;

const getLiteralTextReplacement = (state: EditorState, text: string) =>
  text.length > 0 ? state.schema.text(text) : null;

const getProjectionReplacement = (
  parsed: ParsedProjectionSource,
  source: string,
): ProjectionReplacement =>
  parsed.type === "mark"
    ? {
        marks: parsed.marks,
        text: parsed.text,
      }
    : {
        text: source,
      };

const normalizeProjectionSourceAfterEdit = (source: string, context: ProjectionEditContext) =>
  getNormalizedDelimitedProjectionSource(source, context) ?? source;

const parseProjectionSource = (source: string): ParsedProjectionSource => {
  const nested = parseNestedProjectionSource(source);

  if (nested) {
    return nested;
  }

  const delimited = parseDelimitedProjectionSource(source);

  if (delimited) {
    return delimited;
  }

  return {
    text: source,
    type: "literal",
  };
};

const parseDelimitedProjectionSource = (source: string): ParsedProjectionSource | null => {
  const match = /^(?<opening>\*{1,3}|_{1,3})(?<text>.+?)(?<closing>\*{1,3}|_{1,3})$/u.exec(source);

  if (!match?.groups) {
    return null;
  }

  const { opening, text, closing } = match.groups;

  if (
    opening.length !== closing.length ||
    getMarkerCharacterFromSyntax(opening) !== getMarkerCharacterFromSyntax(closing)
  ) {
    return null;
  }

  return createDelimitedProjectionSource(opening, closing, text, opening.length);
};

const getNormalizedDelimitedProjectionSource = (source: string, context: ProjectionEditContext) => {
  const delimiters = getProjectionBoundaryDelimiters(source);

  if (!delimiters || !delimiters.closing || delimiters.contentFrom >= delimiters.contentTo) {
    return null;
  }

  const markerCount = getNormalizedMarkerCount(delimiters, context);

  if (markerCount < 1 || markerCount > 3) {
    return null;
  }

  const normalizedMarker = delimiters.marker.repeat(markerCount);
  const text = source.slice(delimiters.contentFrom, delimiters.contentTo);

  return `${normalizedMarker}${text}${normalizedMarker}`;
};

const getNormalizedMarkerCount = (
  delimiters: ProjectionBoundaryDelimiters,
  context: ProjectionEditContext,
) => {
  if (context.delimiterSide === "opening") {
    return Math.min(delimiters.opening.length, 3);
  }

  if (context.delimiterSide === "closing") {
    return Math.min(delimiters.closing.length, 3);
  }

  return context.kind === "insert"
    ? Math.min(Math.max(delimiters.opening.length, delimiters.closing.length), 3)
    : Math.min(delimiters.opening.length, delimiters.closing.length, 3);
};

const createDelimitedProjectionSource = (
  opening: string,
  closing: string,
  text: string,
  markerCount: number,
): ParsedProjectionSource | null => {
  if (markerCount === 1) {
    return {
      closing,
      marks: [createProjectionMarkDescriptor("emphasis", opening)],
      opening,
      text,
      type: "mark",
    };
  }

  if (markerCount === 2) {
    return {
      closing,
      marks: [createProjectionMarkDescriptor("strong", opening)],
      opening,
      text,
      type: "mark",
    };
  }

  if (markerCount === 3) {
    return {
      closing,
      marks: [
        createProjectionMarkDescriptor("strong", opening),
        createProjectionMarkDescriptor("emphasis", opening),
      ],
      opening,
      text,
      type: "mark",
    };
  }

  return null;
};

const parseNestedProjectionSource = (source: string): ParsedProjectionSource | null => {
  for (const strongMarker of ["**", "__"] as const) {
    for (const emphasisMarker of ["*", "_"] as const) {
      const strongOuterText = getWrappedText(
        source,
        `${strongMarker}${emphasisMarker}`,
        `${emphasisMarker}${strongMarker}`,
      );

      if (strongOuterText !== null) {
        return {
          closing: `${emphasisMarker}${strongMarker}`,
          marks: [
            createProjectionMarkDescriptor("strong", strongMarker),
            createProjectionMarkDescriptor("emphasis", emphasisMarker),
          ],
          opening: `${strongMarker}${emphasisMarker}`,
          text: strongOuterText,
          type: "mark",
        };
      }

      const emphasisOuterText = getWrappedText(
        source,
        `${emphasisMarker}${strongMarker}`,
        `${strongMarker}${emphasisMarker}`,
      );

      if (emphasisOuterText !== null) {
        return {
          closing: `${strongMarker}${emphasisMarker}`,
          marks: [
            createProjectionMarkDescriptor("strong", strongMarker),
            createProjectionMarkDescriptor("emphasis", emphasisMarker),
          ],
          opening: `${emphasisMarker}${strongMarker}`,
          text: emphasisOuterText,
          type: "mark",
        };
      }
    }
  }

  return null;
};

const getWrappedText = (source: string, opening: string, closing: string) => {
  if (
    source.length <= opening.length + closing.length ||
    !source.startsWith(opening) ||
    !source.endsWith(closing)
  ) {
    return null;
  }

  return source.slice(opening.length, source.length - closing.length);
};

const getProjectionBoundaryDelimiters = (source: string): ProjectionBoundaryDelimiters | null => {
  const openingMatch = /^(?<opening>\*+|_+)/u.exec(source);

  if (!openingMatch?.groups) {
    return null;
  }

  const opening = openingMatch.groups.opening;
  const marker = getMarkerCharacterFromSyntax(opening);
  const closingMatch = /(\*+|_+)$/u.exec(source.slice(opening.length));
  const closing = closingMatch?.[0] ?? "";

  if (closing && getMarkerCharacterFromSyntax(closing) !== marker) {
    return null;
  }

  return {
    closing,
    contentFrom: opening.length,
    contentTo: source.length - closing.length,
    marker,
    opening,
  };
};

const getMarkerCharacterFromSyntax = (markerSyntax: string) =>
  markerSyntax.startsWith("_") ? "_" : "*";

const isProjectionMarkerText = (text: string) => /^[*_]+$/u.test(text);

const createProjectionMarkDescriptor = (
  markName: ProjectionMarkName,
  markerSyntax: string,
): ProjectionMarkDescriptor => ({
  attrs: { marker: getMarkerCharacterFromSyntax(markerSyntax) },
  markName,
});

const getActiveProjectionMarkRange = (state: EditorState): ActiveProjectionRange | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null;
  }

  const candidateMarks = [
    ...(state.storedMarks ?? []),
    ...selection.$from.marks(),
    ...(selection.$from.nodeBefore?.marks ?? []),
    ...(selection.$from.nodeAfter?.marks ?? []),
  ];
  for (const activeMark of supportedProjectionMarkNames
    .map((markName) =>
      candidateMarks.find((mark) => mark.type.name === markName && state.schema.marks[markName]),
    )
    .filter((mark): mark is Mark => Boolean(mark))) {
    const range = getMarkRangeAtSelection(state, activeMark);
    const marks = range ? getProjectionMarksForRange(state, range) : null;

    if (range && marks) {
      return {
        ...range,
        marks,
      };
    }
  }

  return null;
};

const getMarkRangeAtSelection = (state: EditorState, mark: Mark): ActiveMarkRange | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection)) {
    return null;
  }

  const { $from } = selection;
  const parent = $from.parent;
  const cursorOffset = $from.parentOffset;
  const markedRanges: TextRange[] = [];

  parent.forEach((node, offset) => {
    if (!mark.isInSet(node.marks)) {
      return;
    }

    markedRanges.push({
      from: offset,
      to: offset + node.nodeSize,
    });
  });

  const activeRange = markedRanges.find(
    (range) => range.from <= cursorOffset && cursorOffset <= range.to,
  );

  if (!activeRange) {
    return null;
  }

  let from = activeRange.from;
  let to = activeRange.to;

  for (let index = markedRanges.indexOf(activeRange) - 1; index >= 0; index -= 1) {
    const range = markedRanges[index];

    if (range.to !== from) {
      break;
    }

    from = range.from;
  }

  for (let index = markedRanges.indexOf(activeRange) + 1; index < markedRanges.length; index += 1) {
    const range = markedRanges[index];

    if (range.from !== to) {
      break;
    }

    to = range.to;
  }

  return {
    from: $from.start() + from,
    mark,
    to: $from.start() + to,
  };
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
  if (node.marks.some((mark) => !isProjectionMarkName(mark.type.name))) {
    return [];
  }

  return supportedProjectionMarkNames.flatMap((markName) => {
    const mark = node.marks.find((candidateMark) => candidateMark.type.name === markName);

    return mark ? [{ attrs: { ...mark.attrs }, markName }] : [];
  });
};

const isProjectionMarkName = (markName: string): markName is ProjectionMarkName =>
  supportedProjectionMarkNames.includes(markName as ProjectionMarkName);

const areProjectionMarksEqual = (
  left: ProjectionMarkDescriptor[],
  right: ProjectionMarkDescriptor[],
) =>
  left.length === right.length &&
  left.every(
    (leftMark, index) =>
      leftMark.markName === right[index]?.markName &&
      getMarkerCharacter(leftMark.attrs) === getMarkerCharacter(right[index]?.attrs ?? {}),
  );

const isCaretSelection = (state: EditorState) =>
  state.selection instanceof TextSelection && state.selection.empty;

const isSelectionInsideProjection = (selection: Selection, session: ProjectionSession) =>
  isRangeInsideProjection(selection, session);

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
  state.doc.textBetween(session.from, session.to, "\n", "\n");

const getSourceMarkers = (marks: ProjectionMarkDescriptor[]) => {
  const strong = marks.find((mark) => mark.markName === "strong");
  const emphasis = marks.find((mark) => mark.markName === "emphasis");

  if (strong && emphasis) {
    const strongMarker = getSourceMarker("strong", getMarkerCharacter(strong.attrs));
    const emphasisMarker = getSourceMarker("emphasis", getMarkerCharacter(emphasis.attrs));

    return {
      closing: `${strongMarker}${emphasisMarker}`,
      opening: `${emphasisMarker}${strongMarker}`,
    };
  }

  const mark = marks[0];
  const marker = mark ? getSourceMarker(mark.markName, getMarkerCharacter(mark.attrs)) : "";

  return {
    closing: marker,
    opening: marker,
  };
};

const getMarkerCharacter = (attrs: Record<string, unknown>) =>
  String(attrs.marker ?? "*") === "_" ? "_" : "*";

const getSourceMarker = (markName: ProjectionMarkName, marker: string) =>
  markName === "strong" ? marker.repeat(2) : marker;

const isUndoKey = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey;

const isRedoKey = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) &&
  (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey));
