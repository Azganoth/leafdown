// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  containsNodeType,
  getEditorTextContent,
  runKeyDownHandlers,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import {
  hasActiveSourceProjection,
  leafdownSourceProjectionPluginKey,
} from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const getLinkTargets = (mounted: MountedMilkdownEditor) =>
  Array.from(mounted.view.dom.querySelectorAll("a"), (link) => link.getAttribute("href"));

const getProjectionAdapterId = (mounted: MountedMilkdownEditor) =>
  leafdownSourceProjectionPluginKey.getState(mounted.view.state)?.session?.adapter.id ?? null;

const getMarkerTexts = (mounted: MountedMilkdownEditor) =>
  Array.from(
    mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker"),
    (node) => node.textContent,
  );

const pressBackspace = (mounted: MountedMilkdownEditor) => {
  runKeyDownHandlers(mounted.view, "Backspace");
};

describe("escaped source projection", () => {
  it("projects the escape the file holds when the caret arrives", async () => {
    const mounted = await mountProjectionEditor(String.raw`See \[a](b) here.`);

    expect(getEditorTextContent(mounted)).toBe("See [a](b) here.");

    setTextSelection(mounted.view, 7);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(String.raw`See \[a](b) here.`);
  });

  it("restores the run when the caret leaves the escape alone", async () => {
    const mounted = await mountProjectionEditor(String.raw`See \[a](b) here.`);

    setTextSelection(mounted.view, 7);
    setTextSelection(mounted.view, 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe("See [a](b) here.");
    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe(String.raw`See \[a](b) here.` + "\n");
  });

  it("converts the run when the backslash is deleted", async () => {
    const mounted = await mountProjectionEditor(String.raw`See \[a](b) here.`);

    setTextSelection(mounted.view, 7);
    setTextSelection(mounted.view, 6);
    pressBackspace(mounted);

    expect(getEditorTextContent(mounted)).toBe("See [a](b) here.");
    expect(getProjectionAdapterId(mounted)).toBe("link");
    expect(mounted.getMarkdown()).toBe("See [a](b) here.\n");

    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual(["b"]);
    expect(mounted.getMarkdown()).toBe("See [a](b) here.\n");
  });

  it("offers the gesture again on a run an edit turned literal", async () => {
    const mounted = await mountProjectionEditor("See [a](b) here.");

    setTextSelection(mounted.view, 6);
    typeText(mounted.view, "\\");

    expect(getMarkerTexts(mounted)).toEqual(["\\"]);

    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(getEditorTextContent(mounted)).toBe("See [a](b) here.");

    setTextSelection(mounted.view, 7);

    expect(getProjectionAdapterId(mounted)).toBe("escape");
    expect(getEditorTextContent(mounted)).toBe(String.raw`See \[a](b) here.`);
  });

  it("converts an escaped image run when the backslash is deleted", async () => {
    const mounted = await mountProjectionEditor(String.raw`See !\[alt](x.png) here.`);

    expect(getEditorTextContent(mounted)).toBe("See ![alt](x.png) here.");

    setTextSelection(mounted.view, 8);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(String.raw`See !\[alt](x.png) here.`);

    setTextSelection(mounted.view, 7);
    pressBackspace(mounted);
    setTextSelection(mounted.view, 1);

    expect(containsNodeType(mounted, "image")).toBe(true);
    expect(mounted.getMarkdown()).toBe("See ![alt](x.png) here.\n");
  });

  it("reverses the conversion with Undo", async () => {
    const mounted = await mountProjectionEditor(String.raw`See \[a](b) here.`);

    setTextSelection(mounted.view, 7);
    setTextSelection(mounted.view, 6);
    pressBackspace(mounted);
    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual(["b"]);

    await runEditorCommand(mounted.editor, "edit.undo");
    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe(String.raw`See \[a](b) here.` + "\n");
  });

  it("turns a converted run literal again when a backslash is typed back", async () => {
    const mounted = await mountProjectionEditor(String.raw`See \[a](b) here.`);

    setTextSelection(mounted.view, 7);
    setTextSelection(mounted.view, 6);
    pressBackspace(mounted);
    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual(["b"]);

    setTextSelection(mounted.view, 6);
    typeText(mounted.view, "\\");
    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe(String.raw`See \[a](b) here.` + "\n");
  });

  it("marks the projected backslash rather than the run it escapes", async () => {
    const mounted = await mountProjectionEditor(String.raw`See \[a](b) here.`);

    setTextSelection(mounted.view, 7);

    expect(getMarkerTexts(mounted)).toEqual(["\\"]);
  });

  it("leaves a run this session typed to the caret-leave commit", async () => {
    const mounted = await mountProjectionEditor("start");

    setTextSelection(mounted.view, 6);
    typeText(mounted.view, " [a](b)");

    expect(getEditorTextContent(mounted)).toBe("start [a](b)");

    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual(["b"]);
  });
});
