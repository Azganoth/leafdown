import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { hasPointerCoordinates, isPrimaryModifierEvent } from "@/lib/input";

import { activateMarkdownLink, type MarkdownLinkContext } from "../utils/linkActivation";
import { EMPTY_MARKDOWN_REFERENCE_CONTEXT } from "../utils/markdownReferences";
import { getRenderedLinkAtTarget, getRenderedLinkTextRange } from "../utils/renderedLinks";

export const leafdownLinkActivationPluginKey = new PluginKey("leafdownLinkActivation");

const DEFAULT_LINK_CONTEXT: MarkdownLinkContext = {
  ...EMPTY_MARKDOWN_REFERENCE_CONTEXT,
  onOpenMarkdownPath: () => false,
};

const getClickedLinkPosition = (view: EditorView, event: MouseEvent, link: HTMLAnchorElement) => {
  const range = getRenderedLinkTextRange(view, link);
  const positionAtClick = hasPointerCoordinates(event)
    ? view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
    : null;

  if (
    positionAtClick !== null &&
    positionAtClick !== undefined &&
    (!range || (range.from <= positionAtClick && positionAtClick <= range.to))
  ) {
    return positionAtClick;
  }

  return range?.to ?? null;
};

const placeCaretInLink = (view: EditorView, event: MouseEvent, link: HTMLAnchorElement) => {
  const position = getClickedLinkPosition(view, event, link);

  if (position === null) {
    return;
  }

  const selection = TextSelection.near(view.state.doc.resolve(position));

  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();
};

const getClickedLink = (view: EditorView, event: MouseEvent) => {
  if (event.button !== 0) {
    return null;
  }

  return getRenderedLinkAtTarget(view.dom, event.target);
};

export const createLeafdownLinkActivationPlugin = (
  getLinkContext: () => MarkdownLinkContext = () => DEFAULT_LINK_CONTEXT,
) =>
  $prose(
    () =>
      new Plugin({
        key: leafdownLinkActivationPluginKey,
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              const link = getClickedLink(view, event);

              if (!link) {
                return false;
              }

              event.preventDefault();

              if (!isPrimaryModifierEvent(event)) {
                placeCaretInLink(view, event, link.element);
                return true;
              }

              void activateMarkdownLink({
                ...getLinkContext(),
                target: link.target,
              });

              return true;
            },
          },
        },
      }),
  );
