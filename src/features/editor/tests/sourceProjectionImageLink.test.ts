// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";

import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  containsNodeType,
  flushEditorDomObserver,
  getEditorDomTextNode,
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  getMarkNames,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  ...createMarkdownReferenceContext(),
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});
const IMAGE_LINK_SOURCE = "[![alt](./pic.png)](./doc.md)";
const MIXED_IMAGE_LINK_SOURCE = "[word ![alt](./pic.png)](./doc.md)";

const getLabelPresentation = (mounted: MountedMilkdownEditor) =>
  Array.from(
    mounted.view.dom.querySelectorAll(".leafdown-source-projection__content--link-label"),
    (fragment) => fragment.textContent,
  ).join("");

const getLinkedImage = (mounted: MountedMilkdownEditor) =>
  mounted.view.state.doc.nodeAt(getEditorNodePosition(mounted, "image"));

describe("image link label source projection", () => {
  beforeEach(() => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));
  });

  it.each([
    { offset: 0, side: "before" },
    { offset: 1, side: "after" },
  ])("projects an image label from the caret $side the image", async ({ offset }) => {
    const mounted = await mountProjectionEditor(`${IMAGE_LINK_SOURCE} tail`);

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "image") + offset);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`${IMAGE_LINK_SOURCE} tail`);
    expect(containsNodeType(mounted, "image")).toBe(false);
    expect(getLabelPresentation(mounted)).toBe("![alt](./pic.png)");

    const sourceStart = getEditorTextPosition(mounted, IMAGE_LINK_SOURCE);
    const expectedOffset = offset === 0 ? "[".length : "[![alt](./pic.png)".length;

    expect(mounted.view.state.selection.anchor).toBe(sourceStart + expectedOffset);
  });

  it("projects a label mixing text and an image", async () => {
    const mounted = await mountProjectionEditor(`${MIXED_IMAGE_LINK_SOURCE} tail`);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "word") + "word".length);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`${MIXED_IMAGE_LINK_SOURCE} tail`);
    expect(containsNodeType(mounted, "image")).toBe(false);
    expect(getLabelPresentation(mounted)).toBe("word ![alt](./pic.png)");
  });

  it("projects a label mixing formatted text and an image", async () => {
    const source = "[**bold** ![alt](./pic.png)](./doc.md)";
    const mounted = await mountProjectionEditor(`${source} tail`);

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "image"));

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`${source} tail`);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, source) + "[**bold".length);
    typeText(mounted.view, "er");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${source.replace("bold", "bolder")} tail\n`);
    expect(getLinkedImage(mounted)?.attrs.src).toBe("./pic.png");
  });

  it("commits a label holding both a soft break and an image", async () => {
    const source = "[first\n![alt](./pic.png)](./doc.md)";
    const mounted = await mountProjectionEditor(`${source} tail`);

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "image"));
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "first") + "first".length);
    typeText(mounted.view, "!");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${source.replace("first", "first!")} tail\n`);
    expect(getEditorNodePosition(mounted, "hardbreak")).toBeGreaterThan(0);
    expect(getLinkedImage(mounted)?.attrs.src).toBe("./pic.png");
  });

  it("restores a label holding two adjacent images", async () => {
    const source = "[![a](./1.png)![b](./2.png)](./doc.md)";
    const mounted = await mountProjectionEditor(`${source} tail`);
    const originalDocument = mounted.view.state.doc;

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "image"));

    expect(getEditorTextContent(mounted)).toBe(`${source} tail`);

    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
  });

  it("keeps the image when the browser rewrites the projected label", async () => {
    const source = "[word ![alt](./pic.png)](./doc.md)";
    const mounted = await mountProjectionEditor(`${source} tail`);

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "image"));

    getEditorDomTextNode(mounted, "word").data = "wordX";
    flushEditorDomObserver(mounted.view);
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${source.replace("word ", "wordX")} tail\n`);
    expect(getLinkedImage(mounted)?.attrs.src).toBe("./pic.png");
  });

  it("restores the exact original document after a clean projection", async () => {
    const mounted = await mountProjectionEditor(`${MIXED_IMAGE_LINK_SOURCE} tail`);
    const originalDocument = mounted.view.state.doc;

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "image"));

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

    setSelectionAtDocumentEnd(mounted.view);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
  });

  // An image in a projected label becomes its own Markdown source, and an image carries the
  // description the file holds rather than the text that description spells.
  it("projects the description a linked image was written with", async () => {
    const source = "[![alt with *emphasis*](./pic.png)](./doc.md)";
    const mounted = await mountProjectionEditor(`${source} tail`);
    const originalDocument = mounted.view.state.doc;

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "image"));

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`${source} tail`);

    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
    expect(mounted.getMarkdown()).toBe(`${source} tail\n`);
  });

  it.each([
    {
      committed: "[![altered](./pic.png)](./doc.md) tail\n",
      edit: "ered",
      editOffset: "[![alt".length,
      label: "image",
      source: IMAGE_LINK_SOURCE,
    },
    {
      committed: "[words ![alt](./pic.png)](./doc.md) tail\n",
      edit: "s",
      editOffset: "[word".length,
      label: "mixed",
      source: MIXED_IMAGE_LINK_SOURCE,
    },
  ])(
    "commits an edited $label label as one link keeping the image",
    async ({ committed, edit, editOffset, source }) => {
      const mounted = await mountProjectionEditor(`${source} tail`);

      setTextSelection(mounted.view, getEditorNodePosition(mounted, "image"));
      setTextSelection(mounted.view, getEditorTextPosition(mounted, source) + editOffset);
      typeText(mounted.view, edit);
      setSelectionAtDocumentEnd(mounted.view);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.getMarkdown()).toBe(committed);

      const image = getLinkedImage(mounted);

      expect(image?.attrs.src).toBe("./pic.png");
      expect(getMarkNames(image!)).toEqual(["link"]);
      expect(image?.marks[0].attrs.href).toBe("./doc.md");
    },
  );

  it("commits a label that stops being a link as literal text", async () => {
    const mounted = await mountProjectionEditor(`${IMAGE_LINK_SOURCE} tail`);

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "image"));
    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, IMAGE_LINK_SOURCE) + IMAGE_LINK_SOURCE.length,
    );
    runKeyDownHandlers(mounted.view, "Backspace");
    setSelectionAtDocumentEnd(mounted.view);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(containsNodeType(mounted, "image")).toBe(false);
    expect(getEditorTextContent(mounted)).toBe(`${IMAGE_LINK_SOURCE.slice(0, -1)} tail`);
  });
});
