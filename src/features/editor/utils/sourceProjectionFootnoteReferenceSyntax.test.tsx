import { parserCtx, serializerCtx } from "@milkdown/kit/core";
import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

import {
  getFootnoteReferenceSourceBounds,
  mapFootnoteReferenceDocumentOffsetToSource,
  mapFootnoteReferenceSourceOffsetToDocument,
  parseFootnoteReferenceSource,
  serializeFootnoteReference,
} from "./sourceProjectionFootnoteReferenceSyntax";

const mountEditor = setupMilkdownEditorMount();

describe("footnote-reference source syntax", () => {
  it.each([
    { label: "note", source: "[^note]" },
    { label: "archive]", source: "[^archive\\]]" },
  ])("validates and canonicalizes the $source reference", async ({ label, source }) => {
    const mounted = await mountEditor("Plain");
    const reference = parseFootnoteReferenceSource(mounted.editor.ctx.get(parserCtx), source);

    expect(reference?.type.name).toBe("footnote_reference");
    expect(reference?.attrs.label).toBe(label);
    expect(
      serializeFootnoteReference(
        mounted.view.state,
        mounted.editor.ctx.get(serializerCtx),
        reference!,
      ),
    ).toBe(source);
  });

  it.each(["", "[^]", "[^note", "[^note]\n", "[^note](./article.md)"])(
    "rejects incomplete or non-reference source %j",
    async (source) => {
      const mounted = await mountEditor("Plain");

      expect(parseFootnoteReferenceSource(mounted.editor.ctx.get(parserCtx), source)).toBeNull();
    },
  );

  it("maps between the atomic document node and its editable label", () => {
    const bounds = getFootnoteReferenceSourceBounds("[^archive]");

    expect(bounds).toEqual({ labelFrom: 2, labelTo: 9 });
    expect(mapFootnoteReferenceDocumentOffsetToSource(0, bounds!)).toBe(2);
    expect(mapFootnoteReferenceDocumentOffsetToSource(1, bounds!)).toBe(9);
    expect(mapFootnoteReferenceSourceOffsetToDocument(2, bounds!)).toBe(0);
    expect(mapFootnoteReferenceSourceOffsetToDocument(5, bounds!)).toBe(0);
    expect(mapFootnoteReferenceSourceOffsetToDocument(6, bounds!)).toBe(1);
    expect(mapFootnoteReferenceSourceOffsetToDocument(9, bounds!)).toBe(1);
  });
});
