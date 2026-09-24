import type { MarkdownNode, RemarkParser } from "@milkdown/kit/transformer";
import type { ConstructName } from "mdast-util-to-markdown";

import { isTruthy } from "@/lib/predicates";

import {
  CHARACTER_REFERENCE_MARKDOWN_TYPE,
  readCharacterReference,
} from "./characterReferenceMarkdown";
import { isInsideTableCell, readCellCodeSpanValue } from "./codeMarkdown";
import { findHardBreakRun, HARD_BREAK_MARKDOWN_TYPE } from "./hardBreakMarkdown";
import { withProjectionDefinitions } from "./sourceProjectionDefinitions";
import { getFootnoteReferenceSourceBounds } from "./sourceProjectionFootnoteReferenceSyntax";
import { getMarkdownSourcePosition } from "./sourceProjectionMarkdown";
import type { TextRange } from "./textRanges";

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

interface LinkFootnoteReferenceSourceSegment extends LinkSourceSegmentBase {
  type: "footnoteReference";
}

interface LinkInlineBreakSourceSegment extends LinkSourceSegmentBase {
  type: "inlineBreak";
}

// A break the file spells with a run, which is syntax the label spends on the line ending it closes
// rather than text it holds, so the run ends at `runTo` and the line ending follows it.
interface LinkHardBreakSourceSegment extends LinkSourceSegmentBase {
  runTo: number;
  type: "hardBreak";
}

export type LinkSourceSegment =
  | LinkFootnoteReferenceSourceSegment
  | LinkHardBreakSourceSegment
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

const LINK_MARK_NAME = "link";
const LINK_MARKDOWN_TYPES = new Set(["link", "linkReference"]);
const FOOTNOTE_REFERENCE_SOURCE_TYPE = "footnote-reference";
const FOOTNOTE_REFERENCE_CONTENT_CLASS_NAME =
  "leafdown-source-projection__content--footnote-reference";
const INLINE_BREAK_PATTERN = /\r\n?|\n/gu;
const SOURCE_INLINE_BREAK_PATTERN = /^[\t ]*(?:\r\n?|\n)/u;

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

    const reference = readCharacterReference(source, sourceOffset);

    if (reference && value.startsWith(reference.decoded, valueOffset)) {
      sourceOffset += reference.source.length;

      for (let index = 0; index < reference.decoded.length; index += 1) {
        valueOffset += 1;
        boundaries.push(sourceFrom + sourceOffset);
      }

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
  const position = getMarkdownSourcePosition(node);

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

export const isAtomicLinkSegment = (segment: LinkSourceSegment) =>
  segment.type === "image" || segment.type === "footnoteReference" || segment.type === "hardBreak";

export const isSupportedLinkChild = (node: MarkdownNode): boolean => {
  if (node.type === "text" || node.type === "inlineCode") {
    return typeof node.value === "string";
  }

  if (node.type === CHARACTER_REFERENCE_MARKDOWN_TYPE) {
    return true;
  }

  if (
    node.type === "image" ||
    node.type === "footnoteReference" ||
    node.type === HARD_BREAK_MARKDOWN_TYPE
  ) {
    return true;
  }

  if (node.type !== "strong" && node.type !== "emphasis" && node.type !== "delete") {
    return false;
  }

  return Boolean(node.children?.length) && node.children!.every(isSupportedLinkChild);
};

const getLogicalLinkNode = (root: MarkdownNode, sourceLength: number) => {
  if (
    root.type !== "root" ||
    !root.children?.length ||
    root.children
      .slice(1)
      .some((node) => (getMarkdownSourcePosition(node)?.from ?? -1) < sourceLength)
  ) {
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
    !LINK_MARKDOWN_TYPES.has(candidate.type) ||
    !candidate.children?.length ||
    !candidate.children.every(isSupportedLinkChild)
  ) {
    return null;
  }

  return { link: candidate, outerTypes };
};

const getLinkLabelBounds = (link: MarkdownNode) => {
  const linkPosition = getMarkdownSourcePosition(link);
  const firstChild = link.children?.[0];
  const firstChildPosition = firstChild ? getMarkdownSourcePosition(firstChild) : null;
  const lastChild = link.children?.at(-1);
  const lastChildPosition = lastChild ? getMarkdownSourcePosition(lastChild) : null;

  if (
    !linkPosition ||
    !firstChildPosition ||
    !lastChildPosition ||
    lastChildPosition.to > linkPosition.to ||
    firstChildPosition.from < linkPosition.from ||
    firstChildPosition.from > lastChildPosition.to
  ) {
    return null;
  }

  return {
    from: firstChildPosition.from,
    to: lastChildPosition.to,
  };
};

export const createLinkSourceMap = (
  remark: RemarkParser,
  source: string,
  definitions: readonly string[] = [],
  constructs: readonly ConstructName[] = [],
): LinkSourceMap | null => {
  const parseSource = withProjectionDefinitions(source, definitions);
  let root: MarkdownNode;

  try {
    root = remark.parse(parseSource) as MarkdownNode;
  } catch {
    return null;
  }

  const logicalLink = getLogicalLinkNode(root, source.length);

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
      const value =
        node.type === "inlineCode" && isInsideTableCell(constructs)
          ? readCellCodeSpanValue(getMarkdownNodeValue(node))
          : getMarkdownNodeValue(node);
      const position =
        node.type === "inlineCode"
          ? getInlineCodeSourceRange(source, node)
          : getMarkdownSourcePosition(node);

      if (!position) {
        return false;
      }

      addSourceTypes(nextAncestorTypes);
      addTextSegments(value, position, getLinkContentClassName(nextAncestorTypes));

      return true;
    }

    if (node.type === "image") {
      const position = getMarkdownSourcePosition(node);

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

    // A soft line ending is still text when the source is parsed, so the break reached here is one the
    // file spells with a run.
    if (node.type === HARD_BREAK_MARKDOWN_TYPE) {
      const position = getMarkdownSourcePosition(node);

      if (!position) {
        return false;
      }

      addSourceTypes(nextAncestorTypes);
      segments.push({
        className: getLinkContentClassName(nextAncestorTypes),
        documentFrom: documentOffset,
        documentTo: documentOffset + 1,
        runTo: position.from + findHardBreakRun(source.slice(position.from, position.to)).length,
        sourceFrom: position.from,
        sourceTo: position.to,
        type: "hardBreak",
      });
      documentOffset += 1;

      return true;
    }

    if (node.type === "footnoteReference") {
      const position = getMarkdownSourcePosition(node);

      if (
        !position ||
        !getFootnoteReferenceSourceBounds(source.slice(position.from, position.to))
      ) {
        return false;
      }

      addSourceTypes(nextAncestorTypes);
      sourceTypes.add(FOOTNOTE_REFERENCE_SOURCE_TYPE);
      segments.push({
        className: `${getLinkContentClassName(nextAncestorTypes)} ${FOOTNOTE_REFERENCE_CONTENT_CLASS_NAME}`,
        documentFrom: documentOffset,
        documentTo: documentOffset + 1,
        sourceFrom: position.from,
        sourceTo: position.to,
        type: "footnoteReference",
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
    root = remark.runSync(root, parseSource) as MarkdownNode;
  } catch {
    return null;
  }

  if (!getLogicalLinkNode(root, source.length)) {
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

const LITERAL_SOURCE_NODE_TYPES = new Set(["image", "link"]);

const findLinkNodeBounds = (node: MarkdownNode, range: TextRange): TextRange | null => {
  const position = getMarkdownSourcePosition(node);

  if (
    LITERAL_SOURCE_NODE_TYPES.has(node.type) &&
    position &&
    position.from <= range.from &&
    range.to <= position.to
  ) {
    return position;
  }

  for (const child of node.children ?? []) {
    const bounds = findLinkNodeBounds(child, range);

    if (bounds) {
      return bounds;
    }
  }

  return null;
};

// Text that was never a link carries no mark whose range could bound it.
export const findLinkSourceBounds = (
  remark: RemarkParser,
  text: string,
  range: TextRange,
): TextRange | null => {
  try {
    return findLinkNodeBounds(remark.parse(text) as MarkdownNode, range);
  } catch {
    return null;
  }
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
