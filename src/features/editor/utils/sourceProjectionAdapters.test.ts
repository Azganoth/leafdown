import { describe, expect, it } from "vitest";

import {
  findSourceProjectionEscapeOffsets,
  mapLiteralDocumentOffsetToSource,
  mapLiteralSourceOffsetToDocument,
} from "./sourceProjectionAdapters";

const SINGLE_ESCAPE = String.raw`\[a](b)`;
const NESTED_ESCAPES = String.raw`\[!\[alt](i.png)](l.md)`;

describe("literal source offsets", () => {
  it("finds the backslash of each escape", () => {
    expect(findSourceProjectionEscapeOffsets(SINGLE_ESCAPE)).toEqual([0]);
    expect(findSourceProjectionEscapeOffsets(NESTED_ESCAPES)).toEqual([0, 3]);
    expect(findSourceProjectionEscapeOffsets("plain text")).toEqual([]);
  });

  it("maps a document offset onto the source position that spells it", () => {
    expect(
      [0, 1, 2, 6].map((offset) => mapLiteralDocumentOffsetToSource(SINGLE_ESCAPE, offset)),
    ).toEqual([0, 2, 3, 7]);
    expect(
      [0, 1, 2, 3].map((offset) => mapLiteralDocumentOffsetToSource(NESTED_ESCAPES, offset)),
    ).toEqual([0, 2, 3, 5]);
  });

  it("round trips every document offset through the source", () => {
    for (const source of [SINGLE_ESCAPE, NESTED_ESCAPES]) {
      const documentLength = source.length - findSourceProjectionEscapeOffsets(source).length;

      for (let offset = 0; offset <= documentLength; offset += 1) {
        expect(
          mapLiteralSourceOffsetToDocument(
            source,
            mapLiteralDocumentOffsetToSource(source, offset),
          ),
        ).toBe(offset);
      }
    }
  });

  it("clamps an offset past the run to the end of the source", () => {
    expect(mapLiteralDocumentOffsetToSource(SINGLE_ESCAPE, 99)).toBe(SINGLE_ESCAPE.length);
    expect(mapLiteralDocumentOffsetToSource(SINGLE_ESCAPE, -1)).toBe(0);
  });
});
