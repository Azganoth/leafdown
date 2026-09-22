import type { Node as ProseMirrorNode, ResolvedPos } from "@milkdown/kit/prose/model";
import { Selection, type SelectionBookmark } from "@milkdown/kit/prose/state";
import type { Mappable } from "@milkdown/kit/prose/transform";

const BLOCK_SELECTION_JSON_ID = "leafdown-block";
const LIST_NODE_TYPES = new Set(["bullet_list", "ordered_list"]);
const ATOMIC_BLOCK_NODE_TYPES = new Set([
  "code_block",
  "footnote_definition",
  "html",
  "image",
  "table",
  "thematic_break",
]);

export interface SelectableBlockTarget {
  node: ProseMirrorNode;
  pos: number;
}

const isListNode = (node: ProseMirrorNode) => LIST_NODE_TYPES.has(node.type.name);

const isAtomicBlock = (node: ProseMirrorNode) =>
  node.isAtom || ATOMIC_BLOCK_NODE_TYPES.has(node.type.name);

const collectNestedListItems = (
  node: ProseMirrorNode,
  start: number,
  targets: SelectableBlockTarget[],
) => {
  node.forEach((child, offset) => {
    const pos = start + offset;

    if (isListNode(child)) {
      collectSelectableBlocks(child, pos + 1, targets, child.type.name);
    } else if (!isAtomicBlock(child)) {
      collectNestedListItems(child, pos + 1, targets);
    }
  });
};

const collectSelectableBlocks = (
  node: ProseMirrorNode,
  start: number,
  targets: SelectableBlockTarget[],
  parentType: string | null,
) => {
  node.forEach((child, offset) => {
    const pos = start + offset;

    if (isListNode(child)) {
      collectSelectableBlocks(child, pos + 1, targets, child.type.name);
      return;
    }

    if (parentType === "bullet_list" || parentType === "ordered_list") {
      if (child.type.name === "list_item") {
        targets.push({ node: child, pos });
        collectNestedListItems(child, pos + 1, targets);
      }

      return;
    }

    targets.push({ node: child, pos });

    if (child.type.name === "blockquote" && !isAtomicBlock(child)) {
      collectSelectableBlocks(child, pos + 1, targets, child.type.name);
    }
  });
};

export const getSelectableBlockTargets = (doc: ProseMirrorNode) => {
  const targets: SelectableBlockTarget[] = [];
  collectSelectableBlocks(doc, 0, targets, null);
  return targets;
};

const resolveMappedBlockSelection = (doc: ProseMirrorNode, anchor: number, head: number) => {
  const selectablePositions = new Set(getSelectableBlockTargets(doc).map(({ pos }) => pos));

  if (!selectablePositions.has(anchor) || !selectablePositions.has(head)) {
    return null;
  }

  return new BlockSelection(doc.resolve(anchor), doc.resolve(head));
};

export class BlockSelection extends Selection {
  readonly $anchorBlock: ResolvedPos;
  readonly $headBlock: ResolvedPos;

  constructor($anchorBlock: ResolvedPos, $headBlock: ResolvedPos = $anchorBlock) {
    const anchorNode = $anchorBlock.nodeAfter;
    const headNode = $headBlock.nodeAfter;

    if (!anchorNode || !headNode) {
      throw new RangeError("A block selection must point at block boundaries.");
    }

    const forward = $anchorBlock.pos <= $headBlock.pos;
    const $anchor = forward
      ? $anchorBlock
      : $anchorBlock.doc.resolve($anchorBlock.pos + anchorNode.nodeSize);
    const $head = forward ? $headBlock.doc.resolve($headBlock.pos + headNode.nodeSize) : $headBlock;

    super($anchor, $head);
    this.$anchorBlock = $anchorBlock;
    this.$headBlock = $headBlock;
  }

  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    const anchor = mapping.mapResult(this.$anchorBlock.pos, 1);
    const head = mapping.mapResult(this.$headBlock.pos, 1);
    const mapped = resolveMappedBlockSelection(doc, anchor.pos, head.pos);

    if (mapped && !anchor.deletedAcross && !head.deletedAcross) {
      return mapped;
    }

    return Selection.near(doc.resolve(Math.min(head.pos, doc.content.size)), 1);
  }

  eq(other: Selection) {
    return (
      other instanceof BlockSelection &&
      other.$anchorBlock.pos === this.$anchorBlock.pos &&
      other.$headBlock.pos === this.$headBlock.pos
    );
  }

  toJSON() {
    return {
      type: BLOCK_SELECTION_JSON_ID,
      anchor: this.$anchorBlock.pos,
      head: this.$headBlock.pos,
    };
  }

  static fromJSON(doc: ProseMirrorNode, json: unknown) {
    if (
      typeof json !== "object" ||
      json === null ||
      !("anchor" in json) ||
      !("head" in json) ||
      typeof json.anchor !== "number" ||
      typeof json.head !== "number"
    ) {
      throw new RangeError("Invalid block selection JSON.");
    }

    const selection = resolveMappedBlockSelection(doc, json.anchor, json.head);

    if (!selection) {
      throw new RangeError("Block selection JSON does not point at selectable blocks.");
    }

    return selection;
  }

  static create(doc: ProseMirrorNode, anchor: number, head = anchor) {
    const selection = resolveMappedBlockSelection(doc, anchor, head);

    if (!selection) {
      throw new RangeError("Block selection positions do not point at selectable blocks.");
    }

    return selection;
  }

  getBookmark(): SelectionBookmark {
    return new BlockSelectionBookmark(this.$anchorBlock.pos, this.$headBlock.pos);
  }
}

BlockSelection.prototype.visible = false;
Selection.jsonID(BLOCK_SELECTION_JSON_ID, BlockSelection);

class BlockSelectionBookmark implements SelectionBookmark {
  constructor(
    private readonly anchor: number,
    private readonly head: number,
  ) {}

  map(mapping: Mappable) {
    return new BlockSelectionBookmark(mapping.map(this.anchor, 1), mapping.map(this.head, 1));
  }

  resolve(doc: ProseMirrorNode) {
    return (
      resolveMappedBlockSelection(doc, this.anchor, this.head) ??
      Selection.near(doc.resolve(Math.min(this.head, doc.content.size)), 1)
    );
  }
}

export const createHierarchicalBlockSelection = (
  doc: ProseMirrorNode,
  anchorBlockPos: number,
  headBlockPos = anchorBlockPos,
) => {
  return BlockSelection.create(doc, anchorBlockPos, headBlockPos);
};

export const getSelectedBlockTargets = (selection: BlockSelection) => {
  const targets = getSelectableBlockTargets(selection.$anchorBlock.doc);
  const anchorIndex = targets.findIndex(({ pos }) => pos === selection.$anchorBlock.pos);
  const headIndex = targets.findIndex(({ pos }) => pos === selection.$headBlock.pos);

  if (anchorIndex === -1 || headIndex === -1) {
    return [];
  }

  const selectedTargets = targets.slice(
    Math.min(anchorIndex, headIndex),
    Math.max(anchorIndex, headIndex) + 1,
  );

  return selectedTargets.filter(
    (target) =>
      !selectedTargets.some(
        (candidate) =>
          candidate !== target &&
          candidate.pos < target.pos &&
          candidate.pos + candidate.node.nodeSize >= target.pos + target.node.nodeSize,
      ),
  );
};
