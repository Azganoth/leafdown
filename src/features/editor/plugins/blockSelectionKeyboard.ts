import type { ResolvedPos } from "@milkdown/kit/prose/model";
import {
  AllSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
  type SelectionBookmark,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import {
  hasNonPrimaryModifierEvent,
  isPrimaryModifierEvent,
  normalizeKeyboardKey,
} from "@/lib/input";

import {
  BlockSelection,
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
  type SelectableBlockTarget,
} from "./blockSelection";
import { finalizeSourceProjection, hasActiveSourceProjection } from "./sourceProjection";

interface BlockSelectionKeyboardState {
  bookmark: SelectionBookmark | null;
  structuralAll: boolean;
}

const EMPTY_KEYBOARD_STATE: BlockSelectionKeyboardState = {
  bookmark: null,
  structuralAll: false,
};

export const leafdownBlockSelectionKeyboardPluginKey = new PluginKey<BlockSelectionKeyboardState>(
  "leafdownBlockSelectionKeyboard",
);

const getKeyboardState = (state: EditorState) =>
  leafdownBlockSelectionKeyboardPluginKey.getState(state) ?? EMPTY_KEYBOARD_STATE;

export const getBlockSelectionEditingBookmark = (state: EditorState) =>
  getKeyboardState(state).bookmark;

export const isStructuralBlockSelection = (state: EditorState) => {
  const keyboardState = getKeyboardState(state);

  return (
    state.selection instanceof BlockSelection ||
    (keyboardState.structuralAll && state.selection instanceof AllSelection)
  );
};

const getParentKey = (doc: EditorState["doc"], pos: number) => {
  const $pos = doc.resolve(pos);

  return `${String($pos.depth)}:${String($pos.start($pos.depth))}`;
};

const getSiblingTargets = (doc: EditorState["doc"], pos: number) => {
  const parentKey = getParentKey(doc, pos);

  return getSelectableBlockTargets(doc).filter(
    (target) => getParentKey(doc, target.pos) === parentKey,
  );
};

const getNearestTarget = (state: EditorState) => {
  const position = state.selection.$head.pos;

  return getSelectableBlockTargets(state.doc)
    .filter(({ node, pos }) => pos <= position && position <= pos + node.nodeSize)
    .toSorted((left, right) => left.node.nodeSize - right.node.nodeSize)[0];
};

const getContainingTarget = (selection: BlockSelection) => {
  const { doc } = selection.$anchorBlock;
  const from = Math.min(selection.$anchorBlock.pos, selection.$headBlock.pos);
  const to = Math.max(
    selection.$anchorBlock.pos + selection.$anchorBlock.nodeAfter!.nodeSize,
    selection.$headBlock.pos + selection.$headBlock.nodeAfter!.nodeSize,
  );

  return getSelectableBlockTargets(doc)
    .filter(({ node, pos }) => pos < from && to <= pos + node.nodeSize)
    .toSorted((left, right) => left.node.nodeSize - right.node.nodeSize)[0];
};

const selectsSiblingGroup = (
  selection: BlockSelection,
  siblings: readonly SelectableBlockTarget[],
) => {
  const first = siblings[0];
  const last = siblings.at(-1);

  if (!first || !last) {
    return false;
  }

  return (
    (selection.$anchorBlock.pos === first.pos && selection.$headBlock.pos === last.pos) ||
    (selection.$anchorBlock.pos === last.pos && selection.$headBlock.pos === first.pos)
  );
};

const isInsideTable = ($pos: ResolvedPos) => {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === "table") {
      return true;
    }
  }

  return false;
};

const canEnterBlockSelection = (state: EditorState) =>
  state.selection instanceof TextSelection && !isInsideTable(state.selection.$head);

const dispatchStructuralSelection = (
  view: EditorView,
  selection: Selection,
  bookmark: SelectionBookmark | null,
  structuralAll = false,
) => {
  view.dispatch(
    view.state.tr.setSelection(selection).setMeta(leafdownBlockSelectionKeyboardPluginKey, {
      bookmark,
      structuralAll,
    } satisfies BlockSelectionKeyboardState),
  );
};

const findEditableSelection = (view: EditorView, selection: BlockSelection) => {
  const { doc } = view.state;
  const $headBlock = doc.resolve(selection.$headBlock.pos);
  const insideHead = Selection.findFrom(doc.resolve($headBlock.pos + 1), 1, true);

  if (insideHead instanceof TextSelection) {
    return insideHead;
  }

  return TextSelection.near($headBlock, 1);
};

const restoreEditingSelection = (view: EditorView, selection: BlockSelection | null) => {
  const { bookmark } = getKeyboardState(view.state);
  const restored = bookmark?.resolve(view.state.doc);
  const next =
    restored instanceof TextSelection
      ? restored
      : selection
        ? findEditableSelection(view, selection)
        : TextSelection.atStart(view.state.doc);

  dispatchStructuralSelection(view, next, null);
  view.focus();
};

const enterFromTextSelection = (view: EditorView) => {
  if (!canEnterBlockSelection(view.state)) {
    return false;
  }

  finalizeSourceProjection(view);

  if (!canEnterBlockSelection(view.state)) {
    return false;
  }

  const target = getNearestTarget(view.state);

  if (!target) {
    return false;
  }

  dispatchStructuralSelection(
    view,
    createHierarchicalBlockSelection(view.state.doc, target.pos),
    view.state.selection.getBookmark(),
  );

  return true;
};

const progressSelection = (view: EditorView) => {
  const { selection } = view.state;

  if (!(selection instanceof BlockSelection)) {
    return enterFromTextSelection(view);
  }

  const keyboardState = getKeyboardState(view.state);
  const siblings = getSiblingTargets(view.state.doc, selection.$headBlock.pos);

  if (!selectsSiblingGroup(selection, siblings)) {
    const first = siblings[0];
    const last = siblings.at(-1);

    if (!first || !last) {
      return false;
    }

    dispatchStructuralSelection(
      view,
      createHierarchicalBlockSelection(view.state.doc, first.pos, last.pos),
      keyboardState.bookmark,
    );
    return true;
  }

  const containing = getContainingTarget(selection);

  if (containing) {
    dispatchStructuralSelection(
      view,
      createHierarchicalBlockSelection(view.state.doc, containing.pos),
      keyboardState.bookmark,
    );
    return true;
  }

  dispatchStructuralSelection(view, new AllSelection(view.state.doc), keyboardState.bookmark, true);
  return true;
};

const moveHead = (view: EditorView, direction: -1 | 1, extend: boolean) => {
  const { selection } = view.state;

  if (!(selection instanceof BlockSelection)) {
    return false;
  }

  const siblings = getSiblingTargets(view.state.doc, selection.$headBlock.pos);
  const index = siblings.findIndex((target) => target.pos === selection.$headBlock.pos);
  const target = siblings[index + direction];

  if (!target) {
    return true;
  }

  const keyboardState = getKeyboardState(view.state);
  const next = extend
    ? createHierarchicalBlockSelection(view.state.doc, selection.$anchorBlock.pos, target.pos)
    : createHierarchicalBlockSelection(view.state.doc, target.pos);

  dispatchStructuralSelection(view, next, keyboardState.bookmark);
  return true;
};

const isProgressiveSelectAll = (event: KeyboardEvent) =>
  isPrimaryModifierEvent(event) &&
  !hasNonPrimaryModifierEvent(event) &&
  !event.altKey &&
  !event.shiftKey &&
  normalizeKeyboardKey(event.key) === "a";

export const createLeafdownBlockSelectionKeyboardPlugin = () =>
  $prose(() => {
    const handleKeyDown = (view: EditorView, event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return false;
      }

      if (isProgressiveSelectAll(event)) {
        if (
          getKeyboardState(view.state).structuralAll &&
          view.state.selection instanceof AllSelection
        ) {
          event.preventDefault();
          return true;
        }

        const handled = progressSelection(view);

        if (handled) {
          event.preventDefault();
        }

        return handled;
      }

      if (event.key === "Escape") {
        if (hasActiveSourceProjection(view.state)) {
          return false;
        }

        if (view.state.selection instanceof BlockSelection) {
          restoreEditingSelection(view, view.state.selection);
          event.preventDefault();
          return true;
        }

        if (
          getKeyboardState(view.state).structuralAll &&
          view.state.selection instanceof AllSelection
        ) {
          restoreEditingSelection(view, null);
          event.preventDefault();
          return true;
        }

        const handled = enterFromTextSelection(view);

        if (handled) {
          event.preventDefault();
        }

        return handled;
      }

      if (event.key === "Enter" && isStructuralBlockSelection(view.state)) {
        restoreEditingSelection(
          view,
          view.state.selection instanceof BlockSelection ? view.state.selection : null,
        );
        event.preventDefault();
        return true;
      }

      if (
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        const handled = moveHead(view, event.key === "ArrowUp" ? -1 : 1, event.shiftKey);

        if (handled) {
          event.preventDefault();
        }

        return handled;
      }

      return false;
    };

    return new Plugin<BlockSelectionKeyboardState>({
      key: leafdownBlockSelectionKeyboardPluginKey,
      state: {
        init: () => EMPTY_KEYBOARD_STATE,
        apply: (transaction, value, _oldState, newState) => {
          const meta = transaction.getMeta(leafdownBlockSelectionKeyboardPluginKey) as
            | BlockSelectionKeyboardState
            | undefined;

          if (meta) {
            return meta;
          }

          if (transaction.selectionSet) {
            return EMPTY_KEYBOARD_STATE;
          }

          return {
            ...value,
            bookmark: value.bookmark?.map(transaction.mapping) ?? null,
            structuralAll: value.structuralAll && newState.selection instanceof AllSelection,
          };
        },
      },
      props: {
        handleKeyDown,
      },
    });
  });
