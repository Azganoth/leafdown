import { describe, expect, it } from "vitest";

import {
  findSourceProjectionDocumentSegment,
  findSourceProjectionSegment,
  mapNearestSourceProjectionBoundaryToDocument,
  mapSourceProjectionDocumentOffsetToSource,
  mapSourceProjectionDocumentEdgeToSource,
  mapSourceProjectionSourceEdgeToDocument,
} from "./sourceProjectionMap";

const segments = [
  { documentFrom: 0, documentTo: 2, sourceFrom: 0, sourceTo: 4, type: "text" },
  { documentFrom: 2, documentTo: 2, sourceFrom: 4, sourceTo: 6, type: "marker" },
  { documentFrom: 2, documentTo: 3, sourceFrom: 6, sourceTo: 7, type: "text" },
];

describe("source projection map helpers", () => {
  it("finds source segments at either boundary", () => {
    expect(findSourceProjectionSegment(segments, 0)?.type).toBe("text");
    expect(findSourceProjectionSegment(segments, 6)?.type).toBe("marker");
    expect(findSourceProjectionSegment(segments, 99)).toBeUndefined();
  });

  it("selects document segments by association and falls back to the final segment", () => {
    expect(
      findSourceProjectionDocumentSegment(segments, 2, -1, (segment) => segment.type !== "marker")
        ?.sourceFrom,
    ).toBe(0);
    expect(
      findSourceProjectionDocumentSegment(segments, 2, 1, (segment) => segment.type !== "marker")
        ?.sourceFrom,
    ).toBe(6);
    expect(findSourceProjectionDocumentSegment(segments, 99, 1)?.sourceFrom).toBe(6);
  });

  it("maps object edges toward their nearest document or source edge", () => {
    const segment = segments[0];

    expect(mapSourceProjectionSourceEdgeToDocument(1, segment)).toBe(0);
    expect(mapSourceProjectionSourceEdgeToDocument(3, segment)).toBe(2);
    expect(mapSourceProjectionDocumentEdgeToSource(0, segment)).toBe(0);
    expect(mapSourceProjectionDocumentEdgeToSource(1, segment)).toBe(4);
  });

  it("maps text to its nearest source boundary", () => {
    expect(
      mapNearestSourceProjectionBoundaryToDocument(3, {
        ...segments[0],
        sourceBoundaries: [0, 2, 4],
      }),
    ).toBe(1);
    expect(
      mapSourceProjectionDocumentOffsetToSource(2, {
        ...segments[0],
        sourceBoundaries: [0, 2, 4],
      }),
    ).toBe(4);
  });
});
