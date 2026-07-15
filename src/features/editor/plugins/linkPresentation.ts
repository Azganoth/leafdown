import type { Mark } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { getCandidateMarksAtPosition, getMarkRangeAtPosition } from "../utils/marks";
import { getRenderedLinkAtTarget, getRenderedLinkTextRange } from "../utils/renderedLinks";
import type { TextRange } from "../utils/textRanges";
import { SOURCE_PROJECTION_ENTRY_SUPPRESSION_META } from "./sourceProjection";

const HOVERED_LINK_CONTENT_CLASS_NAME = "leafdown-rendered-link__content--hovered";

interface LinkPresentationPluginState {
  hoveredRange: TextRange | null;
}

interface LinkPresentationMeta {
  hoveredRange: TextRange | null;
}

const INITIAL_LINK_PRESENTATION_STATE: LinkPresentationPluginState = {
  hoveredRange: null,
};

export const leafdownLinkPresentationPluginKey = new PluginKey<LinkPresentationPluginState>(
  "leafdownLinkPresentation",
);

const areRangesEqual = (left: TextRange | null, right: TextRange | null) =>
  left === right ||
  (left !== null && right !== null && left.from === right.from && left.to === right.to);

const getLinkMarkAtPosition = (state: EditorState, position: number): Mark | null => {
  const linkType = state.schema.marks.link;

  return linkType
    ? (getCandidateMarksAtPosition(state, position).find((mark) => mark.type === linkType) ?? null)
    : null;
};

const getRenderedLinkRange = (view: EditorView, target: EventTarget | null): TextRange | null => {
  const link = getRenderedLinkAtTarget(view.dom, target);

  if (!link) {
    return null;
  }

  const textRange = getRenderedLinkTextRange(view, link.element);

  if (!textRange || textRange.from === textRange.to) {
    return null;
  }

  const linkMark = getLinkMarkAtPosition(view.state, textRange.from + 1);

  return linkMark ? getMarkRangeAtPosition(view.state, textRange.from + 1, linkMark) : null;
};

const getLinkPresentationState = (state: EditorState) =>
  leafdownLinkPresentationPluginKey.getState(state) ?? INITIAL_LINK_PRESENTATION_STATE;

const setHoveredLinkRange = (view: EditorView, hoveredRange: TextRange | null) => {
  const currentRange = getLinkPresentationState(view.state).hoveredRange;

  if (areRangesEqual(currentRange, hoveredRange)) {
    return;
  }

  view.dispatch(
    view.state.tr
      .setMeta(leafdownLinkPresentationPluginKey, {
        hoveredRange,
      } satisfies LinkPresentationMeta)
      .setMeta(SOURCE_PROJECTION_ENTRY_SUPPRESSION_META, true),
  );
};

const handleRenderedLinkMouseOver = (view: EditorView, event: Event) => {
  setHoveredLinkRange(view, getRenderedLinkRange(view, event.target));

  return false;
};

const handleRenderedLinkMouseOut = (view: EditorView, event: Event) => {
  const currentRange = getLinkPresentationState(view.state).hoveredRange;
  const eventRange = getRenderedLinkRange(view, event.target);

  if (!currentRange || !areRangesEqual(currentRange, eventRange)) {
    return false;
  }

  const relatedRange = getRenderedLinkRange(view, (event as MouseEvent).relatedTarget);

  if (!areRangesEqual(currentRange, relatedRange)) {
    setHoveredLinkRange(view, null);
  }

  return false;
};

const getLinkPresentationDecorations = (state: EditorState) => {
  const { hoveredRange } = getLinkPresentationState(state);

  return hoveredRange
    ? DecorationSet.create(state.doc, [
        Decoration.inline(hoveredRange.from, hoveredRange.to, {
          class: HOVERED_LINK_CONTENT_CLASS_NAME,
        }),
      ])
    : DecorationSet.empty;
};

export const createLeafdownLinkPresentationPlugin = () =>
  $prose(
    () =>
      new Plugin<LinkPresentationPluginState>({
        key: leafdownLinkPresentationPluginKey,
        props: {
          decorations: getLinkPresentationDecorations,
          handleDOMEvents: {
            mouseout: handleRenderedLinkMouseOut,
            mouseover: handleRenderedLinkMouseOver,
          },
        },
        state: {
          init: () => INITIAL_LINK_PRESENTATION_STATE,
          apply: (transaction, pluginState) => {
            const meta = transaction.getMeta(leafdownLinkPresentationPluginKey) as
              | LinkPresentationMeta
              | undefined;

            return meta ? { hoveredRange: meta.hoveredRange } : pluginState;
          },
        },
      }),
  );
