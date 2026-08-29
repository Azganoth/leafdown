import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  getEditorTextPosition,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { leafdownSourceProjectionPluginKey } from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const getProjectionAdapterId = (mounted: MountedMilkdownEditor) =>
  leafdownSourceProjectionPluginKey.getState(mounted.view.state)?.session?.adapter.id ?? null;

describe("escaped text inside a projected marked fragment", () => {
  it.each([
    { label: "a link", source: String.raw`**a \[b](c) d**` },
    { label: "an image", source: String.raw`**a \![alt](i.png) d**` },
    { label: "an autolink", source: String.raw`**a \<https://example.com> d**` },
    { label: "a character reference", source: String.raw`**a \&copy; d**` },
    {
      label: "a strikethrough",
      // The serializer breaks the pair at both tildes, and the projection follows the file it
      // will write rather than the one it was opened from.
      projected: String.raw`**a \~\~b~~ d**`,
      source: String.raw`**a \~~b~~ d**`,
    },
    { label: "an underscore emphasis", source: String.raw`**a \_b_ d**` },
    { label: "a link opening the fragment", source: String.raw`**\[a](b) d**` },
    { label: "italic holding a link", source: String.raw`*a \[b](c) d*` },
    { label: "strikethrough holding a link", source: String.raw`~~a \[b](c) d~~` },
  ])("shows the backslash keeping $label literal", async ({ projected, source }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, 2);

    expect(getProjectionAdapterId(mounted)).toBe("mark");
    expect(getEditorTextContent(mounted)).toBe(projected ?? source);
  });

  it.each([
    {
      label: "an escaped reference",
      projected: String.raw`**a \&copy; b**`,
      source: String.raw`**a \&copy; b**`,
    },
    { label: "a preserved reference", projected: "**a &copy; b**", source: "**a &copy; b**" },
  ])("tells $label apart from the other", async ({ projected, source }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, 2);

    expect(getEditorTextContent(mounted)).toBe(projected);
  });

  it.each([
    { label: "an asterisk between spaces", projected: "**a * b**", source: String.raw`**a \* b**` },
    {
      label: "a hash away from a line start",
      projected: "**# not a heading**",
      source: String.raw`**\# not a heading**`,
    },
    {
      label: "a shortcut reference",
      projected: "**a [b][c] d**",
      source: String.raw`**a \[b][c] d**`,
    },
  ])("leaves $label bare, as the file will be written", async ({ projected, source }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, 2);

    expect(getEditorTextContent(mounted)).toBe(projected);
    setSelectionAtDocumentEnd(mounted.view);
    expect(mounted.getMarkdown()).toBe(`${projected}\n`);
  });

  it("keeps showing the escape a link label already showed", async () => {
    const source = String.raw`[a \[b](c) d](x)`;
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, 2);

    expect(getProjectionAdapterId(mounted)).toBe("link");
    expect(getEditorTextContent(mounted)).toBe(source);
  });

  it.each([
    { committed: String.raw`**a \[b](c) dX**`, source: String.raw`**a \[b](c) d**`, target: "d" },
    { committed: String.raw`**a \&copy; bX**`, source: String.raw`**a \&copy; b**`, target: "b" },
  ])("commits an edit with the escape intact", async ({ committed, source, target }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, 2);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, target) + 1);
    typeText(mounted.view, "X");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${committed}\n`);
  });

  it("restores the fragment unchanged when nothing is edited", async () => {
    const source = String.raw`**a \[b](c) d** and **a \&copy; b**`;
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, 2);
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });
});
