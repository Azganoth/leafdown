import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { NodeSchema } from "@milkdown/kit/transformer";
import { defaultHandlers } from "mdast-util-to-markdown";

import {
  BLOCK_ADJACENT_ATTRIBUTE_NAME,
  DEFAULT_BLOCK_ADJACENT,
  readBlockAdjacent,
} from "./blockSeparatorMarkdown";
import { joinsWithoutBlankLine } from "./markdownJoins";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["list"]>>[2];

type StringifyParent = Parameters<NonNullable<RemarkStringifyHandlers["listItem"]>>[1];

type JoinArguments = Parameters<StringifyState["join"][number]>;

// Milkdown types a stringify handler's node as `any`, so a list and its item are named here from
// the blocks the serializer joins.
type ListNode = Extract<JoinArguments[0], { type: "list" }>;

type ListItemNode = Extract<JoinArguments[0], { type: "listItem" }>;

export const LIST_MARKDOWN_TYPE = "list";
export const LIST_ITEM_MARKDOWN_TYPE = "listItem";
export const LIST_MARKER_ATTRIBUTE_NAME = "marker";
export const LIST_ITEM_NUMBER_ATTRIBUTE_NAME = "number";
export const LIST_ITEM_PADDING_ATTRIBUTE_NAME = "padding";
export const LIST_ITEM_LEADING_BLANK_LINE_ATTRIBUTE_NAME = "leadingBlankLine";
export const LIST_ITEM_TASK_MARKER_ATTRIBUTE_NAME = "taskMarker";

const PARAGRAPH_MARKDOWN_TYPE = "paragraph";
const LIST_ITEM_LABEL_ATTRIBUTE_NAME = "label";
const BULLET_LIST_ITEM_LABEL = "•";
const BULLET_LIST_ITEM_TYPE = "bullet";
const ORDERED_LIST_ITEM_TYPE = "ordered";

// CommonMark reads `-`, `+`, and `*` as the same bullet, and `.` and `)` as the same ordered
// delimiter, but reads a change of either as the start of another list.
const BULLET_LIST_MARKERS = ["-", "+", "*"] as const;
const ORDERED_LIST_MARKERS = [".", ")"] as const;

type BulletListMarker = (typeof BULLET_LIST_MARKERS)[number];

type OrderedListMarker = (typeof ORDERED_LIST_MARKERS)[number];

// The marker a list is written with when it has none of its own: one the editor created, and one
// whose authored marker cannot be recovered.
export const DEFAULT_BULLET_LIST_MARKER: BulletListMarker = "*";
export const DEFAULT_ORDERED_LIST_MARKER: OrderedListMarker = ".";
// The marker a list moves to when the one it would write is the one the list before it used. Two
// adjacent lists sharing a marker are read back as one list, and the default is what a list moves
// off where the default is what collided.
const ALTERNATE_BULLET_LIST_MARKER: BulletListMarker = "-";
// A run of underscores is a thematic break and never a bullet, so an option held to it cannot
// match a marker.
const NON_BULLET_RULE_MARKER = "_";

// GFM reads `x` and `X` as the same checked marker, and a space and a tab as the same unchecked
// one, so each pair spells one state and a marker answers for the state it belongs to.
const CHECKED_TASK_MARKERS = ["x", "X"] as const;
const UNCHECKED_TASK_MARKERS = [" ", "\t"] as const;

type TaskMarker = (typeof CHECKED_TASK_MARKERS)[number] | (typeof UNCHECKED_TASK_MARKERS)[number];

// The marker a task item is written with when it has none of its own: one the editor checked or
// unchecked, and one whose authored marker cannot be recovered.
const DEFAULT_CHECKED_TASK_MARKER: TaskMarker = "x";
const DEFAULT_UNCHECKED_TASK_MARKER: TaskMarker = " ";

// The spaces between a marker and the content it opens. CommonMark reads one to four of them and
// puts the content that many columns past the marker; a fifth space opens indented code inside the
// item and leaves the content one space past the marker, which is also where an item beginning on
// the line after its marker puts it.
export const DEFAULT_LIST_ITEM_PADDING = 1;
const MAXIMUM_LIST_ITEM_PADDING = 4;
// CommonMark reads at most nine digits as an ordered marker.
const MAXIMUM_LIST_ITEM_NUMBER = 999999999;

const BULLET_LIST_ITEM_PATTERN = /^([-+*])/u;
const ORDERED_LIST_ITEM_PATTERN = /^(\d{1,9})([.)])/u;
// Anchored against the content so a run the parse does not read as padding is left to the default:
// five or more spaces belong to indented code, and none at all mean the content opens on a later
// line.
const LIST_ITEM_PADDING_PATTERN = /^ {1,4}(?=[^\t\n\r ])/u;
// Anchored at the end of what stands before the item's content, which is where GFM leaves the
// checkbox and the whitespace it requires after it.
const TASK_MARKER_PATTERN = /\[([\t xX])\][\t\n\r ]*$/u;

export interface AuthoredListItemForm {
  marker: BulletListMarker | OrderedListMarker;
  number: number | undefined;
  padding: number;
}

const isBulletListMarker = (value: unknown): value is BulletListMarker =>
  BULLET_LIST_MARKERS.includes(value as BulletListMarker);

const isOrderedListMarker = (value: unknown): value is OrderedListMarker =>
  ORDERED_LIST_MARKERS.includes(value as OrderedListMarker);

const readAttribute = (source: object, name: string) => (source as Record<string, unknown>)[name];

export const readBulletListMarker = (source: object): BulletListMarker => {
  const marker = readAttribute(source, LIST_MARKER_ATTRIBUTE_NAME);

  return isBulletListMarker(marker) ? marker : DEFAULT_BULLET_LIST_MARKER;
};

export const readOrderedListMarker = (source: object): OrderedListMarker => {
  const marker = readAttribute(source, LIST_MARKER_ATTRIBUTE_NAME);

  return isOrderedListMarker(marker) ? marker : DEFAULT_ORDERED_LIST_MARKER;
};

export const readListItemNumber = (source: object): number | undefined => {
  const number = readAttribute(source, LIST_ITEM_NUMBER_ATTRIBUTE_NAME);

  return typeof number === "number" &&
    Number.isInteger(number) &&
    number >= 0 &&
    number <= MAXIMUM_LIST_ITEM_NUMBER
    ? number
    : undefined;
};

export const readListItemPadding = (source: object): number => {
  const padding = readAttribute(source, LIST_ITEM_PADDING_ATTRIBUTE_NAME);

  return typeof padding === "number" &&
    Number.isInteger(padding) &&
    padding >= DEFAULT_LIST_ITEM_PADDING &&
    padding <= MAXIMUM_LIST_ITEM_PADDING
    ? padding
    : DEFAULT_LIST_ITEM_PADDING;
};

export const readListItemLeadingBlankLine = (source: object): boolean =>
  readAttribute(source, LIST_ITEM_LEADING_BLANK_LINE_ATTRIBUTE_NAME) === true;

const isTaskMarker = (value: unknown): value is TaskMarker =>
  CHECKED_TASK_MARKERS.includes(value as never) || UNCHECKED_TASK_MARKERS.includes(value as never);

const readAuthoredTaskMarker = (source: object): TaskMarker | null => {
  const marker = readAttribute(source, LIST_ITEM_TASK_MARKER_ATTRIBUTE_NAME);

  return isTaskMarker(marker) ? marker : null;
};

// A marker spells one of the two states, so one disagreeing with the state the item is in now is
// the marker of the state it was moved off. The item is still the task item the file wrote, and
// the state it moved to is the editor's, so the default for that state is written and the authored
// marker is kept for the state it answers for.
const readTaskMarker = (source: object, checked: boolean): TaskMarker => {
  const marker = readAuthoredTaskMarker(source);
  const markers: readonly TaskMarker[] = checked ? CHECKED_TASK_MARKERS : UNCHECKED_TASK_MARKERS;

  if (marker !== null && markers.includes(marker)) {
    return marker;
  }

  return checked ? DEFAULT_CHECKED_TASK_MARKER : DEFAULT_UNCHECKED_TASK_MARKER;
};

// The preset numbers an ordered list's items onto an mdast field of its own before the parse and
// keeps the pair up to date from the document afterwards, so they decorate the rendered item rather
// than answering for the marker the file is written with. The item is written from the number it
// was authored with, which the preset's own numbering would replace.
const readListItemLabel = (source: object) => {
  const label = readAttribute(source, LIST_ITEM_LABEL_ATTRIBUTE_NAME);

  return typeof label === "number" || typeof label === "string"
    ? { label: `${label}.`, listType: ORDERED_LIST_ITEM_TYPE }
    : { label: BULLET_LIST_ITEM_LABEL, listType: BULLET_LIST_ITEM_TYPE };
};

// The preset reads that pair back from the document as well: a bullet list whose first item still
// reads `ordered` is turned back into an ordered list and rebuilt from its spread alone, which is
// where the list's authored marker and its tightness go. A command converting a list to the other
// kind writes the pair for the list the items end up in, and drops the number each item was
// authored with along with the ordered list that held it.
export const createConvertedListItemAttrs = (ordered: boolean, index: number) => ({
  ...(ordered
    ? { label: `${index + 1}.`, listType: ORDERED_LIST_ITEM_TYPE }
    : { label: BULLET_LIST_ITEM_LABEL, listType: BULLET_LIST_ITEM_TYPE }),
  [LIST_ITEM_NUMBER_ATTRIBUTE_NAME]: null,
});

// A marker spells the state it was written for rather than decorating both, so an item the editor
// moves to another state carries none: the form did not survive an edit to the very thing it
// decorates. Removing the checkbox is such a move, so an item made a task item again is written in
// the default form as well.
export const createTaskStateListItemAttrs = (item: ProseNode, checked: boolean | null) =>
  checked === item.attrs.checked
    ? { checked }
    : { checked, [LIST_ITEM_TASK_MARKER_ATTRIBUTE_NAME]: null };

const findListItemPadding = (afterMarker: string) =>
  LIST_ITEM_PADDING_PATTERN.exec(afterMarker)?.[0].length ?? DEFAULT_LIST_ITEM_PADDING;

// An item's slice opens at its marker, whatever the container indented it by, so the marker, the
// number it spells, and the spaces after it are read off the head of that slice.
export const findListItemForm = (
  head: string,
  ordered: boolean,
): AuthoredListItemForm | undefined => {
  const match = ordered
    ? ORDERED_LIST_ITEM_PATTERN.exec(head)
    : BULLET_LIST_ITEM_PATTERN.exec(head);

  if (!match) {
    return undefined;
  }

  const [matched, first, second] = match;

  return {
    marker: (ordered ? second : first) as BulletListMarker | OrderedListMarker,
    number: ordered ? Number(first) : undefined,
    padding: findListItemPadding(head.slice(matched.length)),
  };
};

// GFM consumes the checkbox and the whitespace after it, so an item's own content opens past both
// and the marker is the last thing the slice between the two holds. An item carrying no checkbox
// has nothing but its marker and padding there, which the pattern cannot match.
export const findTaskMarker = (opening: string): TaskMarker | undefined =>
  TASK_MARKER_PATTERN.exec(opening)?.[1] as TaskMarker | undefined;

// The list item schema requires a leading paragraph, so an item whose source starts with any other
// block parses with an empty one filled in ahead of it. Written out it becomes a blank line, and
// CommonMark ends the item at the second one.
const withoutFilledLeadingParagraph = (node: ProseNode) => {
  const firstChild = node.firstChild;

  if (
    node.childCount < 2 ||
    !firstChild ||
    firstChild.type.name !== PARAGRAPH_MARKDOWN_TYPE ||
    firstChild.content.size > 0 ||
    // GFM writes the checkbox into the item's first paragraph and drops it when that paragraph is
    // not there to hold it.
    node.attrs.checked != null
  ) {
    return node;
  }

  return node.copy(node.content.cut(firstChild.nodeSize));
};

// `parseMarkdown` builds `spread` with a template literal, so the attribute holds the string
// "false" where mdast expects a boolean. Forwarded raw, it reads as spread and writes every tight
// list loose.
const readSpread = (node: ProseNode) =>
  typeof node.attrs.spread === "boolean" ? node.attrs.spread : node.attrs.spread === "true";

const readAlternateBulletListMarker = (marker: BulletListMarker) =>
  marker === DEFAULT_BULLET_LIST_MARKER ? ALTERNATE_BULLET_LIST_MARKER : DEFAULT_BULLET_LIST_MARKER;

// A list interrupts the paragraph it follows only where its first item opens with content, so an
// item that would open with a blank line there is written with its content on the marker's line
// instead. An item is written where its own list's parent is out of reach, so the list resolves the
// question and hands the item down without the form. A tight list item is the only container that
// joins a paragraph to the block after it without a blank line, and the join is read off the
// serializer rather than off the item's own `spread`, which is what decides it.
const withoutUninterruptingFirstItem = (
  node: ListNode,
  parent: StringifyParent,
  state: StringifyState,
) => {
  const [first, ...rest] = node.children;

  if (!first || !readListItemLeadingBlankLine(first) || parent?.type !== LIST_ITEM_MARKDOWN_TYPE) {
    return node;
  }

  const index = parent.children.indexOf(node);
  const previous = index > 0 ? parent.children[index - 1] : undefined;

  if (
    previous?.type !== PARAGRAPH_MARKDOWN_TYPE ||
    !joinsWithoutBlankLine(previous, node, parent, state)
  ) {
    return node;
  }

  return {
    ...node,
    children: [{ ...first, [LIST_ITEM_LEADING_BLANK_LINE_ATTRIBUTE_NAME]: false }, ...rest],
  };
};

// `mdast-util-to-markdown` picks a list's marker from one option for the whole document and moves
// the next list off whatever the last one used, which is the alternation an authored marker
// replaces. The choice is reachable only through those options, so they carry the authored marker
// for the length of the list and the handler keeps the guards that stop two lists from being read
// back as one.
export const serializeList: NonNullable<RemarkStringifyHandlers["list"]> = (
  node: ListNode,
  parent,
  state,
  info,
) => {
  const list = withoutUninterruptingFirstItem(node, parent, state);
  const { bullet, bulletOrdered, bulletOther, rule } = state.options;

  if (node.ordered) {
    state.options.bulletOrdered = readOrderedListMarker(node);
  } else {
    const marker = readBulletListMarker(node);

    state.options.bullet = marker;
    state.options.bulletOther = readAlternateBulletListMarker(marker);
    // The handler also moves the bullet off the run a thematic break opening an item is written
    // with, read from the option rather than from the break, which cannot answer for a run the
    // node carries. `serializeThematicBreak` answers it from the break itself, so the option is
    // held to a character no bullet can be and the authored marker stays.
    state.options.rule = NON_BULLET_RULE_MARKER;
  }

  try {
    return defaultHandlers.list(list, parent, state, info);
  } finally {
    Object.assign(state.options, { bullet, bulletOrdered, bulletOther, rule });
  }
};

// A bullet item is written with the character the list settled on, which is where a collision with
// the list before it is already resolved. An ordered item spells its own number ahead of that
// character, except the first, which spells the list's own: that number is the start the file is
// read back with, and the list is what holds it.
const findListItemMarker = (node: ListItemNode, parent: StringifyParent, state: StringifyState) => {
  const marker = state.bulletCurrent ?? DEFAULT_BULLET_LIST_MARKER;

  if (parent?.type !== LIST_MARKDOWN_TYPE || !parent.ordered) {
    return marker;
  }

  const start = typeof parent.start === "number" && parent.start > -1 ? parent.start : 1;
  const index = parent.children.indexOf(node);
  const number = index > 0 ? (readListItemNumber(node) ?? start + index) : start;

  return `${number}${marker}`;
};

// The handler upstream sizes every item by one space after its marker, or by the tab stop the
// document-wide option names, neither of which can answer for the spaces a single item was written
// with. Rewriting it here is also what keeps a task marker on an item the GFM handler cannot
// reach: it inserts the checkbox by matching the marker it expects, which is a `.` delimiter
// followed by at most three spaces.
export const serializeListItem: NonNullable<RemarkStringifyHandlers["listItem"]> = (
  node: ListItemNode,
  parent,
  state,
  info,
) => {
  const marker = findListItemMarker(node, parent, state);
  // An item that opens on the line after its marker puts its content one space past the marker,
  // whatever stands between the two, so that spacing is the padding it is written with.
  const leadingBlankLine = readListItemLeadingBlankLine(node) && node.children.length > 0;
  const padding = leadingBlankLine ? DEFAULT_LIST_ITEM_PADDING : readListItemPadding(node);
  const size = marker.length + padding;
  // GFM writes the checkbox into the item's first paragraph and reads it back from there, so an
  // item opening on any other block cannot carry one.
  const checkbox =
    typeof node.checked === "boolean" && node.children[0]?.type === PARAGRAPH_MARKDOWN_TYPE
      ? `[${readTaskMarker(node, node.checked)}] `
      : "";
  const opening = leadingBlankLine
    ? `${marker}\n${" ".repeat(size)}`
    : marker + " ".repeat(padding);
  const tracker = state.createTracker(info);

  tracker.move(opening + checkbox);
  tracker.shift(size);

  const exit = state.enter(LIST_ITEM_MARKDOWN_TYPE);
  const value = state.indentLines(
    state.containerFlow(node, tracker.current()),
    (line, index, blank) => {
      if (index) {
        return (blank ? "" : " ".repeat(size)) + line;
      }

      return (blank ? marker : opening + checkbox) + line;
    },
  );

  exit();

  return value;
};

// The preset's own runners open the mdast node themselves and carry only the fields they know, so
// each is replaced rather than wrapped: the authored form has to reach the node the runner opens.
export const withBulletListMarker = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: {
    ...schema.attrs,
    [LIST_MARKER_ATTRIBUTE_NAME]: {
      default: DEFAULT_BULLET_LIST_MARKER,
      validate: "string",
    },
    [BLOCK_ADJACENT_ATTRIBUTE_NAME]: {
      default: DEFAULT_BLOCK_ADJACENT,
      validate: "boolean",
    },
  },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      state.openNode(type, {
        spread: node.spread ?? false,
        [LIST_MARKER_ATTRIBUTE_NAME]: readBulletListMarker(node),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node),
      });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      state.openNode(LIST_MARKDOWN_TYPE, undefined, {
        ordered: false,
        spread: readSpread(node),
        [LIST_MARKER_ATTRIBUTE_NAME]: readBulletListMarker(node.attrs),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node.attrs),
      });
      state.next(node.content);
      state.closeNode();
    },
  },
});

export const withOrderedListMarker = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: {
    ...schema.attrs,
    [LIST_MARKER_ATTRIBUTE_NAME]: {
      default: DEFAULT_ORDERED_LIST_MARKER,
      validate: "string",
    },
    [BLOCK_ADJACENT_ATTRIBUTE_NAME]: {
      default: DEFAULT_BLOCK_ADJACENT,
      validate: "boolean",
    },
  },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      state.openNode(type, {
        spread: node.spread ?? true,
        order: node.start ?? 1,
        [LIST_MARKER_ATTRIBUTE_NAME]: readOrderedListMarker(node),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node),
      });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      state.openNode(LIST_MARKDOWN_TYPE, undefined, {
        ordered: true,
        start: node.attrs.order ?? 1,
        spread: readSpread(node),
        [LIST_MARKER_ATTRIBUTE_NAME]: readOrderedListMarker(node.attrs),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node.attrs),
      });
      state.next(node.content);
      state.closeNode();
    },
  },
});

// The task extension's runners are the ones the editor holds, and they carry the checkbox through
// the same fields the preset's do, so one replacement answers for a task item and an ordinary one.
export const withListItemForm = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: {
    ...schema.attrs,
    [LIST_ITEM_NUMBER_ATTRIBUTE_NAME]: {
      default: null,
      validate: "number|null",
    },
    [LIST_ITEM_PADDING_ATTRIBUTE_NAME]: {
      default: DEFAULT_LIST_ITEM_PADDING,
      validate: "number",
    },
    [LIST_ITEM_LEADING_BLANK_LINE_ATTRIBUTE_NAME]: {
      default: false,
      validate: "boolean",
    },
    [LIST_ITEM_TASK_MARKER_ATTRIBUTE_NAME]: {
      default: null,
      validate: "string|null",
    },
  },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      state.openNode(type, {
        ...readListItemLabel(node),
        spread: node.spread ?? true,
        checked: node.checked == null ? null : Boolean(node.checked),
        [LIST_ITEM_NUMBER_ATTRIBUTE_NAME]: readListItemNumber(node) ?? null,
        [LIST_ITEM_PADDING_ATTRIBUTE_NAME]: readListItemPadding(node),
        [LIST_ITEM_LEADING_BLANK_LINE_ATTRIBUTE_NAME]: readListItemLeadingBlankLine(node),
        [LIST_ITEM_TASK_MARKER_ATTRIBUTE_NAME]: readAuthoredTaskMarker(node),
      });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      const item = withoutFilledLeadingParagraph(node);

      state.openNode(LIST_ITEM_MARKDOWN_TYPE, undefined, {
        spread: readSpread(item),
        checked: item.attrs.checked ?? null,
        [LIST_ITEM_NUMBER_ATTRIBUTE_NAME]: readListItemNumber(item.attrs) ?? null,
        [LIST_ITEM_PADDING_ATTRIBUTE_NAME]: readListItemPadding(item.attrs),
        [LIST_ITEM_LEADING_BLANK_LINE_ATTRIBUTE_NAME]: readListItemLeadingBlankLine(item.attrs),
        [LIST_ITEM_TASK_MARKER_ATTRIBUTE_NAME]: readAuthoredTaskMarker(item.attrs),
      });
      state.next(item.content);
      state.closeNode();
    },
  },
});
