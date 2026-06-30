import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { hasPointerCoordinates, isPrimaryModifierEvent } from "@/lib/input";

import { activateMarkdownLink, type MarkdownLinkContext } from "../utils/linkActivation";
import { EMPTY_MARKDOWN_REFERENCE_CONTEXT } from "../utils/markdownReferences";

export const leafdownLinkActivationPluginKey = new PluginKey("leafdownLinkActivation");

const DEFAULT_LINK_CONTEXT: MarkdownLinkContext = {
  ...EMPTY_MARKDOWN_REFERENCE_CONTEXT,
  onOpenMarkdownPath: () => false,
};

interface ClickedLink {
  element: HTMLAnchorElement;
  target: string;
}

interface LinkTextRange {
  end: number;
  start: number;
}

const isTextNode = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE;

const findFirstTextNode = (node: Node): Text | null => {
  if (isTextNode(node) && node.data.length > 0) {
    return node;
  }

  for (const child of node.childNodes) {
    const textNode = findFirstTextNode(child);

    if (textNode) {
      return textNode;
    }
  }

  return null;
};

const findLastTextNode = (node: Node): Text | null => {
  if (isTextNode(node) && node.data.length > 0) {
    return node;
  }

  for (const child of Array.from(node.childNodes).reverse()) {
    const textNode = findLastTextNode(child);

    if (textNode) {
      return textNode;
    }
  }

  return null;
};

const getLinkTextRange = (view: EditorView, link: HTMLAnchorElement): LinkTextRange | null => {
  const firstTextNode = findFirstTextNode(link);
  const lastTextNode = findLastTextNode(link);

  if (!firstTextNode || !lastTextNode) {
    return null;
  }

  try {
    const start = view.posAtDOM(firstTextNode, 0);
    const end = view.posAtDOM(lastTextNode, lastTextNode.data.length);

    if (start > end) {
      return null;
    }

    return { end, start };
  } catch {
    return null;
  }
};

const getClickedLinkPosition = (view: EditorView, event: MouseEvent, link: HTMLAnchorElement) => {
  const range = getLinkTextRange(view, link);
  const positionAtClick = hasPointerCoordinates(event)
    ? view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
    : null;

  if (
    positionAtClick !== null &&
    positionAtClick !== undefined &&
    (!range || (range.start <= positionAtClick && positionAtClick <= range.end))
  ) {
    return positionAtClick;
  }

  return range?.end ?? null;
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

const getClickedLink = (view: EditorView, event: MouseEvent): ClickedLink | null => {
  if (!(event.target instanceof Element) || event.button !== 0) {
    return null;
  }

  const link = event.target.closest<HTMLAnchorElement>("a[href]");

  if (!link || !view.dom.contains(link)) {
    return null;
  }

  const target = link.getAttribute("href")?.trim();

  if (!target) {
    return null;
  }

  return { element: link, target };
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
