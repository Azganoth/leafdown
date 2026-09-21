import { html, parseFragment, type DefaultTreeAdapterTypes } from "parse5";

import { readCharacterReference } from "./characterReferenceMarkdown";

const ALLOWED_ELEMENTS = new Set([
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "del",
  "ins",
  "mark",
  "sub",
  "sup",
  "code",
  "kbd",
  "samp",
  "var",
  "abbr",
  "small",
  "span",
  "div",
  "p",
  "section",
  "details",
  "summary",
  "hr",
  "dl",
  "dt",
  "dd",
]);
const BLOCK_ROOT_ELEMENTS = new Set([
  "div",
  "p",
  "section",
  "details",
  "summary",
  "hr",
  "dl",
  "dt",
  "dd",
]);
const VOID_ELEMENTS = new Set(["br", "hr"]);

type HtmlAstChild = DefaultTreeAdapterTypes.ChildNode;
type HtmlAstElement = DefaultTreeAdapterTypes.Element;
type HtmlAstText = DefaultTreeAdapterTypes.TextNode;

export type SafeHtmlFlow = "block" | "inline";

export interface SafeHtmlRender {
  element: Element;
  flow: SafeHtmlFlow;
  getSourceOffset(node: Node, offset: number): number | null;
}

const isAstElement = (node: HtmlAstChild): node is HtmlAstElement => "tagName" in node;
const isAstText = (node: HtmlAstChild): node is HtmlAstText => node.nodeName === "#text";

const isAllowedTree = (node: HtmlAstChild): boolean => {
  if (isAstText(node)) {
    return node.sourceCodeLocation != null;
  }

  if (!isAstElement(node)) {
    return false;
  }

  const location = node.sourceCodeLocation;
  const closesItself = VOID_ELEMENTS.has(node.tagName) || location?.endTag != null;

  return (
    node.namespaceURI === html.NS.HTML &&
    ALLOWED_ELEMENTS.has(node.tagName) &&
    node.attrs.length === 0 &&
    location?.startTag != null &&
    closesItself &&
    node.childNodes.every(isAllowedTree)
  );
};

const createTextSourceBoundaries = (
  source: string,
  node: HtmlAstText,
): readonly number[] | null => {
  const location = node.sourceCodeLocation;

  if (!location) {
    return null;
  }

  const boundaries = Array.from({ length: node.value.length + 1 }, () => 0);
  let sourceOffset = location.startOffset;
  let textOffset = 0;

  boundaries[0] = sourceOffset;

  while (sourceOffset < location.endOffset && textOffset < node.value.length) {
    if (source[sourceOffset] === "&") {
      const reference = readCharacterReference(source, sourceOffset);

      if (
        reference &&
        sourceOffset + reference.source.length <= location.endOffset &&
        node.value.startsWith(reference.decoded, textOffset)
      ) {
        for (let offset = 1; offset < reference.decoded.length; offset += 1) {
          boundaries[textOffset + offset] = sourceOffset;
        }
        sourceOffset += reference.source.length;
        textOffset += reference.decoded.length;
        boundaries[textOffset] = sourceOffset;
        continue;
      }
    }

    const sourceCharacter = source[sourceOffset];
    const normalizedCharacter = sourceCharacter === "\r" ? "\n" : sourceCharacter;
    const sourceLength = source.startsWith("\r\n", sourceOffset) ? 2 : 1;

    if (node.value[textOffset] !== normalizedCharacter) {
      return null;
    }

    sourceOffset += sourceLength;
    textOffset += 1;
    boundaries[textOffset] = sourceOffset;
  }

  return sourceOffset === location.endOffset && textOffset === node.value.length
    ? boundaries
    : null;
};

const createDomTree = (
  source: string,
  node: HtmlAstChild,
  sourceBoundaries: WeakMap<Node, readonly number[]>,
): Node => {
  if (isAstText(node)) {
    const text = document.createTextNode(node.value);
    const boundaries = createTextSourceBoundaries(source, node);

    if (boundaries) {
      sourceBoundaries.set(text, boundaries);
    }

    return text;
  }

  if (!isAstElement(node)) {
    throw new Error("Safe HTML validation admitted a non-renderable node");
  }

  const element = document.createElement(node.tagName);
  const location = node.sourceCodeLocation!;
  const contentStart = location.startTag!.endOffset;
  const contentEnd = location.endTag?.startOffset ?? location.endOffset;
  const boundaries = [contentStart];

  for (const child of node.childNodes) {
    element.append(createDomTree(source, child, sourceBoundaries));
    boundaries.push(child.sourceCodeLocation?.endOffset ?? contentEnd);
  }

  boundaries[boundaries.length - 1] = contentEnd;
  sourceBoundaries.set(element, boundaries);

  return element;
};

const resolveSourceOffset = (
  root: Element,
  sourceBoundaries: WeakMap<Node, readonly number[]>,
  node: Node,
  offset: number,
) => {
  let current: Node | null = node;
  let currentOffset = offset;

  while (current && (current === root || root.contains(current))) {
    const boundaries = sourceBoundaries.get(current);

    if (boundaries) {
      const boundedOffset = Math.min(Math.max(currentOffset, 0), boundaries.length - 1);
      return boundaries[boundedOffset] ?? null;
    }

    const parent: Node | null = current.parentNode;

    if (!parent) {
      break;
    }

    currentOffset = Array.prototype.indexOf.call(parent.childNodes, current);
    current = parent;
  }

  return null;
};

export const parseSafeHtml = (source: string): SafeHtmlRender | null => {
  const fragment = parseFragment(source, { sourceCodeLocationInfo: true });
  const root = fragment.childNodes[0];

  if (
    fragment.childNodes.length !== 1 ||
    !root ||
    !isAstElement(root) ||
    root.sourceCodeLocation?.startOffset !== 0 ||
    root.sourceCodeLocation.endOffset !== source.length ||
    !isAllowedTree(root)
  ) {
    return null;
  }

  const sourceBoundaries = new WeakMap<Node, readonly number[]>();
  const element = createDomTree(source, root, sourceBoundaries);

  if (!(element instanceof Element)) {
    return null;
  }

  return {
    element,
    flow: BLOCK_ROOT_ELEMENTS.has(root.tagName) ? "block" : "inline",
    getSourceOffset: (node, offset) => resolveSourceOffset(element, sourceBoundaries, node, offset),
  };
};
