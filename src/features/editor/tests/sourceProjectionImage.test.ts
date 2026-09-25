// @vitest-environment happy-dom

import { NodeSelection } from "@milkdown/kit/prose/state";
import { beforeEach, describe, expect, it } from "vitest";

import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { dispatchMouseDown } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  containsNodeType,
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { waitFor, within } from "@/test/utils/react";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import {
  hasActiveSourceProjection,
  getSourceProjectionClipboardSlice,
  redoSourceProjection,
  SOURCE_PROJECTION_IMAGE_POINTER_ENTRY_META,
  undoSourceProjection,
} from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  ...createMarkdownReferenceContext(),
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const selectImage = (mounted: Awaited<ReturnType<typeof mountProjectionEditor>>) => {
  const position = getEditorNodePosition(mounted, "image");

  mounted.view.dispatch(
    mounted.view.state.tr
      .setSelection(NodeSelection.create(mounted.view.state.doc, position))
      .setMeta(SOURCE_PROJECTION_IMAGE_POINTER_ENTRY_META, true),
  );
};

describe("standalone image source projection", () => {
  beforeEach(() => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));
  });

  it("styles description, destination, and title as content in the source lane", async () => {
    const mounted = await mountProjectionEditor('![alt](<two words> "title") tail');

    selectImage(mounted);

    expect(
      Array.from(
        mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker"),
        (fragment) => fragment.textContent,
      ).join(""),
    ).toBe('![](<two words> "")');
    expect(
      Array.from(
        mounted.view.dom.querySelectorAll(".leafdown-source-projection__content"),
        (fragment) => fragment.textContent,
      ).join(""),
    ).toBe("alttitle");
  });

  it.each([
    { offset: 0, side: "left" },
    { offset: 1, side: "right" },
  ])("enters at the source's $side edge from that side of the image", async ({ offset }) => {
    const source = "![alt](./pic.png)";
    const mounted = await mountProjectionEditor(`${source} tail`);
    const imagePosition = getEditorNodePosition(mounted, "image");

    setTextSelection(mounted.view, imagePosition + offset);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`${source} tail`);
    expect(mounted.view.state.selection.anchor).toBe(
      imagePosition + (offset === 0 ? 0 : source.length),
    );
  });

  it.each([
    { entryPosition: "after" as const, expectedOffset: 0, key: "ArrowDown", side: "before" },
    {
      entryPosition: "before" as const,
      expectedOffset: "end" as const,
      key: "ArrowUp",
      side: "after",
    },
  ])(
    "uses keyboard direction when entering from the block $side the image",
    async ({ entryPosition, expectedOffset, key }) => {
      const source = "![alt](./pic.png)";
      const mounted = await mountProjectionEditor(`before\n\n${source}\n\nafter`);
      const imagePosition = getEditorNodePosition(mounted, "image");
      const adjacentText = entryPosition === "after" ? "before" : "after";
      const adjacentPosition = getEditorTextPosition(mounted, adjacentText);

      setTextSelection(
        mounted.view,
        entryPosition === "after" ? adjacentPosition + adjacentText.length : adjacentPosition,
      );
      runKeyDownHandlers(mounted.view, key);
      setTextSelection(mounted.view, imagePosition + (entryPosition === "after" ? 1 : 0));

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(mounted.view.state.selection.head).toBe(
        imagePosition + (expectedOffset === "end" ? source.length : expectedOffset),
      );
    },
  );

  it("places the caret at the start of the alt text when the rendered image was selected", async () => {
    const source = "![alt](./pic.png)";
    const mounted = await mountProjectionEditor(`${source} tail`);
    const imagePosition = getEditorNodePosition(mounted, "image");

    selectImage(mounted);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.view.state.selection.empty).toBe(true);
    expect(mounted.view.state.selection.head).toBe(imagePosition + 2);
  });

  it("enters source projection when the rendered image is clicked", async () => {
    const source = "![alt](./pic.png)";
    const mounted = await mountProjectionEditor(source);
    const imagePosition = getEditorNodePosition(mounted, "image");

    await waitFor(() => {
      expect(within(mounted.view.dom).getByRole("img", { name: "alt" })).toBeInTheDocument();
    });

    const image = within(mounted.view.dom).getByRole("img", { name: "alt" });

    dispatchMouseDown(image);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(source);
    expect(mounted.view.state.selection.empty).toBe(true);
    expect(mounted.view.state.selection.head).toBe(imagePosition + 2);

    setTextSelection(mounted.view, imagePosition + source.length);
    dispatchMouseDown(image);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.view.state.selection.head).toBe(imagePosition + 2);
  });

  it.each([
    { entryOffset: 0, exitOffset: -1, side: "before" },
    { entryOffset: 1, exitOffset: 1, side: "after" },
  ])(
    "returns to the editor surface when the caret moves $side the source",
    async ({ entryOffset, exitOffset }) => {
      const source = "![alt](./pic.png)";
      const mounted = await mountProjectionEditor(`lead ${source} tail`);
      const imagePosition = getEditorNodePosition(mounted, "image");

      setTextSelection(mounted.view, imagePosition + entryOffset);

      const projectedBoundary = imagePosition + (entryOffset === 0 ? 0 : source.length);

      setTextSelection(mounted.view, projectedBoundary + exitOffset);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(containsNodeType(mounted, "image")).toBe(true);
    },
  );

  it.each([
    { boundary: "start", expectedOffset: 0, key: "ArrowLeft" },
    { boundary: "end", expectedOffset: 1, key: "ArrowRight" },
  ])(
    "leaves the retained image projection at its $boundary boundary",
    async ({ boundary, expectedOffset, key }) => {
      const source = "![alt](./pic.png)";
      const mounted = await mountProjectionEditor(`lead ${source} tail`);
      const imagePosition = getEditorNodePosition(mounted, "image");

      setTextSelection(mounted.view, imagePosition);
      setTextSelection(mounted.view, imagePosition + (boundary === "start" ? 0 : source.length));

      expect(runKeyDownHandlers(mounted.view, key).handled).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.view.state.selection.head).toBe(imagePosition + expectedOffset);
    },
  );

  it("keeps the decoded image mounted after the source line while projection is active", async () => {
    const source = "![alt](./pic.png)";
    const mounted = await mountProjectionEditor(`${source} tail`);

    await waitFor(() => {
      expect(within(mounted.view.dom).getByRole("img", { name: "alt" })).toBeInTheDocument();
    });

    const imageView = mounted.view.dom.querySelector<HTMLElement>(".leafdown-image-view");

    if (!imageView) {
      throw new Error("Expected the rendered image view.");
    }

    const renderedImage = within(imageView).getByRole("img", { name: "alt" });

    selectImage(mounted);

    const projection = mounted.view.dom.querySelector<HTMLElement>(
      '.leafdown-source-projection[data-leafdown-source~="image"]',
    );

    expect(projection).not.toBeNull();
    expect(
      projection!.compareDocumentPosition(imageView) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(within(imageView).getByRole("img", { name: "alt" })).toBe(renderedImage);
    expect(within(mounted.view.dom).queryByRole("button", { name: /image/iu })).toBeNull();
    expect(getEditorTextContent(mounted)).toBe(`${source} tail`);

    setSelectionAtDocumentEnd(mounted.view);

    expect(within(mounted.view.dom).getByRole("img", { name: "alt" })).toBe(renderedImage);
  });

  it("keeps an unavailable image placeholder mounted beside the source line", async () => {
    mockTauriApiCommand("resolveMarkdownImageTarget", () => ({
      kind: "missing",
      path: "C:/Notes/missing.png",
    }));
    const mounted = await mountProjectionEditor("![missing](./missing.png)");

    await waitFor(() => {
      expect(mounted.view.dom).toHaveTextContent("Image not found.");
    });

    selectImage(mounted);

    const projectionFragments = mounted.view.dom.querySelectorAll<HTMLElement>(
      '.leafdown-source-projection[data-leafdown-source~="image"]',
    );
    const imageView = mounted.view.dom.querySelector<HTMLElement>(".leafdown-image-view");

    expect(projectionFragments.length).toBeGreaterThan(0);
    expect(imageView).not.toBeNull();
    expect(projectionFragments[projectionFragments.length - 1].nextElementSibling).toBe(imageView);
    expect(imageView).toHaveTextContent("Image not found.");
    expect(imageView).not.toHaveTextContent("./missing.png");
  });

  it.each([
    "![inline](<../assets/leaf.svg>)",
    "![alt with *emphasis*](<../assets/leaf icon.svg> 'Leaf')",
    "[leaf]: ../assets/leaf.svg 'Leaf'\n\n![Reference leaf][leaf]",
  ])("restores %j exactly after a clean projection", async (source) => {
    const mounted = await mountProjectionEditor(`${source}\n\ntail`);
    const originalDocument = mounted.view.state.doc;

    selectImage(mounted);
    setSelectionAtDocumentEnd(mounted.view);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
    expect(mounted.getMarkdown()).toBe(`${source}\n\ntail\n`);
  });

  it("rehydrates a valid edit through the Milkdown parser", async () => {
    const source = "![alt](./pic.png)";
    const mounted = await mountProjectionEditor(`${source} tail`);
    const imagePosition = getEditorNodePosition(mounted, "image");

    setTextSelection(mounted.view, imagePosition);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, source) + "![alt".length);
    typeText(mounted.view, "er");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("![alter](./pic.png) tail\n");
    expect(containsNodeType(mounted, "image")).toBe(true);
  });

  it("commits an incomplete edit as the literal source it spells", async () => {
    const source = "![alt](./pic.png)";
    const mounted = await mountProjectionEditor(source);
    const imagePosition = getEditorNodePosition(mounted, "image");

    setTextSelection(mounted.view, imagePosition);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, source) + source.length);
    runKeyDownHandlers(mounted.view, "Backspace");
    setSelectionAtDocumentEnd(mounted.view);

    expect(containsNodeType(mounted, "image")).toBe(false);
    expect(getEditorTextContent(mounted)).toBe(source.slice(0, -1));
    expect(mounted.getMarkdown()).toBe("![alt](./pic.png\n");
  });

  it("uses projection-local Undo and Redo for source edits", async () => {
    const source = "![alt](./pic.png)";
    const mounted = await mountProjectionEditor(source);
    const imagePosition = getEditorNodePosition(mounted, "image");

    setTextSelection(mounted.view, imagePosition);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, source) + "![alt".length);
    typeText(mounted.view, "r");

    expect(undoSourceProjection(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(source);
    expect(redoSourceProjection(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("![altr](./pic.png)");
  });

  it("copies the complete image semantically and keeps partial source literal", async () => {
    const source = "![alt](./pic.png)";
    const mounted = await mountProjectionEditor(source);

    selectImage(mounted);

    const sourceFrom = getEditorTextPosition(mounted, source);

    setTextSelection(mounted.view, sourceFrom, sourceFrom + source.length);

    const complete = getSourceProjectionClipboardSlice(mounted.view.state);

    expect(complete).not.toBeNull();
    expect(containsNodeType(complete!.content, "image")).toBe(true);

    setTextSelection(mounted.view, sourceFrom + "![a".length, sourceFrom + "![alt](./pic".length);

    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();
  });

  it("projects a marked image through its owning marked fragment", async () => {
    const source = "**![alt](./pic.png)**";
    const mounted = await mountProjectionEditor(`${source} tail`);

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "image"));

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`${source} tail`);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, source) + "**![alt".length);
    typeText(mounted.view, "er");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("**![alter](./pic.png)** tail\n");
  });
});
