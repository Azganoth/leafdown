import { TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { finalizeSourceProjection } from "../plugins/sourceProjection";
import { plainHeadingText } from "./wikiHeadings";

export type HeadingContainer = "blockquote" | "bullet_list" | "ordered_list" | "callout";

export interface OutlineHeading {
  position: number;
  level: number;
  text: string;
  context: HeadingContainer[];
}

export interface HeadingOutlineState {
  headings: OutlineHeading[];
  activePosition: number | null;
}

export const EMPTY_HEADING_OUTLINE: HeadingOutlineState = {
  headings: [],
  activePosition: null,
};

export const getActiveHeadingPosition = (headings: OutlineHeading[], caret: number) =>
  headings.findLast((heading) => heading.position < caret)?.position ?? null;

export const getHeadingOutline = (state: EditorState): HeadingOutlineState => {
  const headings: OutlineHeading[] = [];
  state.doc.descendants((node, position) => {
    if (node.type.name !== "heading") return true;

    const $position = state.doc.resolve(position);
    const context: HeadingContainer[] = [];
    for (let depth = 1; depth <= $position.depth; depth += 1) {
      const ancestor = $position.node(depth);
      const kind = ancestor.type.name;
      if (
        kind === "blockquote" ||
        kind === "bullet_list" ||
        kind === "ordered_list" ||
        kind === "callout"
      ) {
        context.push(kind);
      }
    }
    headings.push({
      position,
      level: Number(node.attrs.level),
      text: plainHeadingText(node),
      context,
    });
    return false;
  });

  const activePosition = getActiveHeadingPosition(headings, state.selection.head);
  return { headings, activePosition };
};

export const headingOutlinesEqual = (left: HeadingOutlineState, right: HeadingOutlineState) =>
  left.activePosition === right.activePosition &&
  left.headings.length === right.headings.length &&
  left.headings.every((heading, index) => {
    const other = right.headings[index];
    return (
      heading.position === other.position &&
      heading.level === other.level &&
      heading.text === other.text &&
      heading.context.join("\0") === other.context.join("\0")
    );
  });

export const jumpToOutlineHeading = (view: EditorView, position: number) => {
  const before = getHeadingOutline(view.state);
  const index = before.headings.findIndex((heading) => heading.position === position);
  if (index < 0) return false;
  finalizeSourceProjection(view);
  const after = getHeadingOutline(view.state);
  if (after.headings.length !== before.headings.length) return false;
  const heading = after.headings[index];
  if (!heading) return false;

  const selection = TextSelection.near(view.state.doc.resolve(heading.position + 1), 1);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();
  const headingElement = view.nodeDOM(heading.position);
  if (headingElement instanceof Element) headingElement.scrollIntoView({ block: "center" });
  return true;
};
