// @vitest-environment happy-dom

import { NodeSelection } from "@milkdown/kit/prose/state";
import { open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
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
import { setupUser, waitFor, within } from "@/test/utils/react";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import {
  hasActiveSourceProjection,
  getSourceProjectionClipboardSlice,
  redoSourceProjection,
  undoSourceProjection,
} from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  ...createMarkdownReferenceContext(),
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const selectImage = (mounted: Awaited<ReturnType<typeof mountProjectionEditor>>) => {
  const position = getEditorNodePosition(mounted, "image");

  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, position)),
  );
};

describe("standalone image source projection", () => {
  beforeEach(() => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));
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

  it("selects the complete source when the rendered image was selected", async () => {
    const source = "![alt](./pic.png)";
    const mounted = await mountProjectionEditor(`${source} tail`);

    selectImage(mounted);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(
      mounted.view.state.doc.textBetween(
        mounted.view.state.selection.from,
        mounted.view.state.selection.to,
      ),
    ).toBe(source);
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

    const complete = getSourceProjectionClipboardSlice(mounted.view.state);

    expect(complete).not.toBeNull();
    expect(containsNodeType(complete!.content, "image")).toBe(true);

    const sourceFrom = getEditorTextPosition(mounted, source);

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

  it("chooses a relative image target without leaving projection", async () => {
    const user = setupUser();
    const source = "![alt](./pic.png 'Leaf')";
    const mounted = await mountProjectionEditor(source);
    const imagePosition = getEditorNodePosition(mounted, "image");

    vi.mocked(open).mockResolvedValue("C:/Notes/assets/new leaf.png");
    setTextSelection(mounted.view, imagePosition);

    const button = within(mounted.view.dom).getByRole("button", { name: "Choose image" });

    await user.click(button);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("![alt](<assets/new leaf.png> 'Leaf')");
    expect(open).toHaveBeenCalledWith({
      directory: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp"] }],
      multiple: false,
      title: "Choose image",
    });

    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("![alt](<assets/new leaf.png> 'Leaf')\n");
  });

  it("routes a picked outside-folder target through the existing resolver policy", async () => {
    const user = setupUser();
    const mounted = await mountProjectionEditor("![alt](./pic.png)");
    const imagePosition = getEditorNodePosition(mounted, "image");

    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target, allowOutsideFolder }) => ({
      kind: target === "../Other/new.png" && !allowOutsideFolder ? "outsideFolder" : "renderable",
      path: "C:/Other/new.png",
    }));
    vi.mocked(open).mockResolvedValue("C:/Other/new.png");
    setTextSelection(mounted.view, imagePosition);
    await user.click(within(mounted.view.dom).getByRole("button", { name: "Choose image" }));
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("![alt](../Other/new.png)\n");
    await waitFor(() => {
      expect(mounted.view.dom).toHaveTextContent("Image is outside the current folder");
    });
  });
});
