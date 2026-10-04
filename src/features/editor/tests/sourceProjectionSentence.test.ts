// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  getEditorTextContent,
  getSelectedEditorText,
  setSelectionAtDocumentEnd,
  setTextSelection,
} from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";

import { runEditorCommand } from "../commands";
import { deleteSentence } from "../commands/editing/deletion";
import { selectSentence } from "../commands/editing/selection";
import {
  canUndoSourceProjection,
  getActiveSourceProjectionRange,
  hasActiveSourceProjection,
} from "../plugins/sourceProjection";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const STRONG_MARKDOWN = "Lead. **One. Two.** tail.";

const getProjection = (mounted: MountedMilkdownEditor) => {
  const range = getActiveSourceProjectionRange(mounted.view.state);

  if (!range) {
    throw new Error("Expected an active source projection.");
  }

  return { ...range, source: mounted.view.state.doc.textBetween(range.from, range.to) };
};

const finalizeByLeaving = (mounted: MountedMilkdownEditor) => {
  setSelectionAtDocumentEnd(mounted.view);

  expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
};

describe("sentence commands in source projection", () => {
  it("selects only within the projected source", async () => {
    const mounted = await mountEditor(STRONG_MARKDOWN);

    enterProjection(mounted, "strong");
    const projection = getProjection(mounted);

    expect(projection.source).toBe("**One. Two.**");

    setTextSelection(mounted.view, projection.from);
    expect(selectSentence(mounted.view)).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("**One. ");

    // Delimiters are projected text, and Unicode ends the sentence before the closing `**`.
    setTextSelection(mounted.view, projection.to);
    expect(selectSentence(mounted.view)).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("**");

    setTextSelection(mounted.view, projection.from + 1, projection.to - 1);
    expect(selectSentence(mounted.view)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(projection.from);
    expect(mounted.view.state.selection.to).toBe(projection.to);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(canUndoSourceProjection(mounted.view.state)).toBe(false);
  });

  it("deletes with projection-local history and rehydrates a valid edit", async () => {
    const mounted = await mountEditor("Lead. **One. Two. Three.** tail.");

    enterProjection(mounted, "strong");
    const projection = getProjection(mounted);

    expect(projection.source).toBe("**One. Two. Three.**");

    setTextSelection(mounted.view, projection.from + "**One. Tw".length);
    expect(deleteSentence(mounted.view)).toBe(true);
    expect(getProjection(mounted).source).toBe("**One. Three.**");

    await runEditorCommand(mounted.editor, "edit.undo");
    expect(getProjection(mounted).source).toBe("**One. Two. Three.**");

    await runEditorCommand(mounted.editor, "edit.redo");
    expect(getProjection(mounted).source).toBe("**One. Three.**");

    finalizeByLeaving(mounted);
    const markdown = mounted.getMarkdown();
    const reopened = await mountEditor(markdown);

    expect(markdown).toBe("Lead. **One. Three.** tail.\n");
    expect(reopened.getMarkdown()).toBe(markdown);
  });

  it("commits an invalid edit as literal text without losing source", async () => {
    const mounted = await mountEditor(STRONG_MARKDOWN);

    enterProjection(mounted, "strong");
    const projection = getProjection(mounted);

    setTextSelection(mounted.view, projection.to);
    expect(deleteSentence(mounted.view)).toBe(true);
    expect(getProjection(mounted).source).toBe("**One. Two.");

    finalizeByLeaving(mounted);
    expect(getEditorTextContent(mounted)).toBe("Lead. **One. Two. tail.");

    const markdown = mounted.getMarkdown();
    const reopened = await mountEditor(markdown);

    expect(getEditorTextContent(reopened)).toBe("Lead. **One. Two. tail.");
    expect(reopened.getMarkdown()).toBe(markdown);
  });

  it("leaves the text around a projected link untouched", async () => {
    const mounted = await mountEditor("Lead. Some [a link. Here](https://x.test) end.");

    enterProjection(mounted, "a");
    const projection = getProjection(mounted);

    expect(projection.source).toBe("[a link. Here](https://x.test)");

    setTextSelection(mounted.view, projection.from + 3);
    expect(deleteSentence(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted).startsWith("Lead. Some ")).toBe(true);
    expect(getProjection(mounted).source).toBe("Here](https://x.test)");
  });

  it("does not reach from a math source into its preview or neighbours", async () => {
    const mounted = await mountEditor("Before. $A. B$ After.");

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "math_inline") + 1);
    const projection = getProjection(mounted);

    expect(projection.source).toBe("$A. B$");
    expect(mounted.view.state.selection.head).toBe(projection.to);

    expect(selectSentence(mounted.view)).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("B$");

    setTextSelection(mounted.view, projection.from, projection.to);
    expect(selectSentence(mounted.view)).toBe(false);
  });
});
