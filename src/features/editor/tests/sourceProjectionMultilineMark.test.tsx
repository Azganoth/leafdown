import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});
const MULTILINE_MARK_SOURCE = "**one\ntwo**";

describe("multiline marked fragment source projection", () => {
  it.each([
    { line: "one", offset: 1 },
    { line: "two", offset: 1 },
  ])("projects the whole fragment from the $line side of its break", async ({ line, offset }) => {
    const mounted = await mountProjectionEditor(MULTILINE_MARK_SOURCE);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, line) + offset);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(MULTILINE_MARK_SOURCE);
  });

  it.each([
    { label: "a plain fragment", source: MULTILINE_MARK_SOURCE },
    {
      label: "a fragment holding a footnote reference",
      source: "**one\ntwo[^n]**\n\n[^n]: Detail",
    },
  ])("restores $label unchanged when nothing is edited", async ({ source }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it("commits an edit to a multiline fragment as one mark", async () => {
    const mounted = await mountProjectionEditor(MULTILINE_MARK_SOURCE);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + 1);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + "one".length);
    typeText(mounted.view, "X");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("**oneX\ntwo**\n");
    expect(getEditorNodePosition(mounted, "hardbreak")).toBeGreaterThan(0);
  });
});
