import type { MarkdownNode, RemarkParser } from "@milkdown/kit/transformer";

import { isNonNullish } from "@/lib/predicates";

export interface LinkSourceLeaf {
  className: string;
  documentFrom: number;
  documentTo: number;
  sourceBoundaries: number[];
  sourceFrom: number;
  sourceTo: number;
}

export interface LinkSourceMap {
  documentSize: number;
  leaves: LinkSourceLeaf[];
  sourceTypes: string[];
}

interface MarkdownPosition {
  end?: { offset?: number };
  start?: { offset?: number };
}

const LINK_MARK_NAME = "link";

const getMarkdownPosition = (node: MarkdownNode) => {
  const position = node.position as MarkdownPosition | undefined;
  const from = position?.start?.offset;
  const to = position?.end?.offset;

  return typeof from === "number" && typeof to === "number" ? { from, to } : null;
};

const getMarkdownNodeValue = (node: MarkdownNode) =>
  typeof node.value === "string" ? node.value : "";

const getTextSourceBoundaries = (source: string, value: string, sourceFrom: number) => {
  const boundaries = [sourceFrom];
  let sourceOffset = 0;

  for (let valueOffset = 0; valueOffset < value.length; valueOffset += 1) {
    if (source[sourceOffset] === "\\" && source[sourceOffset + 1] === value[valueOffset]) {
      sourceOffset += 2;
    } else if (source[sourceOffset] === value[valueOffset]) {
      sourceOffset += 1;
    } else {
      const remainingValueLength = value.length - valueOffset;
      const remainingSourceLength = source.length - sourceOffset;
      sourceOffset += Math.max(1, Math.round(remainingSourceLength / remainingValueLength));
    }

    boundaries.push(sourceFrom + Math.min(sourceOffset, source.length));
  }

  boundaries[boundaries.length - 1] = sourceFrom + source.length;

  return boundaries;
};

const getInlineCodeSourceRange = (source: string, node: MarkdownNode) => {
  const position = getMarkdownPosition(node);

  if (!position) {
    return null;
  }

  const rawSource = source.slice(position.from, position.to);
  const openingLength = /^`+/u.exec(rawSource)?.[0].length ?? 0;
  const closingLength = /`+$/u.exec(rawSource)?.[0].length ?? 0;
  const rawContent = rawSource.slice(openingLength, rawSource.length - closingLength);
  const value = getMarkdownNodeValue(node);
  const valueOffset = rawContent.indexOf(value);
  const contentOffset = valueOffset >= 0 ? valueOffset : 0;
  const from = position.from + openingLength + contentOffset;

  return {
    from,
    to: from + Math.min(value.length, rawContent.length - contentOffset),
  };
};

const getLinkContentClassName = (ancestorTypes: readonly string[]) =>
  [
    "leafdown-source-projection__content",
    "leafdown-source-projection__content--link",
    ancestorTypes.includes("strong") && "leafdown-source-projection__content--strong",
    ancestorTypes.includes("emphasis") && "leafdown-source-projection__content--emphasis",
    ancestorTypes.includes("delete") && "leafdown-source-projection__content--strikethrough",
    ancestorTypes.includes("inlineCode") && "leafdown-source-projection__content--inline-code",
  ]
    .filter(isNonNullish)
    .join(" ");

const isSupportedLinkChild = (node: MarkdownNode): boolean => {
  if (node.type === "text" || node.type === "inlineCode") {
    return typeof node.value === "string";
  }

  if (node.type !== "strong" && node.type !== "emphasis" && node.type !== "delete") {
    return false;
  }

  return Boolean(node.children?.length) && node.children!.every(isSupportedLinkChild);
};

const getLogicalLinkNode = (root: MarkdownNode) => {
  if (root.type !== "root" || root.children?.length !== 1) {
    return null;
  }

  const paragraph = root.children[0];

  if (paragraph.type !== "paragraph" || paragraph.children?.length !== 1) {
    return null;
  }

  let candidate = paragraph.children[0];
  const outerTypes: string[] = [];

  while (
    (candidate.type === "strong" || candidate.type === "emphasis" || candidate.type === "delete") &&
    candidate.children?.length === 1
  ) {
    outerTypes.push(candidate.type);
    candidate = candidate.children[0];
  }

  if (
    candidate.type !== "link" ||
    !candidate.children?.length ||
    !candidate.children.every(isSupportedLinkChild)
  ) {
    return null;
  }

  return { link: candidate, outerTypes };
};

export const createLinkSourceMap = (remark: RemarkParser, source: string): LinkSourceMap | null => {
  let root: MarkdownNode;

  try {
    root = remark.runSync(remark.parse(source), source) as MarkdownNode;
  } catch {
    return null;
  }

  const logicalLink = getLogicalLinkNode(root);

  if (!logicalLink) {
    return null;
  }

  const { link, outerTypes } = logicalLink;
  const leaves: LinkSourceLeaf[] = [];
  const sourceTypes = new Set<string>([LINK_MARK_NAME]);
  let documentOffset = 0;

  const visit = (node: MarkdownNode, ancestorTypes: readonly string[]): boolean => {
    const nextAncestorTypes = [...ancestorTypes, node.type];

    if (node.type === "text" || node.type === "inlineCode") {
      const value = getMarkdownNodeValue(node);
      const position =
        node.type === "inlineCode"
          ? getInlineCodeSourceRange(source, node)
          : getMarkdownPosition(node);

      if (!position) {
        return false;
      }

      const rawSource = source.slice(position.from, position.to);
      const sourceBoundaries = getTextSourceBoundaries(rawSource, value, position.from);

      for (const type of nextAncestorTypes) {
        if (type === "delete") {
          sourceTypes.add("strike_through");
        } else if (type === "strong" || type === "emphasis" || type === "inlineCode") {
          sourceTypes.add(type);
        }
      }

      leaves.push({
        className: getLinkContentClassName(nextAncestorTypes),
        documentFrom: documentOffset,
        documentTo: documentOffset + value.length,
        sourceBoundaries,
        sourceFrom: position.from,
        sourceTo: position.to,
      });
      documentOffset += value.length;

      return true;
    }

    return node.children?.every((child) => visit(child, nextAncestorTypes)) ?? false;
  };

  if (!visit(link, outerTypes)) {
    return null;
  }

  return {
    documentSize: documentOffset,
    leaves,
    sourceTypes: [...sourceTypes],
  };
};

export const mapLinkDocumentPositionToSource = (
  position: number,
  map: LinkSourceMap,
  association: -1 | 1 = 1,
) => {
  const offset = Math.min(Math.max(position, 0), map.documentSize);
  const matchingLeaves = map.leaves.filter(
    ({ documentFrom, documentTo }) => documentFrom <= offset && offset <= documentTo,
  );
  const leaf = (association < 0 ? matchingLeaves[0] : matchingLeaves.at(-1)) ?? map.leaves.at(-1);

  if (!leaf) {
    return 0;
  }

  return leaf.sourceBoundaries[
    Math.min(Math.max(offset - leaf.documentFrom, 0), leaf.sourceBoundaries.length - 1)
  ];
};

export const mapLinkSourcePositionToDocument = (position: number, map: LinkSourceMap) => {
  let closestDocumentPosition = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const leaf of map.leaves) {
    for (const [offset, sourcePosition] of leaf.sourceBoundaries.entries()) {
      const distance = Math.abs(position - sourcePosition);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestDocumentPosition = leaf.documentFrom + offset;
      }
    }
  }

  return closestDocumentPosition;
};
