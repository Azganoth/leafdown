import {
  ParserReady,
  SerializerReady,
  parserCtx,
  remarkCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { closeHistory, isHistoryTransaction } from "@milkdown/kit/prose/history";
import { DOMParser, type Slice } from "@milkdown/kit/prose/model";
import type { EditorState, Selection, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $proseAsync } from "@milkdown/kit/utils";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";

import {
  applyLiteralSourceProjectionEdit,
  createLiteralSourceProjectionSlice,
  createMarkSourceProjectionAdapter,
  decodeSourceProjectionEscapes,
  findSourceProjectionInsertionCandidate,
  findSourceProjectionLiteralSourceCommit,
  findSourceProjectionTarget,
  type LiteralSourceCommit,
  type SourceProjectionAdapter,
  type SourceProjectionEdit,
  type SourceProjectionTarget,
  type SourceProjectionTargetMatch,
} from "../utils/sourceProjectionAdapters";
import { createEscapeSourceProjectionAdapter } from "../utils/sourceProjectionEscapeAdapter";
import { createFootnoteReferenceSourceProjectionAdapter } from "../utils/sourceProjectionFootnoteReferenceAdapter";
import { createLinkSourceProjectionAdapter } from "../utils/sourceProjectionLinkAdapter";
import { getRangeText, getTextBetween, type TextRange } from "../utils/textRanges";

const EMPTY_PROJECTION_STATE: SourceProjectionPluginState = {
  isLinkLabelHovered: false,
  pendingCommit: null,
  protectedRanges: [],
  session: null,
  suppressedSelection: null,
  writtenRanges: [],
};

export const leafdownSourceProjectionPluginKey = new PluginKey<SourceProjectionPluginState>(
  "leafdownSourceProjection",
);
export const SOURCE_PROJECTION_ENTRY_SUPPRESSION_META = "leafdownSourceProjectionSkipEntry";
export const SOURCE_PROJECTION_RESTRUCTURE_META = "leafdownSourceProjectionRestructure";
const SOURCE_PROJECTION_SUPPRESSED_HISTORY_META = "leafdownSourceProjectionSuppressedHistory";
const SOURCE_PROJECTION_DEFERRED_COMMIT_META = "leafdownSourceProjectionDeferredCommit";

const INLINE_BREAK_NODE_NAME = "hardbreak";

interface ProjectionSession extends TextRange {
  adapter: SourceProjectionAdapter;
  redoStack: string[];
  target: SourceProjectionTarget;
  undoStack: string[];
}

interface PendingProjectionCommit extends TextRange {
  consumedEscape: boolean;
  replacement: Slice;
  selectionAnchor: number | null;
  selectionHead: number | null;
  suppressedSelection: SuppressedProjectionSelection | null;
}

interface SuppressedProjectionSelection {
  anchor: number;
  head: number;
}

interface SourceProvenance {
  protectedRanges: TextRange[];
  writtenRanges: TextRange[];
}

interface SourceProjectionPluginState extends SourceProvenance {
  isLinkLabelHovered: boolean;
  pendingCommit: PendingProjectionCommit | null;
  session: ProjectionSession | null;
  suppressedSelection: SuppressedProjectionSelection | null;
}

type ProjectionSessionState = Omit<SourceProjectionPluginState, keyof SourceProvenance>;

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
      escapedRange: TextRange | null;
      suppressedSelection: SuppressedProjectionSelection | null;
    };

export const createSourceProjectionProsePlugin = (adapters: readonly SourceProjectionAdapter[]) => {
  let compositionSource: string | null = null;

  return new Plugin<SourceProjectionPluginState>({
    key: leafdownSourceProjectionPluginKey,
    appendTransaction: (transactions, oldState, newState) =>
      appendProjectionTransaction(transactions, oldState, newState, adapters),
    // A change captured in native history while the document holds projected source replays
    // against coordinates the commit discards. `filterTransaction` is the only hook that runs
    // before the history plugin reads the meta.
    filterTransaction: (transaction, state) => {
      if (transaction.docChanged && hasActiveSourceProjection(state)) {
        transaction.setMeta("addToHistory", false);

        if (!getProjectionMeta(transaction)) {
          transaction.setMeta(SOURCE_PROJECTION_SUPPRESSED_HISTORY_META, true);
        }
      }

      return true;
    },
    props: {
      decorations: (state) => createProjectionDecorations(state),
      handleDOMEvents: {
        compositionend: (view) => {
          const previousSource = compositionSource;

          compositionSource = null;

          if (previousSource !== null) {
            normalizeProjectionComposition(view, previousSource);
          }

          return false;
        },
        compositionstart: (view) => {
          const { session } = getSourceProjectionState(view.state);

          compositionSource = session ? getProjectionSource(view.state, session) : null;

          return false;
        },
        mouseout: (view, event) => handleProjectionLinkLabelMouseOut(view, event),
        mouseover: (view, event) => handleProjectionLinkLabelMouseOver(view, event),
        paste: (view, event) => handleProjectionPaste(view, event as ClipboardEvent),
      },
      handleDrop: (view, event, slice, moved) => handleProjectionDrop(view, event, slice, moved),
      handleKeyDown: (view, event) => handleProjectionKeyDown(view, event),
      handlePaste: (view, event, slice) => handleProjectionPaste(view, event, slice),
      handleTextInput: (view, from, to, text) =>
        handleProjectionTextInput(view, from, to, text, adapters),
    },
    state: {
      init: () => EMPTY_PROJECTION_STATE,
      apply: (transaction, pluginState, oldState, newState) =>
        applyProjectionTransaction(transaction, pluginState, oldState, newState, adapters),
    },
  });
};

export const createLeafdownSourceProjectionPlugin = () =>
  $proseAsync(async (ctx) => {
    await Promise.all([ctx.wait(ParserReady), ctx.wait(SerializerReady)]);

    const parser = ctx.get(parserCtx);
    const remark = ctx.get(remarkCtx);
    const serializer = ctx.get(serializerCtx);

    const objectAdapters = [
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
    ];

    return createSourceProjectionProsePlugin([
      ...objectAdapters,
      createEscapeSourceProjectionAdapter({
        findLiteralSourceCommit: (state, range) =>
          findSourceProjectionLiteralSourceCommit(state, range, objectAdapters),
        serializer,
      }),
    ]);
  });

const hasDeferredProjectionCommit = (transactions: readonly Transaction[]) =>
  transactions.some(
    (transaction) => transaction.getMeta(SOURCE_PROJECTION_DEFERRED_COMMIT_META) === true,
  );

const finalizeProjectionInPlace = (view: EditorView) => {
  const { session } = getSourceProjectionState(view.state);

  if (!session?.adapter.shouldFinalizeInPlace?.(view.state, session)) {
    return;
  }

  const restore = createFinalizeProjectionTransaction(view.state, session, true);

  if (!restore) {
    return;
  }

  view.dispatch(restore.setMeta(SOURCE_PROJECTION_DEFERRED_COMMIT_META, true));

  const { pendingCommit } = getSourceProjectionState(view.state);

  if (pendingCommit) {
    view.dispatch(createCommitAfterRestoreTransaction(view.state, pendingCommit));
  }
};

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

  if (!session || selection.empty || !isRangeInside(selection, session)) {
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

  if (!session || !isRangeInside(selection, session)) {
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

  if (!session || selection.empty || !isRangeInside(selection, session)) {
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

// A write the projection did not author keeps its history capture suppressed, but it is still a
// content change. Without this the dirty tracker reads the suppression as "nothing happened" and
// the document reports itself clean.
export const isSourceProjectionSuppressedHistoryTransaction = (transaction: Transaction) =>
  transaction.getMeta(SOURCE_PROJECTION_SUPPRESSED_HISTORY_META) === true;

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
  oldState: EditorState,
  state: EditorState,
  adapters: readonly SourceProjectionAdapter[],
) => {
  const projectionState = getSourceProjectionState(state);

  if (projectionState.pendingCommit) {
    return hasDeferredProjectionCommit(transactions)
      ? null
      : createCommitAfterRestoreTransaction(state, projectionState.pendingCommit);
  }

  if (projectionState.session) {
    if (isRangeInside(state.selection, projectionState.session)) {
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

  const literalSourceCommit = findExitedLiteralSourceCommit(
    transactions,
    oldState,
    state,
    adapters,
  );

  if (literalSourceCommit) {
    return state.tr.replace(
      literalSourceCommit.from,
      literalSourceCommit.to,
      literalSourceCommit.replacement,
    );
  }

  const match = findSourceProjectionTarget(state, adapters);

  if (!match || !isProjectableTarget(match, projectionState)) {
    return null;
  }

  return createEnterProjectionTransaction(state, match);
};

const isProjectableTarget = (
  { adapter, target }: SourceProjectionTargetMatch,
  { protectedRanges, writtenRanges }: SourceProjectionPluginState,
) =>
  adapter.id !== "escape" ||
  !overlapsRange(writtenRanges, target) ||
  overlapsRange(protectedRanges, target);

const mapRangeThroughTransactions = (
  transactions: readonly Transaction[],
  range: TextRange,
): TextRange =>
  transactions.reduce(
    (mapped, transaction) => ({
      from: transaction.mapping.map(mapped.from, -1),
      to: transaction.mapping.map(mapped.to, -1),
    }),
    { from: range.from, to: range.to },
  );

// A character written against a run can still move where its source ends, as every character a
// bare URL absorbs does, so only whitespace stands for the caret having left.
const isSelectionSeparatedFrom = (state: EditorState, range: TextRange) => {
  const { selection } = state;

  if (range.to <= selection.from) {
    return /\s/u.test(getTextBetween(state.doc, range.to, selection.from));
  }

  if (selection.to <= range.from) {
    return /\s/u.test(getTextBetween(state.doc, selection.to, range.from));
  }

  return false;
};

const overlapsRange = (ranges: readonly TextRange[], range: TextRange) =>
  ranges.some((candidate) => candidate.from < range.to && range.from < candidate.to);

// The run holds the previous selection, so the separator measured here contains the run's own:
// nothing that fails it can pass the check on the run.
const findExitedLiteralSourceCommit = (
  transactions: readonly Transaction[],
  oldState: EditorState,
  state: EditorState,
  adapters: readonly SourceProjectionAdapter[],
): LiteralSourceCommit | null => {
  const { protectedRanges, writtenRanges } = getSourceProjectionState(state);
  const previousRange = mapRangeThroughTransactions(transactions, oldState.selection);

  if (!writtenRanges.length || !isSelectionSeparatedFrom(state, previousRange)) {
    return null;
  }

  const commit = findSourceProjectionLiteralSourceCommit(state, previousRange, adapters);

  return commit &&
    isSelectionSeparatedFrom(state, commit) &&
    overlapsRange(writtenRanges, commit) &&
    !overlapsRange(protectedRanges, commit)
    ? commit
    : null;
};

const applyProjectionTransaction = (
  transaction: Transaction,
  pluginState: SourceProjectionPluginState,
  oldState: EditorState,
  newState: EditorState,
  adapters: readonly SourceProjectionAdapter[],
): SourceProjectionPluginState => ({
  ...applyProjectionSessionState(transaction, pluginState, oldState, newState),
  ...getUpdatedSourceProvenance(pluginState, transaction, oldState, adapters),
});

const mergeTextRanges = (ranges: TextRange[]) =>
  ranges
    .sort((left, right) => left.from - right.from || left.to - right.to)
    .reduce<TextRange[]>((merged, range) => {
      const previous = merged.at(-1);

      if (previous && range.from <= previous.to) {
        previous.to = Math.max(previous.to, range.to);
      } else {
        merged.push({ ...range });
      }

      return merged;
    }, []);

// A region reads as the file wrote it only until the first write lands in it.
const findLoadedSourceRanges = (
  oldState: EditorState,
  transaction: Transaction,
  writtenRanges: readonly TextRange[],
  adapters: readonly SourceProjectionAdapter[],
) => {
  const changedFrom = oldState.doc.content.findDiffStart(transaction.doc.content);

  if (changedFrom === null) {
    return [];
  }

  const changedTo = oldState.doc.content.findDiffEnd(transaction.doc.content)?.a;
  const positions =
    changedTo === undefined || changedTo === changedFrom ? [changedFrom] : [changedFrom, changedTo];

  return positions.flatMap((position) => {
    if (writtenRanges.some((range) => range.from <= position && position <= range.to)) {
      return [];
    }

    const loadedSource = findSourceProjectionLiteralSourceCommit(
      oldState,
      { from: position, to: position },
      adapters,
    );

    return loadedSource ? [loadedSource] : [];
  });
};

// Protected ranges map inward, so a deletion drops them and the escape can be spent deliberately,
// while written ranges map outward to take in what extends them.
const getUpdatedSourceProvenance = (
  { protectedRanges, session, writtenRanges }: SourceProjectionPluginState,
  transaction: Transaction,
  oldState: EditorState,
  adapters: readonly SourceProjectionAdapter[],
): SourceProvenance => {
  if (isHistoryTransaction(transaction)) {
    return { protectedRanges: [], writtenRanges: [] };
  }

  if (!transaction.docChanged) {
    return { protectedRanges, writtenRanges };
  }

  const { mapping } = transaction;
  const meta = getProjectionMeta(transaction);
  // A change that only moves content the document already held authors nothing, but its steps
  // re-insert what they took, which the step maps alone read as text the session wrote.
  const isRestructure = transaction.getMeta(SOURCE_PROJECTION_RESTRUCTURE_META) === true;
  const isEscapeSession =
    (meta?.type === "enter" ? meta.session : session)?.adapter.id === "escape";
  const written = writtenRanges.map((range) => ({
    from: mapping.map(range.from, -1),
    to: mapping.map(range.to, 1),
  }));
  const loaded = protectedRanges.map((range) => ({
    from: mapping.map(range.from, 1),
    to: mapping.map(range.to, -1),
  }));

  if (!isRestructure && !isEscapeSession) {
    mapping.maps.forEach((stepMap, index) => {
      const remaining = mapping.slice(index + 1);

      stepMap.forEach((_stepFrom, _stepTo, insertedFrom, insertedTo) => {
        if (insertedFrom < insertedTo) {
          written.push({ from: remaining.map(insertedFrom, -1), to: remaining.map(insertedTo, 1) });
        }
      });
    });
  }

  if (meta?.type === "commitAfterRestore" && meta.escapedRange) {
    loaded.push(meta.escapedRange);
  }

  // Text under an active projection is source the engine placed there, not source the file holds.
  const loadedSources =
    session || isRestructure
      ? []
      : findLoadedSourceRanges(oldState, transaction, writtenRanges, adapters);

  for (const loadedSource of loadedSources) {
    loaded.push({ from: mapping.map(loadedSource.from, 1), to: mapping.map(loadedSource.to, -1) });
  }

  return {
    protectedRanges: mergeTextRanges(loaded.filter((range) => range.from < range.to)),
    writtenRanges: mergeTextRanges(written),
  };
};

const applyProjectionSessionState = (
  transaction: Transaction,
  pluginState: SourceProjectionPluginState,
  oldState: EditorState,
  newState: EditorState,
): ProjectionSessionState => {
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

  if (
    transaction.docChanged &&
    (!isRangeInside(newState.selection, session) || !isProjectionRangeFlatText(newState, session))
  ) {
    return {
      isLinkLabelHovered: false,
      pendingCommit: null,
      session: null,
      suppressedSelection,
    };
  }

  if (isSourceProjectionSuppressedHistoryTransaction(transaction)) {
    const previousSource = getProjectionSource(oldState, pluginState.session);

    return {
      isLinkLabelHovered: false,
      pendingCommit: null,
      session: {
        ...session,
        redoStack: [],
        undoStack:
          previousSource === getProjectionSource(newState, session)
            ? session.undoStack
            : [...session.undoStack, previousSource],
      },
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

  if (!isRangeInside({ from, to }, session)) {
    return false;
  }

  // ProseMirror keeps the node an IME composes into alive only across a minimal change, and
  // the projection's edit path replaces its whole range.
  if (view.composing) {
    return false;
  }

  const edit = getRelativeProjectionEdit(session, from, to, text);
  const source = getProjectionSource(view.state, session);

  if (session.adapter.shouldHandleTextInput?.(source, edit) === false) {
    return applyProjectionInputAfterSource(view, edit, text, source);
  }

  dispatchProjectionEdit(view, from, to, text);

  return true;
};

const applyProjectionInputAfterSource = (
  view: EditorView,
  edit: SourceProjectionEdit,
  text: string,
  source: string,
) => {
  if (edit.from !== source.length || edit.to !== source.length) {
    return false;
  }

  if (!finalizeSourceProjection(view)) {
    return false;
  }

  view.dispatch(view.state.tr.insertText(text).scrollIntoView());

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

const handleProjectionDrop = (view: EditorView, event: DragEvent, slice: Slice, moved: boolean) => {
  const session = getSourceProjectionState(view.state).session;

  if (!session || moved) {
    return false;
  }

  const dropPosition = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;

  if (dropPosition === undefined || dropPosition < session.from || session.to < dropPosition) {
    return false;
  }

  const text = getSliceSourceText(view.state, session.adapter, slice);

  event.preventDefault();

  if (text) {
    dispatchProjectionEdit(view, dropPosition, dropPosition, text);
  }

  return true;
};

const handleProjectionPaste = (view: EditorView, event: ClipboardEvent, slice?: Slice) => {
  const session = getSourceProjectionState(view.state).session;
  const { selection } = view.state;

  if (!session || !isRangeInside(selection, session)) {
    return false;
  }

  const pastedSlice = slice ?? parseProjectionPasteSlice(view, event);
  const text =
    event.clipboardData?.getData(TEXT_PLAIN_MIME_TYPE) ||
    (pastedSlice ? getSliceSourceText(view.state, session.adapter, pastedSlice) : "");

  if (!text && !event.clipboardData && !slice) {
    return false;
  }

  event.preventDefault();

  if (text) {
    dispatchProjectionEdit(view, selection.from, selection.to, text);
  }

  return true;
};

// Milkdown's clipboard plugin claims the paste at `handlePaste` before the projection sees a
// slice there, and the DOM event, the only hook that runs earlier, arrives before ProseMirror
// parses anything.
const parseProjectionPasteSlice = (view: EditorView, event: ClipboardEvent) => {
  const html = event.clipboardData?.getData(TEXT_HTML_MIME_TYPE);

  if (!html) {
    return null;
  }

  const transformed =
    view.someProp("transformPastedHTML", (transform) => transform(html, view)) ?? html;
  const template = document.createElement("template");

  template.innerHTML = transformed;

  return DOMParser.fromSchema(view.state.schema).parseSlice(template.content);
};

// A projected range holds one flat run of inline source, so only a slice that is itself one such
// run has a faithful source form. An open textblock is how a parse delivers inline content rather
// than block structure.
const getSliceSourceText = (state: EditorState, adapter: SourceProjectionAdapter, slice: Slice) => {
  const { content } = slice;
  const wrapper = content.childCount === 1 ? content.firstChild : null;
  const inlineContent =
    wrapper?.isTextblock && slice.openStart > 0 && slice.openEnd > 0 ? wrapper.content : content;

  return adapter.serializeInlineSource?.(state, inlineContent) ?? "";
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
  finalizeProjectionInPlace(view);
};

// `handleTextInput` declines while a composition is in flight, so a composed character misses the
// remapping that keeps an insertion out of a delimiter. Correcting it before the browser finishes
// ends the composition.
const normalizeProjectionComposition = (view: EditorView, previousSource: string) => {
  const session = getSourceProjectionState(view.state).session;

  if (!session) {
    return;
  }

  const composedSource = getProjectionSource(view.state, session);
  const edit = getProjectionSourceEdit(previousSource, composedSource);

  if (!edit || session.adapter.shouldHandleTextInput?.(previousSource, edit) === false) {
    return;
  }

  const result = (session.adapter.applyEdit ?? applyLiteralSourceProjectionEdit)(
    previousSource,
    edit,
  );

  if (result.source === composedSource) {
    return;
  }

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
      // The composed write already recorded the source it replaced, so this correction must not
      // leave a second entry to undo.
      previousSource: result.source,
      type: "userEdit",
    } satisfies ProjectionMeta);

  view.dispatch(transaction);
};

const getProjectionSourceEdit = (
  previousSource: string,
  nextSource: string,
): SourceProjectionEdit | null => {
  if (previousSource === nextSource) {
    return null;
  }

  let from = 0;

  while (
    from < previousSource.length &&
    from < nextSource.length &&
    previousSource[from] === nextSource[from]
  ) {
    from += 1;
  }

  let suffixLength = 0;

  while (
    suffixLength < previousSource.length - from &&
    suffixLength < nextSource.length - from &&
    previousSource.at(-1 - suffixLength) === nextSource.at(-1 - suffixLength)
  ) {
    suffixLength += 1;
  }

  return {
    from,
    text: nextSource.slice(from, nextSource.length - suffixLength),
    to: previousSource.length - suffixLength,
  };
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

  if (!isRangeInside(selection, session)) {
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
  isInPlace = false,
): Transaction | null => {
  const source = getProjectionSource(state, session);
  const { adapter } = session;
  const parsed = adapter.parseSource(state, source, session.target);
  const original = {
    ...adapter.parseSource(state, session.target.originalSource, session.target),
    replacement: session.target.originalContent,
    replacementSize: session.target.originalContentSize,
  };
  const shouldSuppressProjectionAtSelection = isRangeInside(state.selection, session);
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
  const suppressedSelection =
    shouldSuppressProjectionAtSelection && !isInPlace ? restoreSelection : null;

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
    consumedEscape: decodeSourceProjectionEscapes(source) !== source,
    isInPlace,
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
  consumedEscape: boolean;
  isInPlace: boolean;
  replacement: Slice;
  restoreSelection: { anchor: number; head: number } | null;
  session: ProjectionSession;
  source: string;
  state: EditorState;
  suppressedSelection: SuppressedProjectionSelection | null;
}

const createRestoreBeforeCommitTransaction = ({
  commitSelection,
  consumedEscape,
  isInPlace,
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
          consumedEscape,
          from: session.from,
          replacement,
          selectionAnchor: commitSelection?.anchor ?? null,
          selectionHead: commitSelection?.head ?? null,
          suppressedSelection: isInPlace ? null : commitSelection,
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
      escapedRange: pendingCommit.consumedEscape
        ? { from: pendingCommit.from, to: pendingCommit.from + pendingCommit.replacement.size }
        : null,
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

const isRangeInside = (range: TextRange, bounds: TextRange) =>
  bounds.from <= range.from && range.to <= bounds.to;

// The projected range is modelled as flat literal text, and `getTextBetween` reads every leaf
// node back as a newline. A hard break is the only node that survives that reading, since it
// already stands for the newline it reports; any other node would commit as a line break the
// author never wrote.
const isProjectionRangeFlatText = (state: EditorState, { from, to }: TextRange) => {
  let isFlatText = state.doc.resolve(from).sameParent(state.doc.resolve(to));

  state.doc.nodesBetween(from, to, (node) => {
    if (node.isInline && !node.isText && node.type.name !== INLINE_BREAK_NODE_NAME) {
      isFlatText = false;
    }

    return isFlatText;
  });

  return isFlatText;
};

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
