import type { EditorView } from "@milkdown/kit/prose/view";

export interface RenderedLink {
  element: HTMLAnchorElement;
  target: string;
}

export interface RenderedLinkTextRange {
  from: number;
  to: number;
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

  for (const child of Array.from(node.childNodes).toReversed()) {
    const textNode = findLastTextNode(child);

    if (textNode) {
      return textNode;
    }
  }

  return null;
};

export const getRenderedLinkAtTarget = (
  root: HTMLElement,
  target: EventTarget | null,
): RenderedLink | null => {
  if (!(target instanceof Element)) {
    return null;
  }

  const link = target.closest<HTMLAnchorElement>("a[href]");

  if (!link || !root.contains(link)) {
    return null;
  }

  const href = link.getAttribute("href")?.trim();

  return href ? { element: link, target: href } : null;
};

export const getRenderedLinkTextRange = (
  view: EditorView,
  link: HTMLAnchorElement,
): RenderedLinkTextRange | null => {
  const firstTextNode = findFirstTextNode(link);
  const lastTextNode = findLastTextNode(link);

  if (!firstTextNode || !lastTextNode) {
    return null;
  }

  try {
    const from = view.posAtDOM(firstTextNode, 0);
    const to = view.posAtDOM(lastTextNode, lastTextNode.data.length);

    return from <= to ? { from, to } : null;
  } catch {
    return null;
  }
};
