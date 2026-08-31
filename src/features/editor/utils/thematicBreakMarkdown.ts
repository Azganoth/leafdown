import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { TagParseRule } from "@milkdown/kit/prose/model";
import type { NodeSchema } from "@milkdown/kit/transformer";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["thematicBreak"]>>[2];

type StringifyParent = Parameters<NonNullable<RemarkStringifyHandlers["thematicBreak"]>>[1];

type JoinArguments = Parameters<StringifyState["join"][number]>;

// Milkdown types a stringify handler's node as `any`, so the break is named here from the blocks
// the serializer joins.
type ThematicBreakNode = Extract<JoinArguments[0], { type: "thematicBreak" }>;

export const THEMATIC_BREAK_MARKDOWN_TYPE = "thematicBreak";
export const THEMATIC_BREAK_MARKER_ATTRIBUTE_NAME = "marker";

const THEMATIC_BREAK_MARKER_DOM_ATTRIBUTE_NAME = "data-marker";
const PARAGRAPH_MARKDOWN_TYPE = "paragraph";
const LIST_ITEM_MARKDOWN_TYPE = "listItem";

// The run a break is written with when it has none of its own: one the editor created, one whose
// authored characters cannot be recovered, and one whose own run the line it lands on would read
// as something else. Three asterisks are the spelling no position reads as anything but a break.
export const DEFAULT_THEMATIC_BREAK_MARKER = "***";

// The spelling a break opening a list item falls back to when the default shares the bullet's
// character, so the run and the bullet can never read as one.
const UNDERSCORE_THEMATIC_BREAK_MARKER = "___";

// CommonMark reads three or more of `*`, `-`, or `_`, alike, with spaces and tabs allowed between
// them and after them.
const THEMATIC_BREAK_MARKER_PATTERN = /^([*\-_])(?:[\t ]*\1){2,}$/u;
// A setext underline is a run of hyphens carrying nothing else, so a spelling holding a space or a
// tab is read as a break wherever it lands.
const SETEXT_UNDERLINE_PATTERN = /^-+$/u;
const TRAILING_WHITESPACE_PATTERN = /[\t ]+$/u;

const isThematicBreakMarker = (value: unknown): value is string =>
  typeof value === "string" && THEMATIC_BREAK_MARKER_PATTERN.test(value);

export const readThematicBreakMarker = (source: object): string => {
  const marker = (source as Record<string, unknown>)[THEMATIC_BREAK_MARKER_ATTRIBUTE_NAME];

  return isThematicBreakMarker(marker) ? marker : DEFAULT_THEMATIC_BREAK_MARKER;
};

// A break holds no children, so the slice of the file it was built from is its characters and the
// whitespace closing the line, never the indentation before it. Trimming that tail is the only
// correction the slice needs to become the run the file is written back with.
export const findThematicBreakMarker = (raw: string): string => {
  const marker = raw.replace(TRAILING_WHITESPACE_PATTERN, "");

  return isThematicBreakMarker(marker) ? marker : DEFAULT_THEMATIC_BREAK_MARKER;
};

// Asking `mdast-util-to-markdown` what it will write between two blocks, by the resolution it uses
// itself, so the answer cannot drift from the blank line it actually emits.
const joinsWithoutBlankLine = (
  left: JoinArguments[0],
  right: JoinArguments[1],
  parent: JoinArguments[2],
  state: StringifyState,
) => {
  let index = state.join.length;

  while (index--) {
    const result = state.join[index](left, right, parent, state);

    if (result === true || result === 1) {
      break;
    }

    if (typeof result === "number") {
      return result === 0;
    }

    if (result === false) {
      return false;
    }
  }

  return false;
};

// A tight list item joins its children with a single newline, so a break written there follows the
// paragraph above it directly. A run of hyphens in that position underlines the paragraph, and the
// file is read back holding a heading where the document held a break. A list item is the only
// container that joins its children this way, and the join is read off the serializer rather than
// off the item's own `spread`, which is what decides it.
const underlinesPrecedingParagraph = (
  node: ThematicBreakNode,
  parent: StringifyParent,
  state: StringifyState,
) => {
  if (parent?.type !== LIST_ITEM_MARKDOWN_TYPE) {
    return false;
  }

  const index = parent.children.indexOf(node);
  const previous = index > 0 ? parent.children[index - 1] : undefined;

  return (
    previous?.type === PARAGRAPH_MARKDOWN_TYPE &&
    joinsWithoutBlankLine(previous, node, parent, state)
  );
};

// A break opening a list item shares the bullet's line, so a bullet and a run spelled with the same
// character read back as one longer break with no item around it. `mdast-util-to-markdown` moves
// the bullet off the rule character it was configured with, which cannot answer for a run the node
// carries, so here the run is what gives way.
const mergesWithBullet = (
  marker: string,
  node: ThematicBreakNode,
  parent: StringifyParent,
  bullet: string | undefined,
) =>
  bullet !== undefined &&
  marker.charAt(0) === bullet &&
  parent?.type === LIST_ITEM_MARKDOWN_TYPE &&
  parent.children[0] === node;

export const serializeThematicBreak: NonNullable<RemarkStringifyHandlers["thematicBreak"]> = (
  node: ThematicBreakNode,
  parent,
  state,
) => {
  const marker = readThematicBreakMarker(node);

  if (mergesWithBullet(marker, node, parent, state.bulletCurrent)) {
    return DEFAULT_THEMATIC_BREAK_MARKER.charAt(0) === state.bulletCurrent
      ? UNDERSCORE_THEMATIC_BREAK_MARKER
      : DEFAULT_THEMATIC_BREAK_MARKER;
  }

  return SETEXT_UNDERLINE_PATTERN.test(marker) && underlinesPrecedingParagraph(node, parent, state)
    ? DEFAULT_THEMATIC_BREAK_MARKER
    : marker;
};

export const withThematicBreakMarker = (schema: NodeSchema): NodeSchema => {
  const { toDOM } = schema;

  return {
    ...schema,
    attrs: {
      ...schema.attrs,
      [THEMATIC_BREAK_MARKER_ATTRIBUTE_NAME]: {
        default: DEFAULT_THEMATIC_BREAK_MARKER,
        validate: "string",
      },
    },
    // The rendered separator carries the run it will be written with, so a break copied out of one
    // document keeps its spelling when it is pasted into another.
    parseDOM: (schema.parseDOM as TagParseRule[] | undefined)?.map((rule) => ({
      ...rule,
      getAttrs: (dom: HTMLElement) => {
        const attrs = rule.getAttrs?.(dom);

        return attrs === false
          ? false
          : {
              ...attrs,
              [THEMATIC_BREAK_MARKER_ATTRIBUTE_NAME]: findThematicBreakMarker(
                dom.getAttribute(THEMATIC_BREAK_MARKER_DOM_ATTRIBUTE_NAME) ?? "",
              ),
            };
      },
    })),
    toDOM:
      toDOM &&
      ((node) => {
        const [tag, attributes, ...rest] = toDOM(node) as [
          string,
          Record<string, unknown>,
          ...unknown[],
        ];

        return [
          tag,
          {
            ...attributes,
            [THEMATIC_BREAK_MARKER_DOM_ATTRIBUTE_NAME]: readThematicBreakMarker(node.attrs),
          },
          ...rest,
        ];
      }),
    parseMarkdown: {
      ...schema.parseMarkdown,
      runner: (state, node, type) => {
        state.addNode(type, {
          [THEMATIC_BREAK_MARKER_ATTRIBUTE_NAME]: readThematicBreakMarker(node),
        });
      },
    },
    toMarkdown: {
      ...schema.toMarkdown,
      runner: (state, node) => {
        state.addNode(THEMATIC_BREAK_MARKDOWN_TYPE, undefined, undefined, {
          [THEMATIC_BREAK_MARKER_ATTRIBUTE_NAME]: readThematicBreakMarker(node.attrs),
        });
      },
    },
  };
};
