import type { MarkdownNode, RemarkParser } from "@milkdown/kit/transformer";

import { isTruthy } from "@/lib/predicates";

interface LinkSourceSegmentBase {
  className: string;
  documentFrom: number;
  documentTo: number;
  sourceFrom: number;
  sourceTo: number;
}

interface LinkTextSourceSegment extends LinkSourceSegmentBase {
  sourceBoundaries: number[];
  type: "text";
}

interface LinkImageSourceSegment extends LinkSourceSegmentBase {
  type: "image";
}

interface LinkInlineBreakSourceSegment extends LinkSourceSegmentBase {
  type: "inlineBreak";
}

export type LinkSourceSegment =
  | LinkImageSourceSegment
  | LinkInlineBreakSourceSegment
  | LinkTextSourceSegment;

export interface LinkSourceMap {
  documentSize: number;
  labelFrom: number;
  labelTo: number;
  segments: LinkSourceSegment[];
  sourceTypes: string[];
}

interface MarkdownPosition {
  end?: { offset?: number };
  start?: { offset?: number };
}

const LINK_MARK_NAME = "link";
const INLINE_BREAK_PATTERN = /\r\n?|\n/gu;
const SOURCE_INLINE_BREAK_PATTERN = /^[\t ]*(?:\r\n?|\n)/u;

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
  let valueOffset = 0;

  while (valueOffset < value.length) {
    const valueBreak = /^(?:\r\n?|\n)/u.exec(value.slice(valueOffset));
    const sourceBreak = valueBreak
      ? SOURCE_INLINE_BREAK_PATTERN.exec(source.slice(sourceOffset))
      : null;

    if (valueBreak && sourceBreak) {
      for (let offset = 1; offset < valueBreak[0].length; offset += 1) {
        boundaries.push(sourceFrom + sourceOffset);
      }

      sourceOffset += sourceBreak[0].length;
      valueOffset += valueBreak[0].length;
      boundaries.push(sourceFrom + sourceOffset);
      continue;
    }

    if (source[sourceOffset] === "\\" && source[sourceOffset + 1] === value[valueOffset]) {
      sourceOffset += 2;
    } else if (source[sourceOffset] === value[valueOffset]) {
      sourceOffset += 1;
    } else {
      const remainingValueLength = value.length - valueOffset;
      const remainingSourceLength = source.length - sourceOffset;
      sourceOffset += Math.max(1, Math.round(remainingSourceLength / remainingValueLength));
    }

    valueOffset += 1;
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
    .filter(isTruthy)
    .join(" ");

const isInlineSoftBreak = (node: MarkdownNode) =>
  node.type === "break" && (node.data as { isInline?: boolean } | undefined)?.isInline === true;

const isSupportedLinkChild = (node: MarkdownNode): boolean => {
  if (node.type === "text" || node.type === "inlineCode") {
    return typeof node.value === "string";
  }

  if (node.type === "image" || isInlineSoftBreak(node)) {
    return true;
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

const getLinkLabelBounds = (link: MarkdownNode) => {
  const linkPosition = getMarkdownPosition(link);
  const lastChild = link.children?.at(-1);
  const lastChildPosition = lastChild ? getMarkdownPosition(lastChild) : null;

  if (
    !linkPosition ||
    !lastChildPosition ||
    lastChildPosition.to > linkPosition.to ||
    linkPosition.from + 1 > lastChildPosition.to
  ) {
    return null;
  }

  return {
    from: linkPosition.from + 1,
    to: lastChildPosition.to,
  };
};

export const createLinkSourceMap = (remark: RemarkParser, source: string): LinkSourceMap | null => {
  let root: MarkdownNode;

  try {
    root = remark.parse(source) as MarkdownNode;
  } catch {
    return null;
  }

  const logicalLink = getLogicalLinkNode(root);

  if (!logicalLink) {
    return null;
  }

  const { link, outerTypes } = logicalLink;
  const labelBounds = getLinkLabelBounds(link);

  if (!labelBounds) {
    return null;
  }

  const segments: LinkSourceSegment[] = [];
  const sourceTypes = new Set<string>([LINK_MARK_NAME]);
  let documentOffset = 0;

  const addTextSegments = (
    value: string,
    position: { from: number; to: number },
    className: string,
  ) => {
    const rawSource = source.slice(position.from, position.to);
    const sourceBoundaries = getTextSourceBoundaries(rawSource, value, position.from);
    let valueFrom = 0;

    for (const match of value.matchAll(INLINE_BREAK_PATTERN)) {
      const breakFrom = match.index;

      if (valueFrom < breakFrom) {
        segments.push({
          className,
          documentFrom: documentOffset,
          documentTo: documentOffset + breakFrom - valueFrom,
          sourceBoundaries: sourceBoundaries.slice(valueFrom, breakFrom + 1),
          sourceFrom: sourceBoundaries[valueFrom],
          sourceTo: sourceBoundaries[breakFrom],
          type: "text",
        });
        documentOffset += breakFrom - valueFrom;
      }

      const breakTo = breakFrom + match[0].length;

      segments.push({
        className,
        documentFrom: documentOffset,
        documentTo: documentOffset + 1,
        sourceFrom: sourceBoundaries[breakFrom],
        sourceTo: sourceBoundaries[breakTo],
        type: "inlineBreak",
      });
      documentOffset += 1;
      valueFrom = breakTo;
    }

    if (valueFrom < value.length) {
      segments.push({
        className,
        documentFrom: documentOffset,
        documentTo: documentOffset + value.length - valueFrom,
        sourceBoundaries: sourceBoundaries.slice(valueFrom),
        sourceFrom: sourceBoundaries[valueFrom],
        sourceTo: position.to,
        type: "text",
      });
      documentOffset += value.length - valueFrom;
    }
  };

  const addSourceTypes = (ancestorTypes: readonly string[]) => {
    for (const type of ancestorTypes) {
      if (type === "delete") {
        sourceTypes.add("strike_through");
      } else if (type === "strong" || type === "emphasis" || type === "inlineCode") {
        sourceTypes.add(type);
      }
    }
  };

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

      addSourceTypes(nextAncestorTypes);
      addTextSegments(value, position, getLinkContentClassName(nextAncestorTypes));

      return true;
    }

    if (node.type === "image") {
      const position = getMarkdownPosition(node);

      if (!position) {
        return false;
      }

      addSourceTypes(nextAncestorTypes);
      segments.push({
        className: getLinkContentClassName(nextAncestorTypes),
        documentFrom: documentOffset,
        documentTo: documentOffset + 1,
        sourceFrom: position.from,
        sourceTo: position.to,
        type: "image",
      });
      documentOffset += 1;

      return true;
    }

    return node.children?.every((child) => visit(child, nextAncestorTypes)) ?? false;
  };

  if (!visit(link, outerTypes)) {
    return null;
  }

  try {
    root = remark.runSync(root, source) as MarkdownNode;
  } catch {
    return null;
  }

  if (!getLogicalLinkNode(root)) {
    return null;
  }

  return {
    documentSize: documentOffset,
    labelFrom: labelBounds.from,
    labelTo: labelBounds.to,
    segments,
    sourceTypes: [...sourceTypes],
  };
};

export const mapLinkDocumentPositionToSource = (
  position: number,
  map: LinkSourceMap,
  association: -1 | 1 = 1,
) => {
  const offset = Math.min(Math.max(position, 0), map.documentSize);
  const matchingSegments = map.segments.filter(
    ({ documentFrom, documentTo }) => documentFrom <= offset && offset <= documentTo,
  );
  const segment =
    (association < 0 ? matchingSegments[0] : matchingSegments.at(-1)) ?? map.segments.at(-1);

  if (!segment) {
    return 0;
  }

  if (segment.type !== "text") {
    return offset <= segment.documentFrom ? segment.sourceFrom : segment.sourceTo;
  }

  return segment.sourceBoundaries[
    Math.min(Math.max(offset - segment.documentFrom, 0), segment.sourceBoundaries.length - 1)
  ];
};

export const mapLinkSourcePositionToDocument = (position: number, map: LinkSourceMap) => {
  let closestDocumentPosition = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const segment of map.segments) {
    const sourceBoundaries =
      segment.type === "text" ? segment.sourceBoundaries : [segment.sourceFrom, segment.sourceTo];

    for (const [offset, sourcePosition] of sourceBoundaries.entries()) {
      const distance = Math.abs(position - sourcePosition);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestDocumentPosition = segment.documentFrom + offset;
      }
    }
  }

  return closestDocumentPosition;
};
