export interface SourceProjectionSegmentBounds {
  documentFrom: number;
  documentTo: number;
  sourceFrom: number;
  sourceTo: number;
}

export const findSourceProjectionSegment = <Segment extends SourceProjectionSegmentBounds>(
  segments: readonly Segment[],
  sourceOffset: number,
) =>
  segments.find(
    ({ sourceFrom, sourceTo }) => sourceFrom <= sourceOffset && sourceOffset <= sourceTo,
  );

export const findSourceProjectionDocumentSegment = <Segment extends SourceProjectionSegmentBounds>(
  segments: readonly Segment[],
  documentOffset: number,
  association: -1 | 1,
  includeSegment: (segment: Segment) => boolean = () => true,
) => {
  const matchingSegments = segments.filter(
    (segment) =>
      includeSegment(segment) &&
      segment.documentFrom <= documentOffset &&
      documentOffset <= segment.documentTo,
  );

  return (association < 0 ? matchingSegments[0] : matchingSegments.at(-1)) ?? segments.at(-1);
};

export const mapSourceProjectionSourceEdgeToDocument = (
  sourceOffset: number,
  segment: SourceProjectionSegmentBounds,
) =>
  sourceOffset - segment.sourceFrom < segment.sourceTo - sourceOffset
    ? segment.documentFrom
    : segment.documentTo;

export const mapSourceProjectionDocumentEdgeToSource = (
  documentOffset: number,
  segment: SourceProjectionSegmentBounds,
) => (documentOffset <= segment.documentFrom ? segment.sourceFrom : segment.sourceTo);

export const mapNearestSourceProjectionBoundaryToDocument = (
  sourceOffset: number,
  segment: SourceProjectionSegmentBounds & { sourceBoundaries: readonly number[] },
) => {
  let closestDocumentOffset = segment.documentFrom;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const [documentOffset, boundary] of segment.sourceBoundaries.entries()) {
    const distance = Math.abs(sourceOffset - boundary);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestDocumentOffset = segment.documentFrom + documentOffset;
    }
  }

  return closestDocumentOffset;
};

export const mapSourceProjectionDocumentOffsetToSource = (
  documentOffset: number,
  segment: SourceProjectionSegmentBounds & { sourceBoundaries: readonly number[] },
) =>
  segment.sourceBoundaries[
    Math.min(
      Math.max(documentOffset - segment.documentFrom, 0),
      segment.sourceBoundaries.length - 1,
    )
  ];
