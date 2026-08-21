import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  runKeyDownHandlers,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const getLinkTargets = (mounted: MountedMilkdownEditor) =>
  Array.from(mounted.view.dom.querySelectorAll("a"), (link) => link.getAttribute("href"));

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

    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual(["b"]);
    expect(mounted.getMarkdown()).toBe("See [a](b) here.\n");
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
