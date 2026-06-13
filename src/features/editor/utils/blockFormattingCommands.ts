import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { lift, setBlockType, wrapIn } from "@milkdown/kit/prose/commands";
import { liftListItem, sinkListItem, wrapInList } from "@milkdown/kit/prose/schema-list";
import type { Command, EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { EditorCommandId } from "../types";

type BlockFormatCommandId =
  | "format.paragraph"
  | "format.heading1"
  | "format.heading2"
  | "format.heading3"
  | "format.heading4"
  | "format.heading5"
  | "format.heading6"
  | "format.increaseHeading"
  | "format.decreaseHeading"
  | "format.orderedList"
  | "format.unorderedList"
  | "format.taskList"
  | "format.increaseListIndent"
  | "format.decreaseListIndent"
  | "format.toggleTaskChecked"
  | "format.blockquote"
  | "format.codeBlock"
  | "format.clearBlock";

interface NodeRange {
  node: ProseMirrorNode;
  pos: number;
}

interface AncestorNodeRange extends NodeRange {
  depth: number;
}

const headingCommandLevels: Partial<Record<BlockFormatCommandId, number>> = {
  "format.heading1": 1,
  "format.heading2": 2,
  "format.heading3": 3,
  "format.heading4": 4,
  "format.heading5": 5,
  "format.heading6": 6,
};

const listNodeNames = new Set(["bullet_list", "ordered_list"]);

const runProseMirrorCommand = (view: EditorView, command: Command) => {
  view.focus();
  return command(view.state, view.dispatch, view);
};

const getNodeType = (state: EditorState, nodeName: string) => state.schema.nodes[nodeName] ?? null;

const getTextBlocksInSelection = (state: EditorState): NodeRange[] => {
  const { selection } = state;

  if (selection.empty) {
    const { $from } = selection;

    return $from.parent.isTextblock
      ? [
          {
            node: $from.parent,
            pos: $from.before($from.depth),
          },
        ]
      : [];
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

const setSelectionTextBlockType = (
  view: EditorView,
  nodeName: string,
  attrs: Record<string, unknown> | null = null,
) => {
  const nodeType = getNodeType(view.state, nodeName);

  return nodeType ? runProseMirrorCommand(view, setBlockType(nodeType, attrs)) : false;
};

const toggleTextBlockType = (
  view: EditorView,
  nodeName: string,
  attrs: Record<string, unknown> | null = null,
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

const findCurrentList = (state: EditorState) => findAncestor(state, listNodeNames);

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
    const tr = view.state.tr.setNodeMarkup(currentList.pos, listType);

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

const toggleTaskList = (view: EditorView) => {
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

export const toggleTaskCheckedAt = (view: EditorView, pos: number) => {
  const node = view.state.doc.nodeAt(pos);

  if (node?.type.name !== "list_item" || node.attrs.checked == null) {
    return false;
  }

  const tr = view.state.tr.setNodeMarkup(
    pos,
    undefined,
    { ...node.attrs, checked: !node.attrs.checked },
    node.marks,
  );

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

const toggleSelectedTaskChecked = (view: EditorView) =>
  updateSelectedTaskState(view, (node) =>
    node.attrs.checked == null ? null : !node.attrs.checked,
  );

const toggleBlockquote = (view: EditorView) => {
  const blockquoteType = getNodeType(view.state, "blockquote");

  if (!blockquoteType) {
    return false;
  }

  return findAncestor(view.state, new Set(["blockquote"]))
    ? runProseMirrorCommand(view, lift)
    : runProseMirrorCommand(view, wrapIn(blockquoteType));
};

const clearBlockFormatting = (view: EditorView) => {
  const paragraphType = getNodeType(view.state, "paragraph");
  const listItemType = getNodeType(view.state, "list_item");

  if (!paragraphType) {
    return false;
  }

  let handled = false;

  if (listItemType) {
    for (
      let index = 0;
      index < 8 && runProseMirrorCommand(view, liftListItem(listItemType));
      index += 1
    ) {
      handled = true;
    }
  }

  for (let index = 0; index < 8 && runProseMirrorCommand(view, lift); index += 1) {
    handled = true;
  }

  const didSetParagraph = setSelectionTextBlockType(view, "paragraph");

  return didSetParagraph || handled;
};

export const runBlockFormattingCommand = (view: EditorView, commandId: EditorCommandId) => {
  if (!isBlockFormatCommandId(commandId)) {
    return false;
  }

  const headingLevel = headingCommandLevels[commandId];

  if (headingLevel) {
    return toggleTextBlockType(view, "heading", { level: headingLevel });
  }

  switch (commandId) {
    case "format.paragraph":
      return setSelectionTextBlockType(view, "paragraph");

    case "format.increaseHeading":
      return adjustSelectedHeadingLevels(view, 1);

    case "format.decreaseHeading":
      return adjustSelectedHeadingLevels(view, -1);

    case "format.orderedList":
      return toggleListFormat(view, "ordered_list");

    case "format.unorderedList":
      return toggleListFormat(view, "bullet_list");

    case "format.taskList":
      return toggleTaskList(view);

    case "format.increaseListIndent": {
      const listItemType = getNodeType(view.state, "list_item");

      return listItemType ? runProseMirrorCommand(view, sinkListItem(listItemType)) : false;
    }

    case "format.decreaseListIndent": {
      const listItemType = getNodeType(view.state, "list_item");

      return listItemType ? runProseMirrorCommand(view, liftListItem(listItemType)) : false;
    }

    case "format.toggleTaskChecked":
      return toggleSelectedTaskChecked(view);

    case "format.blockquote":
      return toggleBlockquote(view);

    case "format.codeBlock":
      return toggleTextBlockType(view, "code_block", { language: "" });

    case "format.clearBlock":
      return clearBlockFormatting(view);
  }
};

export const hasHeadingLevelChange = (state: EditorState, delta: number) =>
  getTextBlocksInSelection(state).some(({ node }) => {
    if (node.type.name !== "heading") {
      return false;
    }

    const nextLevel = Number(node.attrs.level) + delta;

    return nextLevel >= 1 && nextLevel <= 6;
  });

export const hasListItemSelection = (state: EditorState) => getSelectedListItems(state).length > 0;

export const hasTaskListItemSelection = (state: EditorState) =>
  getSelectedListItems(state).some(({ node }) => node.attrs.checked != null);

export const canIncreaseListIndent = (state: EditorState) => {
  const listItemType = getNodeType(state, "list_item");

  return listItemType ? sinkListItem(listItemType)(state) : false;
};

export const canDecreaseListIndent = (state: EditorState) => {
  const listItemType = getNodeType(state, "list_item");

  return listItemType ? liftListItem(listItemType)(state) : false;
};

export const hasRemovableBlockFormatting = (state: EditorState) => {
  if (findAncestor(state, new Set(["blockquote"])) || findCurrentList(state)) {
    return true;
  }

  return getTextBlocksInSelection(state).some(
    ({ node }) => node.type.name !== "paragraph" || node.attrs.checked != null,
  );
};

const isBlockFormatCommandId = (commandId: EditorCommandId): commandId is BlockFormatCommandId =>
  commandId === "format.paragraph" ||
  commandId === "format.heading1" ||
  commandId === "format.heading2" ||
  commandId === "format.heading3" ||
  commandId === "format.heading4" ||
  commandId === "format.heading5" ||
  commandId === "format.heading6" ||
  commandId === "format.increaseHeading" ||
  commandId === "format.decreaseHeading" ||
  commandId === "format.orderedList" ||
  commandId === "format.unorderedList" ||
  commandId === "format.taskList" ||
  commandId === "format.increaseListIndent" ||
  commandId === "format.decreaseListIndent" ||
  commandId === "format.toggleTaskChecked" ||
  commandId === "format.blockquote" ||
  commandId === "format.codeBlock" ||
  commandId === "format.clearBlock";
