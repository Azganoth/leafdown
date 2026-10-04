import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import {
  AllSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Selection,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { t } from "@/lib/i18n";

import { findScrollingAncestor } from "../utils/scrollingAncestor";
import { finalizeSourceProjection } from "./sourceProjection";

export interface HeadingSection {
  heading: number;
  from: number;
  to: number;
}

interface HeadingFoldState {
  folded: readonly number[];
  decorations: DecorationSet;
  markerHover: number | null;
}

interface HeadingFoldMeta {
  fold?: number;
  unfold?: readonly number[];
  reveal?: { from: number; to: number };
  markerHover?: number | null;
}

export const headingFoldPluginKey = new PluginKey<HeadingFoldState>("leafdownHeadingFold");

const isHeading = (node: ProseMirrorNode | null | undefined) => node?.type.name === "heading";

const endsSection = (sibling: ProseMirrorNode, level: number) =>
  isHeading(sibling) && Number(sibling.attrs.level) <= level;

// A section is the run of following siblings in the heading's own parent, so a heading inside a
// list item or quote never reaches past its container.
export const getHeadingSection = (
  doc: ProseMirrorNode,
  position: number,
): HeadingSection | null => {
  const heading = doc.nodeAt(position);
  if (!heading || !isHeading(heading)) return null;

  const $position = doc.resolve(position);
  const parent = $position.parent;
  const level = Number(heading.attrs.level);
  const from = position + heading.nodeSize;
  let to = from;
  for (let index = $position.index() + 1; index < parent.childCount; index += 1) {
    const sibling = parent.child(index);
    if (endsSection(sibling, level)) break;
    to += sibling.nodeSize;
  }
  return to > from ? { heading: position, from, to } : null;
};

const hasHeadingSection = (doc: ProseMirrorNode, position: number) => {
  const heading = doc.nodeAt(position);
  return !!heading && isHeading(heading) && hasSection(doc, position, heading);
};

const hasSection = (doc: ProseMirrorNode, position: number, heading: ProseMirrorNode) => {
  const $position = doc.resolve(position);
  const index = $position.index() + 1;
  return (
    index < $position.parent.childCount &&
    !endsSection($position.parent.child(index), Number(heading.attrs.level))
  );
};

export const getFoldedHeadings = (state: EditorState): readonly number[] =>
  headingFoldPluginKey.getState(state)?.folded ?? [];

export const getFoldedSections = (state: EditorState) =>
  getFoldedHeadings(state).flatMap((position) => getHeadingSection(state.doc, position) ?? []);

export const isInFoldedSection = (sections: readonly HeadingSection[], position: number) =>
  sections.some((section) => position >= section.from && position < section.to);

export const isHiddenByFold = (state: EditorState, position: number) =>
  isInFoldedSection(getFoldedSections(state), position);

const isInsideSection = (position: number, section: HeadingSection) =>
  position > section.from && position < section.to;

// A selection that only passes over a folded section, such as Select all, leaves it folded; one
// that ends inside it, or lies wholly within it, cannot be seen there and opens it.
const selectionReachesSection = (selection: Selection, section: HeadingSection) =>
  isInsideSection(selection.from, section) ||
  isInsideSection(selection.to, section) ||
  (selection.from >= section.from && selection.to <= section.to);

// The heading's content start survives a level change, which replaces the heading's opening token,
// and is deleted with the heading, so a fold never lands on another heading.
const mapFoldedHeading = (transaction: Transaction, position: number) => {
  const result = transaction.mapping.mapResult(position + 1, 1);
  if (result.deleted) return null;
  const $content = transaction.doc.resolve(result.pos);
  return isHeading($content.parent) ? $content.before() : null;
};

const normalizeFolds = (doc: ProseMirrorNode, positions: Iterable<number>) =>
  [...new Set(positions)]
    .filter((position) => hasHeadingSection(doc, position))
    .toSorted((left, right) => left - right);

const createFoldIndicator = (view: EditorView, getPos: () => number | undefined) => {
  const indicator = view.dom.ownerDocument.createElement("span");
  indicator.className = "leafdown-fold-indicator";
  indicator.contentEditable = "false";
  indicator.setAttribute("role", "button");
  indicator.setAttribute("aria-label", t("editor.headingFold.unfold"));
  indicator.title = t("editor.headingFold.unfold");
  indicator.textContent = "⋯";
  indicator.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const position = getPos();
    if (position === undefined) return;
    const heading = view.state.doc.resolve(position).before();
    view.dispatch(view.state.tr.setMeta(headingFoldPluginKey, { unfold: [heading] }));
  });
  return indicator;
};

const createDecorations = (doc: ProseMirrorNode, folded: readonly number[]) => {
  const foldedSet = new Set(folded);
  const decorations: Decoration[] = [];

  doc.descendants((node, position) => {
    if (!isHeading(node)) return !node.isTextblock;
    if (!hasSection(doc, position, node)) return false;

    const isFolded = foldedSet.has(position);
    const level = `H${String(node.attrs.level)}`;
    decorations.push(
      Decoration.node(position, position + node.nodeSize, {
        "data-leafdown-fold": isFolded ? "folded" : "open",
        "data-leafdown-fold-marker": level,
      }),
    );
    if (!isFolded) return false;

    decorations.push(
      Decoration.widget(position + node.nodeSize - 1, createFoldIndicator, {
        side: 1,
        ignoreSelection: true,
        key: "leafdown-fold-indicator",
        stopEvent: () => true,
      }),
    );
    const section = getHeadingSection(doc, position);
    if (section) {
      doc.nodesBetween(section.from, section.to, (child, childPosition) => {
        if (childPosition < section.from) return true;
        decorations.push(
          Decoration.node(childPosition, childPosition + child.nodeSize, {
            class: "leafdown-folded-block",
          }),
        );
        return false;
      });
    }
    return false;
  });

  return DecorationSet.create(doc, decorations);
};

const createFoldState = (doc: ProseMirrorNode, folded: readonly number[]): HeadingFoldState => ({
  folded,
  decorations: createDecorations(doc, folded),
  markerHover: null,
});

const sameFolds = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((position, index) => position === right[index]);

const applyFoldTransaction = (
  transaction: Transaction,
  value: HeadingFoldState,
): HeadingFoldState => {
  const meta = transaction.getMeta(headingFoldPluginKey) as HeadingFoldMeta | undefined;
  if (!transaction.docChanged && !meta) return value;

  const { doc } = transaction;
  let next = value;
  if (transaction.docChanged || meta?.fold !== undefined || meta?.unfold || meta?.reveal) {
    let folded = transaction.docChanged
      ? value.folded.flatMap((position) => mapFoldedHeading(transaction, position) ?? [])
      : [...value.folded];

    if (meta?.fold !== undefined) folded.push(meta.fold);
    if (meta?.unfold) folded = folded.filter((position) => !meta.unfold!.includes(position));
    if (meta?.reveal) {
      const { from, to } = meta.reveal;
      folded = folded.filter((position) => {
        const section = getHeadingSection(doc, position);
        return !section || !(from < section.to && to > section.from);
      });
    }

    const normalized = normalizeFolds(doc, folded);
    if (transaction.docChanged || !sameFolds(normalized, value.folded)) {
      next = createFoldState(doc, normalized);
    }
  }

  const markerHover =
    meta?.markerHover !== undefined
      ? meta.markerHover
      : transaction.docChanged
        ? null
        : value.markerHover;
  return markerHover === next.markerHover ? next : { ...next, markerHover };
};

export const revealFoldedRange = (transaction: Transaction, from: number, to = from) =>
  transaction.setMeta(headingFoldPluginKey, { reveal: { from, to } } satisfies HeadingFoldMeta);

export const revealFoldedPosition = (view: EditorView, position: number) => {
  if (!isHiddenByFold(view.state, position)) return false;
  view.dispatch(revealFoldedRange(view.state.tr, position));
  return true;
};

const findFoldTarget = (state: EditorState) => {
  const { $from, from } = state.selection;
  if (isHeading($from.parent) && hasSection(state.doc, $from.before(), $from.parent)) {
    return $from.before();
  }

  // Sections nest in document order, so the last heading before the caret whose section holds it
  // is the innermost.
  let target: number | null = null;
  state.doc.nodesBetween(0, from, (node, position) => {
    if (!isHeading(node)) return !node.isTextblock;
    const section = getHeadingSection(state.doc, position);
    if (section && from >= section.from && from < section.to) target = position;
    return false;
  });
  return target;
};

export const canToggleSectionFold = (state: EditorState) =>
  !(state.selection instanceof AllSelection) && findFoldTarget(state) !== null;

const headingIndex = (doc: ProseMirrorNode, position: number) => {
  let index = -1;
  let found = -1;
  doc.descendants((node, nodePosition) => {
    if (found >= 0) return false;
    if (!isHeading(node)) return !node.isTextblock;
    index += 1;
    if (nodePosition === position) found = index;
    return false;
  });
  return found;
};

const headingAt = (doc: ProseMirrorNode, index: number) => {
  let current = -1;
  let found: number | null = null;
  doc.descendants((node, position) => {
    if (found !== null) return false;
    if (!isHeading(node)) return !node.isTextblock;
    current += 1;
    if (current === index) found = position;
    return false;
  });
  return found;
};

export const toggleHeadingFold = (view: EditorView, position: number) => {
  const index = headingIndex(view.state.doc, position);
  if (index < 0) return false;
  finalizeSourceProjection(view);
  const heading = headingAt(view.state.doc, index);
  if (heading === null) return false;

  const { state } = view;
  if (getFoldedHeadings(state).includes(heading)) {
    view.dispatch(state.tr.setMeta(headingFoldPluginKey, { unfold: [heading] }));
    return true;
  }

  const section = getHeadingSection(state.doc, heading);
  if (!section) return false;
  const transaction = state.tr.setMeta(headingFoldPluginKey, { fold: heading });
  if (selectionReachesSection(state.selection, section)) {
    transaction.setSelection(TextSelection.create(state.doc, section.from - 1)).scrollIntoView();
  }
  view.dispatch(transaction);
  return true;
};

export const toggleSectionFold = (view: EditorView) => {
  const target = findFoldTarget(view.state);
  if (target === null) return false;
  const toggled = toggleHeadingFold(view, target);
  if (toggled) view.focus();
  return toggled;
};

// The marker is generated content standing outside the heading's box, so a press on the heading
// beyond its own inline start can only have landed on the marker.
export const isHeadingFoldMarkerAt = (
  element: Element | null | undefined,
  clientX: number,
): element is HTMLElement => {
  if (!(element instanceof HTMLElement) || !element.hasAttribute("data-leafdown-fold")) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return getComputedStyle(element).direction === "rtl" ? clientX > rect.right : clientX < rect.left;
};

// The marker shows while the pointer is level with its heading anywhere on the document surface,
// so it appears from whichever side the pointer comes, including over the gutter's own controls.
const findMarkerRowHeading = (view: EditorView, x: number, y: number) => {
  const surface = (findScrollingAncestor(view.dom) ?? view.dom).getBoundingClientRect();
  if (x < surface.left || x > surface.right || y < surface.top || y > surface.bottom) return null;
  for (const heading of view.dom.querySelectorAll<HTMLElement>("[data-leafdown-fold]")) {
    const rect = heading.getBoundingClientRect();
    if (rect.height > 0 && y >= rect.top && y <= rect.bottom) return heading;
  }
  return null;
};

const trackMarkerHover = (view: EditorView) => {
  const document = view.dom.ownerDocument;
  const window = document.defaultView;
  let pointer: { x: number; y: number } | null = null;
  let frame = 0;

  const publish = (position: number | null) => {
    if (view.isDestroyed || headingFoldPluginKey.getState(view.state)?.markerHover === position) {
      return;
    }
    view.dispatch(view.state.tr.setMeta(headingFoldPluginKey, { markerHover: position }));
  };

  const update = () => {
    frame = 0;
    if (view.isDestroyed) return;
    const heading = pointer ? findMarkerRowHeading(view, pointer.x, pointer.y) : null;
    publish(heading ? view.posAtDOM(heading, 0) - 1 : null);
  };

  const handleMouseMove = (event: MouseEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    frame ||= window?.requestAnimationFrame(update) ?? 0;
  };

  const handleMouseLeave = () => {
    pointer = null;
    frame ||= window?.requestAnimationFrame(update) ?? 0;
  };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseleave", handleMouseLeave);
  return {
    destroy: () => {
      window?.cancelAnimationFrame(frame);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    },
  };
};

const getFoldDecorations = (state: EditorState) => {
  const value = headingFoldPluginKey.getState(state);
  if (!value || value.markerHover === null) return value?.decorations;
  const heading = state.doc.nodeAt(value.markerHover);
  return heading
    ? value.decorations.add(state.doc, [
        Decoration.node(value.markerHover, value.markerHover + heading.nodeSize, {
          "data-leafdown-marker-hover": "",
        }),
      ])
    : value.decorations;
};

const findPressedMarker = (view: EditorView, event: MouseEvent) => {
  const target = event.target;
  if (!(target instanceof Element) || !isHeadingFoldMarkerAt(target, event.clientX)) return null;
  const position = view.posAtDOM(target, 0) - 1;
  return isHeading(view.state.doc.nodeAt(position)) ? position : null;
};

export const createLeafdownHeadingFoldPlugin = () =>
  $prose(
    () =>
      new Plugin({
        key: headingFoldPluginKey,
        state: {
          init: (_, state) => createFoldState(state.doc, []),
          apply: applyFoldTransaction,
        },
        view: trackMarkerHover,
        appendTransaction: (transactions, _, state) => {
          if (
            !transactions.some((transaction) => transaction.docChanged || transaction.selectionSet)
          )
            return null;
          if (state.selection instanceof AllSelection) return null;
          const reached = getFoldedSections(state)
            .filter((section) => selectionReachesSection(state.selection, section))
            .map((section) => section.heading);
          return reached.length > 0
            ? state.tr.setMeta(headingFoldPluginKey, { unfold: reached })
            : null;
        },
        props: {
          decorations: getFoldDecorations,
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (event.button !== 0) return false;
              const heading = findPressedMarker(view, event);
              if (heading === null) return false;
              event.preventDefault();
              toggleHeadingFold(view, heading);
              return true;
            },
          },
        },
      }),
  );
