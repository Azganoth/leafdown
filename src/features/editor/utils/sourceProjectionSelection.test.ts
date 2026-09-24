import { describe, expect, it } from "vitest";

import {
  mapSelectionPositionFromSourceProjection,
  mapSelectionPositionOutsideSourceProjection,
} from "./sourceProjectionSelection";

const target = { from: 10, originalSource: "[text]", to: 14 };

describe("source projection selection helpers", () => {
  it("maps positions outside a projection while treating its edges as outside", () => {
    expect(mapSelectionPositionOutsideSourceProjection(9, target)).toBe(9);
    expect(mapSelectionPositionOutsideSourceProjection(10, target)).toBe(10);
    expect(mapSelectionPositionOutsideSourceProjection(14, target)).toBe(16);
    expect(mapSelectionPositionOutsideSourceProjection(13, target)).toBeNull();
  });

  it("supports exclusive projection edges for maps that own their boundaries", () => {
    expect(mapSelectionPositionOutsideSourceProjection(10, target, "exclusive")).toBeNull();
    expect(mapSelectionPositionOutsideSourceProjection(14, target, "exclusive")).toBeNull();
    expect(mapSelectionPositionOutsideSourceProjection(15, target, "exclusive")).toBe(17);
  });

  it("maps positions outside a source projection back to the document", () => {
    const session = { from: 10, target: { originalContentSize: 3 }, to: 14 };
    const result = { replacementSize: 2 };

    expect(mapSelectionPositionFromSourceProjection(9, session, result)).toBe(9);
    expect(mapSelectionPositionFromSourceProjection(10, session, result)).toBe(10);
    expect(mapSelectionPositionFromSourceProjection(14, session, result)).toBe(12);
    expect(mapSelectionPositionFromSourceProjection(15, session, result, 3)).toBe(12);
    expect(mapSelectionPositionFromSourceProjection(18, session, result, 3)).toBe(13);
    expect(mapSelectionPositionFromSourceProjection(12, session, result)).toBeNull();
  });
});
