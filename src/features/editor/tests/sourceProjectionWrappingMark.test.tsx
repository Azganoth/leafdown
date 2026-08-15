import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
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
const WRAPPING_MARK_SOURCE = "**bold [a b](./doc.md) tail**";

const enterProjectionAt = (
  mounted: Awaited<ReturnType<typeof mountProjectionEditor>>,
  text: string,
) => {
  setTextSelection(mounted.view, getEditorTextPosition(mounted, text) + 1);

  expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
};

describe("wrapping mark source projection", () => {
  it.each([{ side: "bold" }, { side: "tail" }])(
    "projects the whole run from the $side side of the link",
    async ({ side }) => {
      const mounted = await mountProjectionEditor(WRAPPING_MARK_SOURCE);

      enterProjectionAt(mounted, side);

      expect(getEditorTextContent(mounted)).toBe(WRAPPING_MARK_SOURCE);
    },
  );

  it.each([
    { label: "emphasis", source: "*bold [a b](./doc.md) tail*" },
    { label: "strikethrough", source: "~~bold [a b](./doc.md) tail~~" },
    { label: "a formatted label", source: "**bold [a *b*](./doc.md) tail**" },
    { label: "a titled destination", source: '**bold [a b](./doc.md "Doc") tail**' },
    { label: "two links", source: "**bold [a b](./doc.md) mid [c d](./other.md) tail**" },
    { label: "an image label", source: "**bold [![alt](./p.png)](./doc.md) tail**" },
    { label: "a label spanning a line break", source: "**bold [first\nsecond](./doc.md) tail**" },
    {
      definition: "\n\n[^n]: Detail",
      label: "a footnote reference beside the link",
      source: "**bold[^n] [a b](./doc.md) tail**",
    },
  ])("projects a run wrapping $label as one source object", async ({ definition = "", source }) => {
    const mounted = await mountProjectionEditor(`${source}${definition}`);

    enterProjectionAt(mounted, "bold");

    expect(getEditorTextContent(mounted).startsWith(source)).toBe(true);
  });

  it("presents the link inside the run as a label between markers", async () => {
    const mounted = await mountProjectionEditor(WRAPPING_MARK_SOURCE);

    enterProjectionAt(mounted, "bold");

    expect(mounted.view.dom.querySelector("[data-leafdown-source~='link']")).toBeInTheDocument();
    expect(
      mounted.view.dom.querySelector(".leafdown-source-projection__content--link-label"),
    ).toHaveTextContent("a b");
  });

  it("restores the run unchanged when nothing is edited", async () => {
    const mounted = await mountProjectionEditor(WRAPPING_MARK_SOURCE);

    enterProjectionAt(mounted, "bold");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${WRAPPING_MARK_SOURCE}\n`);
  });

  it.each([
    { edited: "**boldX [a b](./doc.md) tail**", target: "bold" },
    { edited: "**bold [a bX](./doc.md) tail**", target: "a b" },
    { edited: "**bold [a b](./doc.md) tailX**", target: "tail" },
  ])("commits an edit to $target as one mark around the link", async ({ edited, target }) => {
    const mounted = await mountProjectionEditor(WRAPPING_MARK_SOURCE);

    enterProjectionAt(mounted, "bold");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, target) + target.length);
    typeText(mounted.view, "X");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${edited}\n`);
    expect(mounted.view.dom.querySelector("strong a")).toHaveTextContent(
      target === "a b" ? "a bX" : "a b",
    );
  });

  it("commits a destination edited through the wrapping run", async () => {
    const mounted = await mountProjectionEditor(WRAPPING_MARK_SOURCE);

    enterProjectionAt(mounted, "bold");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "./doc") + "./doc".length);
    typeText(mounted.view, "-two");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("**bold [a b](./doc-two.md) tail**\n");
    expect(mounted.view.dom.querySelector("strong a")).toHaveAttribute("href", "./doc-two.md");
  });

  it.each([
    { label: "a mark that stops at the link", projected: "**bold**" },
    { label: "the link's own label", projected: "[a b](./doc.md)" },
  ])("leaves $label projecting on its own", async ({ projected }) => {
    const source = "**bold** [a b](./doc.md)";
    const mounted = await mountProjectionEditor(source);

    enterProjectionAt(mounted, projected === "**bold**" ? "bold" : "a b");

    expect(getEditorTextContent(mounted)).toBe(
      projected === "**bold**" ? "**bold** a b" : "bold [a b](./doc.md)",
    );
  });
});
