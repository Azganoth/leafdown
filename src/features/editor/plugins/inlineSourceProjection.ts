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

interface ProjectionSession extends TextRange {
  markName: ProjectionMarkName;
  originalMarkAttrs: Record<string, unknown>;
  originalSource: string;
  originalText: string;
  redoStack: string[];
  undoStack: string[];
}

interface PendingProjectionCommit extends TextRange {
  replacement: ProjectionReplacement;
  selectionPosition: number;
}

interface InlineSourceProjectionPluginState {
  pendingCommit: PendingProjectionCommit | null;
  session: ProjectionSession | null;
  suppressAt: number | null;
}

interface ProjectionReplacement {
  attrs?: Record<string, unknown>;
  markName?: ProjectionMarkName;
  text: string;
}

type ProjectionMarkName = "emphasis" | "strong";

type ProjectionMeta =
  | { session: ProjectionSession; type: "enter" }
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
  | { attrs: Record<string, unknown>; markName: ProjectionMarkName; text: string; type: "mark" }
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

  if (!session || source === undefined) {
    return false;
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

  if (!session || source === undefined) {
    return false;
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

  if (meta?.type === "enter") {
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

  return DecorationSet.create(state.doc, [
    Decoration.inline(session.from, session.to, {
      class: "leafdown-inline-source-projection",
      "data-leafdown-inline-source": session.markName,
    }),
  ]);
};

const handleProjectionTextInput = (view: EditorView, from: number, to: number, text: string) => {
  const session = getInlineSourceProjectionState(view.state).session;

  if (!session || !isRangeInsideProjection({ from, to }, session)) {
    return false;
  }

  dispatchProjectionEdit(view, from, to, text);

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
  const transaction =
    text.length > 0 ? view.state.tr.insertText(text, from, to) : view.state.tr.delete(from, to);
  const nextPosition = from + text.length;

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

const createEnterProjectionTransaction = (state: EditorState, range: ActiveMarkRange) => {
  const originalText = state.doc.textBetween(range.from, range.to, "\n", "\n");
  const markName = range.mark.type.name as ProjectionMarkName;
  const marker = getMarkerCharacter(range.mark);
  const sourceMarker = getSourceMarker(markName, marker);
  const originalSource = `${sourceMarker}${originalText}${sourceMarker}`;
  const selectionOffset = Math.min(
    Math.max(state.selection.from - range.from, 0),
    originalText.length,
  );
  const selectionPosition = range.from + sourceMarker.length + selectionOffset;
  const session = {
    from: range.from,
    markName,
    originalMarkAttrs: { ...range.mark.attrs },
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
  const restoreSelectionPosition = getMappedFinalizeSelectionPosition(
    state.selection.from,
    session,
    session.originalText.length,
  );
  const commitSelectionPosition = getMappedFinalizeSelectionPosition(
    state.selection.from,
    session,
    replacement.text.length,
  );
  const pendingCommit =
    source === session.originalSource
      ? null
      : {
          from: session.from,
          replacement,
          selectionPosition: commitSelectionPosition,
          to: session.from + session.originalText.length,
        };
  const transaction = replaceProjectionRange(
    state.tr,
    session.from,
    session.to,
    getMarkedTextReplacement(
      state,
      session.originalText,
      session.markName,
      session.originalMarkAttrs,
    ),
  );

  transaction
    .setSelection(TextSelection.create(transaction.doc, restoreSelectionPosition))
    .setStoredMarks([])
    .setMeta("addToHistory", false)
    .setMeta(leafdownInlineSourceProjectionPluginKey, {
      pendingCommit,
      suppressAt: restoreSelectionPosition,
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
    pendingCommit.replacement.markName
      ? getMarkedTextReplacement(
          state,
          pendingCommit.replacement.text,
          pendingCommit.replacement.markName,
          pendingCommit.replacement.attrs ?? {},
        )
      : getLiteralTextReplacement(state, pendingCommit.replacement.text),
  );

  transaction
    .setSelection(TextSelection.create(transaction.doc, pendingCommit.selectionPosition))
    .setStoredMarks([])
    .setMeta(leafdownInlineSourceProjectionPluginKey, {
      suppressAt: pendingCommit.selectionPosition,
      type: "finalizeCommit",
    } satisfies ProjectionMeta)
    .scrollIntoView();

  return closeHistory(transaction);
};

const getMappedFinalizeSelectionPosition = (
  position: number,
  session: ProjectionSession,
  replacementLength: number,
) => {
  if (position <= session.from) {
    return position;
  }

  if (position >= session.to) {
    return session.from + replacementLength + (position - session.to);
  }

  return session.from + replacementLength;
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
  markName: ProjectionMarkName,
  attrs: Record<string, unknown>,
) =>
  text.length > 0 ? state.schema.text(text, [state.schema.marks[markName].create(attrs)]) : null;

const getLiteralTextReplacement = (state: EditorState, text: string) =>
  text.length > 0 ? state.schema.text(text) : null;

const getProjectionReplacement = (
  parsed: ParsedProjectionSource,
  source: string,
): ProjectionReplacement =>
  parsed.type === "mark"
    ? {
        attrs: parsed.attrs,
        markName: parsed.markName,
        text: parsed.text,
      }
    : {
        text: source,
      };

const parseProjectionSource = (source: string): ParsedProjectionSource => {
  const strong = /^(?<marker>\*\*|__)(?<text>.+)\k<marker>$/u.exec(source);

  if (strong?.groups) {
    return {
      attrs: { marker: strong.groups.marker.startsWith("*") ? "*" : "_" },
      markName: "strong",
      text: strong.groups.text,
      type: "mark",
    };
  }

  const emphasis = /^(?<marker>\*|_)(?<text>.+)\k<marker>$/u.exec(source);

  if (emphasis?.groups) {
    const { marker, text } = emphasis.groups;

    if (text.startsWith(marker) || text.endsWith(marker)) {
      return {
        text: source,
        type: "literal",
      };
    }

    return {
      attrs: { marker },
      markName: "emphasis",
      text,
      type: "mark",
    };
  }

  return {
    text: source,
    type: "literal",
  };
};

const getActiveProjectionMarkRange = (state: EditorState): ActiveMarkRange | null => {
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
  const activeMark =
    supportedProjectionMarkNames
      .map((markName) =>
        candidateMarks.find((mark) => mark.type.name === markName && state.schema.marks[markName]),
      )
      .find(Boolean) ?? null;
  const range = activeMark ? getMarkRangeAtSelection(state, activeMark) : null;

  if (!range || !isProjectionRangeSupported(state, range)) {
    return null;
  }

  return range;
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

const isProjectionRangeSupported = (state: EditorState, range: ActiveMarkRange) => {
  let supported = true;

  state.doc.nodesBetween(range.from, range.to, (node) => {
    if (node.isText) {
      if (node.marks.some((mark) => mark.type !== range.mark.type)) {
        supported = false;
        return false;
      }

      return true;
    }

    if (node.isInline) {
      supported = false;
      return false;
    }

    return true;
  });

  return supported;
};

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

const getMarkerCharacter = (mark: Mark) => (String(mark.attrs.marker ?? "*") === "_" ? "_" : "*");

const getSourceMarker = (markName: ProjectionMarkName, marker: string) =>
  markName === "strong" ? marker.repeat(2) : marker;

const isUndoKey = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey;

const isRedoKey = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) &&
  (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey));
