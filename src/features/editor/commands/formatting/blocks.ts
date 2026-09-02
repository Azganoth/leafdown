import { lift, wrapIn } from "@milkdown/kit/prose/commands";
import type { Node as ProseMirrorNode, NodeType } from "@milkdown/kit/prose/model";
import { liftListItem, sinkListItem, wrapInList } from "@milkdown/kit/prose/schema-list";
import type { Command, EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { createConvertedListItemAttrs } from "../../utils/listMarkdown";
import { getNodeType, runProseMirrorCommand } from "../../utils/milkdown";

interface NodeRange {
  node: ProseMirrorNode;
  pos: number;
}

interface AncestorNodeRange extends NodeRange {
  depth: number;
}

type BlockAttrs = Record<string, unknown>;

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const BLOCKQUOTE_NODE_NAMES = new Set(["blockquote"]);
const LIST_NODE_NAMES = new Set(["bullet_list", "ordered_list"]);
const MAX_BLOCK_CLEAR_LIFTS = 8;

const getTextBlocksInSelection = (state: EditorState): NodeRange[] => {
  const { selection } = state;

  if (selection.empty) {
    const { $from } = selection;

    if (!$from.parent.isTextblock) {
      return [];
    }

    return [
      {
        node: $from.parent,
        pos: $from.before($from.depth),
      },
    ];
  }

  const blocks: NodeRange[] = [];

  state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!node.isTextblock) {
      return true;
    }

    blocks.push({ node, pos });

    return false;
  });

  return blocks;
};

const textBlocksAllMatch = (state: EditorState, predicate: (node: ProseMirrorNode) => boolean) => {
  const textBlocks = getTextBlocksInSelection(state);

  return textBlocks.length > 0 && textBlocks.every(({ node }) => predicate(node));
};

// A command changes the block it acts on rather than authoring a new one, so a block that stays the
// construct it already was keeps every attribute the command does not name, the authored form among
// them. A block that becomes another construct carries nothing over, because the form belonged to
// the construct that is gone.
const resolveTextBlockAttrs =
  (nodeType: NodeType, attrs: BlockAttrs | null) => (node: ProseMirrorNode) =>
    node.type === nodeType ? { ...node.attrs, ...attrs } : (attrs ?? {});

// `setBlockType` upstream builds every block it changes from one set of attributes, which cannot
// hold a form each block carries its own copy of, so the resolver stands in for that argument. The
// applicability pass is the upstream one, reading each block's own attributes the way the change
// that follows does.
const setTextBlockType =
  (nodeType: NodeType, attrs: BlockAttrs | null): Command =>
  (state, dispatch) => {
    const resolveAttrs = resolveTextBlockAttrs(nodeType, attrs);
    let applicable = false;

    for (const { $from, $to } of state.selection.ranges) {
      if (applicable) {
        break;
      }

      state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
        if (applicable) {
          return false;
        }

        if (!node.isTextblock || node.hasMarkup(nodeType, resolveAttrs(node))) {
          return;
        }

        if (node.type === nodeType) {
          applicable = true;

          return;
        }

        const $pos = state.doc.resolve(pos);
        const index = $pos.index();

        applicable = $pos.parent.canReplaceWith(index, index + 1, nodeType);
      });
    }

    if (!applicable) {
      return false;
    }

    if (dispatch) {
      const tr = state.tr;

      for (const { $from, $to } of state.selection.ranges) {
        tr.setBlockType($from.pos, $to.pos, nodeType, resolveAttrs);
      }

      dispatch(tr.scrollIntoView());
    }

    return true;
  };

const setSelectionTextBlockType = (
  view: EditorView,
  nodeName: string,
  attrs: BlockAttrs | null = null,
) => {
  const nodeType = getNodeType(view.state, nodeName);

  if (!nodeType) {
    return false;
  }

  return runProseMirrorCommand(view, setTextBlockType(nodeType, attrs));
};

const toggleTextBlockType = (
  view: EditorView,
  nodeName: string,
  attrs: BlockAttrs | null = null,
) => {
  const shouldClear = textBlocksAllMatch(
    view.state,
    (node) =>
      node.type.name === nodeName &&
      Object.entries(attrs ?? {}).every(([key, value]) => node.attrs[key] === value),
  );

  return shouldClear
    ? setSelectionTextBlockType(view, "paragraph")
    : setSelectionTextBlockType(view, nodeName, attrs);
};

const adjustSelectedHeadingLevels = (view: EditorView, delta: number) => {
  const headingType = getNodeType(view.state, "heading");
  const headingBlocks = getTextBlocksInSelection(view.state).filter(
    ({ node }) => node.type === headingType,
  );

  if (!headingType || headingBlocks.length === 0) {
    return false;
  }

  const tr = view.state.tr;
  let changed = false;

  for (const { node, pos } of headingBlocks) {
    const level = Number(node.attrs.level);
    const nextLevel = level + delta;

    if (nextLevel < 1 || nextLevel > 6) {
      continue;
    }

    tr.setNodeMarkup(pos, undefined, { ...node.attrs, level: nextLevel }, node.marks);
    changed = true;
  }

  if (!changed) {
    return false;
  }

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

const findAncestor = (state: EditorState, nodeNames: Set<string>): AncestorNodeRange | null => {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (nodeNames.has(node.type.name)) {
      return {
        depth,
        node,
        pos: $from.before(depth),
      };
    }
  }

  return null;
};

const findCurrentList = (state: EditorState) => findAncestor(state, LIST_NODE_NAMES);

const toggleListFormat = (view: EditorView, listNodeName: "bullet_list" | "ordered_list") => {
  const listType = getNodeType(view.state, listNodeName);
  const listItemType = getNodeType(view.state, "list_item");

  if (!listType || !listItemType) {
    return false;
  }

  const currentList = findCurrentList(view.state);

  if (currentList?.node.type === listType) {
    return runProseMirrorCommand(view, liftListItem(listItemType));
  }

  if (currentList) {
    const ordered = listNodeName === "ordered_list";
    // The list becomes another construct, so it is written in the default form for the one it
    // becomes: a bullet list carries no ordered delimiter and an ordered one no bullet. Tightness
    // is not a form the conversion replaces, and nothing about it asks for a blank line between
    // items, so the list keeps the spread it had.
    const tr = view.state.tr.setNodeMarkup(currentList.pos, listType, {
      spread: currentList.node.attrs.spread,
    });

    currentList.node.forEach((item, offset, index) => {
      tr.setNodeMarkup(
        currentList.pos + 1 + offset,
        undefined,
        { ...item.attrs, ...createConvertedListItemAttrs(ordered, index) },
        item.marks,
      );
    });

    view.focus();
    view.dispatch(tr.scrollIntoView());

    return true;
  }

  return runProseMirrorCommand(view, wrapInList(listType));
};

const getSelectedListItems = (state: EditorState): NodeRange[] => {
  const listItemType = getNodeType(state, "list_item");

  if (!listItemType) {
    return [];
  }

  const listItemPositions = new Map<number, ProseMirrorNode>();
  const addListItemForPosition = (pos: number) => {
    const $pos = state.doc.resolve(pos);

    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);

      if (node.type === listItemType) {
        listItemPositions.set($pos.before(depth), node);
        break;
      }
    }
  };

  if (state.selection.empty) {
    addListItemForPosition(state.selection.from);
  } else {
    for (const block of getTextBlocksInSelection(state)) {
      addListItemForPosition(block.pos + 1);
    }
  }

  return Array.from(listItemPositions, ([pos, node]) => ({ node, pos }));
};

const updateSelectedTaskState = (
  view: EditorView,
  getChecked: (node: ProseMirrorNode) => boolean | null,
) => {
  const listItems = getSelectedListItems(view.state);

  if (listItems.length === 0) {
    return false;
  }

  const tr = view.state.tr;

  for (const { node, pos } of listItems) {
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: getChecked(node) }, node.marks);
  }

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

/* Commands */

export const setParagraph = (view: EditorView) => setSelectionTextBlockType(view, "paragraph");

export const toggleHeading = (view: EditorView, level: HeadingLevel) =>
  toggleTextBlockType(view, "heading", { level });

export const increaseHeadingLevel = (view: EditorView) => adjustSelectedHeadingLevels(view, 1);

export const decreaseHeadingLevel = (view: EditorView) => adjustSelectedHeadingLevels(view, -1);

export const toggleOrderedList = (view: EditorView) => toggleListFormat(view, "ordered_list");

export const toggleUnorderedList = (view: EditorView) => toggleListFormat(view, "bullet_list");

export const toggleTaskList = (view: EditorView) => {
  const selectedListItems = getSelectedListItems(view.state);
  const allSelectedItemsAreTasks =
    selectedListItems.length > 0 &&
    selectedListItems.every(({ node }) => node.attrs.checked != null);

  if (allSelectedItemsAreTasks) {
    return updateSelectedTaskState(view, () => null);
  }

  if (selectedListItems.length === 0 && !toggleListFormat(view, "bullet_list")) {
    return false;
  }

  return updateSelectedTaskState(view, () => false);
};

export const increaseListIndent = (view: EditorView) => {
  const listItemType = getNodeType(view.state, "list_item");

  if (!listItemType) {
    return false;
  }

  return runProseMirrorCommand(view, sinkListItem(listItemType));
};

export const decreaseListIndent = (view: EditorView) => {
  const listItemType = getNodeType(view.state, "list_item");

  if (!listItemType) {
    return false;
  }

  return runProseMirrorCommand(view, liftListItem(listItemType));
};

export const toggleTaskChecked = (view: EditorView) =>
  updateSelectedTaskState(view, (node) =>
    node.attrs.checked == null ? null : !node.attrs.checked,
  );

export const toggleBlockquote = (view: EditorView) => {
  const blockquoteType = getNodeType(view.state, "blockquote");

  if (!blockquoteType) {
    return false;
  }

  return findAncestor(view.state, BLOCKQUOTE_NODE_NAMES)
    ? runProseMirrorCommand(view, lift)
    : runProseMirrorCommand(view, wrapIn(blockquoteType));
};

export const toggleCodeBlock = (view: EditorView) =>
  toggleTextBlockType(view, "code_block", { language: "" });

export const clearBlockFormat = (view: EditorView) => {
  const paragraphType = getNodeType(view.state, "paragraph");
  const listItemType = getNodeType(view.state, "list_item");

  if (!paragraphType) {
    return false;
  }

  let handled = false;

  if (listItemType) {
    for (
      let index = 0;
      index < MAX_BLOCK_CLEAR_LIFTS && runProseMirrorCommand(view, liftListItem(listItemType));
      index += 1
    ) {
      handled = true;
    }
  }

  for (
    let index = 0;
    index < MAX_BLOCK_CLEAR_LIFTS && runProseMirrorCommand(view, lift);
    index += 1
  ) {
    handled = true;
  }

  const didSetParagraph = setSelectionTextBlockType(view, "paragraph");

  return didSetParagraph || handled;
};

/* State */

export const canChangeHeadingLevel = (state: EditorState, delta: number) =>
  getTextBlocksInSelection(state).some(({ node }) => {
    if (node.type.name !== "heading") {
      return false;
    }

    const nextLevel = Number(node.attrs.level) + delta;

    return nextLevel >= 1 && nextLevel <= 6;
  });

export const canToggleTaskChecked = (state: EditorState) =>
  getSelectedListItems(state).some(({ node }) => node.attrs.checked != null);

export const canIncreaseListIndent = (state: EditorState) => {
  const listItemType = getNodeType(state, "list_item");

  if (!listItemType) {
    return false;
  }

  return sinkListItem(listItemType)(state);
};

export const canDecreaseListIndent = (state: EditorState) => {
  const listItemType = getNodeType(state, "list_item");

  if (!listItemType) {
    return false;
  }

  return liftListItem(listItemType)(state);
};

export const canClearBlockFormat = (state: EditorState) => {
  if (findAncestor(state, BLOCKQUOTE_NODE_NAMES) || findCurrentList(state)) {
    return true;
  }

  return getTextBlocksInSelection(state).some(
    ({ node }) => node.type.name !== "paragraph" || node.attrs.checked != null,
  );
};
