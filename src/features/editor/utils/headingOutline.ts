import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  getFoldedHeadings,
  getFoldedSections,
  isInFoldedSection,
  revealFoldedPosition,
} from "../plugins/headingFold";
import { finalizeSourceProjection } from "../plugins/sourceProjection";
import { findScrollingAncestor } from "./scrollingAncestor";
import { plainHeadingText } from "./wikiHeadings";

export type HeadingContainer = "blockquote" | "bullet_list" | "ordered_list" | "callout";

export const OUTLINE_DEPTHS = [1, 2, 3, 4, 5, 6] as const;
export type OutlineDepth = (typeof OUTLINE_DEPTHS)[number];

export interface OutlineHeading {
  position: number;
  level: number;
  text: string;
  context: HeadingContainer[];
  folded: boolean;
}

export interface HeadingOutlineState {
  headings: OutlineHeading[];
  activePosition: number | null;
}

interface OutlinePin {
  position: number;
  scrollTop: number;
}

export const EMPTY_HEADING_OUTLINE: HeadingOutlineState = {
  headings: [],
  activePosition: null,
};

// The current heading is the last one to have reached this distance below the top of the view.
// It clears the editor's top padding, so a document opening on a heading marks that heading.
const ACTIVE_LINE_OFFSET = 80;

// Holds the heading chosen from the outline while the view stays where navigation left it, since
// a heading in the last screen of a document cannot scroll up to the active line.
export const headingOutlinePinKey = new PluginKey<OutlinePin | null>("leafdown-heading-outline");

export const getOutlineHeadings = (
  doc: ProseMirrorNode,
  folded: readonly number[] = [],
): OutlineHeading[] => {
  const headings: OutlineHeading[] = [];
  doc.descendants((node, position) => {
    if (node.type.name !== "heading") return !node.isTextblock;

    const $position = doc.resolve(position);
    const context: HeadingContainer[] = [];
    for (let depth = 1; depth <= $position.depth; depth += 1) {
      const kind = $position.node(depth).type.name;
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
      folded: folded.includes(position),
    });
    return false;
  });
  return headings;
};

// Headings deeper than the chosen depth are left out, except that a document whose shallowest
// heading is deeper than the depth still lists that shallowest level.
export const getVisibleOutlineHeadings = (headings: OutlineHeading[], depth: OutlineDepth) => {
  if (headings.length === 0) return headings;
  const limit = Math.max(depth, Math.min(...headings.map((heading) => heading.level)));
  return headings.filter((heading) => heading.level <= limit);
};

export const getShownHeadingPosition = (
  visible: OutlineHeading[],
  activePosition: number | null,
) =>
  activePosition === null
    ? null
    : (visible.findLast((heading) => heading.position <= activePosition)?.position ?? null);

export const findLastHeadingAtOrAbove = (
  count: number,
  topAt: (index: number) => number,
  line: number,
) => {
  let low = 0;
  let high = count - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (topAt(middle) <= line) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
};

// Over the last stretch of scrolling the line moves down to the bottom of the view, so the
// headings of a final screen become current in turn as the document reaches its end.
export const getActiveLine = (
  top: number,
  height: number,
  remaining: number,
  maxScroll: number,
) => {
  const travel = Math.min(maxScroll, height - ACTIVE_LINE_OFFSET);
  const progress = travel > 0 ? Math.max(0, travel - remaining) / travel : 0;
  return top + ACTIVE_LINE_OFFSET + progress * Math.max(0, height - ACTIVE_LINE_OFFSET);
};

const headingTop = (view: EditorView, position: number) => {
  const element = view.nodeDOM(position);
  return element instanceof Element
    ? element.getBoundingClientRect().top
    : Number.POSITIVE_INFINITY;
};

export const measureActiveHeading = (view: EditorView, outlineHeadings: OutlineHeading[]) => {
  const sections = getFoldedSections(view.state);
  const headings = outlineHeadings.filter(
    (heading) => !isInFoldedSection(sections, heading.position),
  );
  if (headings.length === 0) return null;
  const viewport = findScrollingAncestor(view.dom);
  const pin = headingOutlinePinKey.getState(view.state);
  if (
    pin &&
    viewport &&
    Math.abs(viewport.scrollTop - pin.scrollTop) < 1 &&
    headings.some((heading) => heading.position === pin.position)
  ) {
    return pin.position;
  }

  const line = viewport
    ? getActiveLine(
        viewport.getBoundingClientRect().top,
        viewport.clientHeight,
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
        viewport.scrollHeight - viewport.clientHeight,
      )
    : ACTIVE_LINE_OFFSET;
  const index = findLastHeadingAtOrAbove(
    headings.length,
    (candidate) => headingTop(view, headings[candidate].position),
    line,
  );
  return index < 0 ? null : headings[index].position;
};

export const readHeadingOutline = (view: EditorView): HeadingOutlineState => {
  const headings = getOutlineHeadings(view.state.doc, getFoldedHeadings(view.state));
  return { headings, activePosition: measureActiveHeading(view, headings) };
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
      heading.folded === other.folded &&
      heading.context.join("\0") === other.context.join("\0")
    );
  });

const beginsDocument = (doc: ProseMirrorNode, position: number) => {
  const $position = doc.resolve(position);
  for (let depth = 0; depth <= $position.depth; depth += 1) {
    if ($position.index(depth) !== 0) return false;
  }
  return true;
};

export const jumpToOutlineHeading = (view: EditorView, position: number) => {
  const before = getOutlineHeadings(view.state.doc);
  const index = before.findIndex((heading) => heading.position === position);
  if (index < 0) return false;
  finalizeSourceProjection(view);
  const after = getOutlineHeadings(view.state.doc);
  if (after.length !== before.length) return false;
  const heading = after[index];
  if (!heading) return false;
  revealFoldedPosition(view, heading.position);

  const viewport = findScrollingAncestor(view.dom);
  const element = view.nodeDOM(heading.position);
  if (element instanceof Element) {
    if (viewport) {
      // The heading comes to rest where the document's first line rests at the start of the
      // scroll, so it keeps the editor's top padding at every width and clears an open search panel.
      viewport.scrollTop = beginsDocument(view.state.doc, heading.position)
        ? 0
        : element.getBoundingClientRect().top - view.dom.getBoundingClientRect().top;
    } else {
      element.scrollIntoView({ block: "start" });
    }
  }

  const selection = TextSelection.near(view.state.doc.resolve(heading.position + 1), 1);
  view.dispatch(
    view.state.tr
      .setSelection(selection)
      .setMeta(
        headingOutlinePinKey,
        viewport ? { position: heading.position, scrollTop: viewport.scrollTop } : null,
      ),
  );
  view.focus();
  return true;
};
