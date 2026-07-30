import { describe, expect, it, vi } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { BOLD_PLAIN_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import {
  setupMilkdownEditorMount,
  type MountedMilkdownEditor,
  type MountMilkdownEditorOptions,
} from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setSelectionAtElementTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";

import { runEditorCommand } from "../commands";
import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountEditor = setupMilkdownEditorMount();
const MARKDOWN_UPDATE_LISTENER_DEBOUNCE_MS = 300;

interface MountSourceProjectionEditorOptions {
  onContentChanged?: MountMilkdownEditorOptions["onContentChanged"];
  onMarkdownUpdated?: MountMilkdownEditorOptions["onMarkdownUpdated"];
}

const mountProjectionEditor = (
  initialMarkdown: string,
  options: MountSourceProjectionEditorOptions = {},
): Promise<MountedMilkdownEditor> =>
  mountEditor(initialMarkdown, {
    onContentChanged: options.onContentChanged,
    onMarkdownUpdated: options.onMarkdownUpdated,
    rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
  });

const waitForMarkdownUpdateListener = async () => {
  await vi.advanceTimersByTimeAsync(MARKDOWN_UPDATE_LISTENER_DEBOUNCE_MS);
};

const runCommand = async (mounted: MountedMilkdownEditor, commandId: "edit.redo" | "edit.undo") =>
  runEditorCommand(mounted.editor, commandId);

describe("source projection integration", () => {
  describe("native history", () => {
    it("preserves native undo after committing a marker deletion", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart + 1);
      runKeyDownHandlers(mounted.view, "Backspace");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("*Bold* plain\n");

      const emphasis = getEditorDomElement(mounted, "em");

      setSelectionAtElementTextEnd(mounted.view, emphasis);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}\n`);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe("*Bold* plain\n");
    });

    it.each([
      {
        commandId: "format.strong" as const,
        expectedMarkdown: "**Plain paragraph**\n",
        selector: "strong",
      },
      {
        commandId: "format.emphasis" as const,
        expectedMarkdown: "*Plain paragraph*\n",
        selector: "em",
      },
    ])(
      "preserves native undo after applying $commandId to a whole paragraph",
      async ({ commandId, expectedMarkdown, selector }) => {
        const mounted = await mountProjectionEditor("Plain paragraph");

        expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);
        expect(runEditorCommand(mounted.editor, commandId)).toBe(true);

        const formatted = getEditorDomElement(mounted, selector);

        setSelectionAtElementTextEnd(mounted.view, formatted);

        expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
        expect(await runCommand(mounted, "edit.undo")).toBe(true);
        expect(mounted.getMarkdown()).toBe("Plain paragraph\n");
        expect(await runCommand(mounted, "edit.redo")).toBe(true);
        expect(mounted.getMarkdown()).toBe(expectedMarkdown);
        expect(mounted.view.dom.querySelector(selector)).toHaveTextContent("Plain paragraph");
      },
    );

    it("preserves whitespace and native history after partial projected formatting removal", async () => {
      const onContentChanged = vi.fn();
      const mounted = await mountProjectionEditor("**Double asterisk strong**", {
        onContentChanged,
      });

      enterProjection(mounted, "strong");

      const selectionFrom = getEditorTextPosition(mounted, "asterisk");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "asterisk".length);

      expect(runEditorCommand(mounted.editor, "format.strong")).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(getSelectedEditorText(mounted)).toBe("asterisk");
      expect(onContentChanged).toHaveBeenCalledTimes(1);
      expect(mounted.getMarkdown()).toBe("**Double** asterisk **strong**\n");

      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(mounted.getMarkdown()).toBe("**Double asterisk strong**\n");
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe("**Double** asterisk **strong**\n");
    });

    it("preserves native undo and redo after committing a mixed-format link edit", async () => {
      const initialMarkdown = "[**Bold** and *soft*](https://example.com) plain";
      const mounted = await mountProjectionEditor(initialMarkdown);

      enterProjection(mounted, "a");

      const sourceStart = getEditorTextPosition(
        mounted,
        "[**Bold** and *soft*](https://example.com)",
      );

      setTextSelection(mounted.view, sourceStart + "[**Bold".length);
      typeText(mounted.view, "er");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("[**Bolder** and *soft*](https://example.com) plain\n");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(`${initialMarkdown}\n`);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe("[**Bolder** and *soft*](https://example.com) plain\n");
    });
  });

  describe("lifecycle integration", () => {
    it("tracks real source edits as dirty without counting projection entry or commit", async () => {
      const onContentChanged = vi.fn();
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN, { onContentChanged });

      enterProjection(mounted, "strong");

      expect(onContentChanged).not.toHaveBeenCalled();

      typeText(mounted.view, "er");

      expect(onContentChanged).toHaveBeenCalledTimes(2);

      setSelectionAtDocumentEnd(mounted.view);

      expect(onContentChanged).toHaveBeenCalledTimes(2);
    });

    it("finalizes active projected source before Markdown serialization", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");
      typeText(mounted.view, "er");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    });

    it("switches directly to another source projection when the selection moves", async () => {
      const mounted = await mountProjectionEditor("**Bold** and *soft*");

      enterProjection(mounted, "strong");

      const emphasis = getEditorDomElement(mounted, "em");

      setSelectionAtElementTextEnd(mounted.view, emphasis);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("Bold and *soft*");
    });

    it("commits the current projection before switching to another source projection", async () => {
      const mounted = await mountProjectionEditor("**Bold** and *soft*");

      enterProjection(mounted, "strong");
      typeText(mounted.view, "er");

      const emphasis = getEditorDomElement(mounted, "em");

      setSelectionAtElementTextEnd(mounted.view, emphasis);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("Bolder and *soft*");
      expect(mounted.getMarkdown()).toBe("**Bolder** and *soft*\n");
    });

    it("commits a mixed link before switching to a separate mark projection", async () => {
      const mounted = await mountProjectionEditor(
        "[**Bold** and *soft*](https://example.com) and _other_",
      );

      enterProjection(mounted, "a");

      const sourceStart = getEditorTextPosition(
        mounted,
        "[**Bold** and *soft*](https://example.com)",
      );

      setTextSelection(mounted.view, sourceStart + "[**Bold".length);
      typeText(mounted.view, "er");

      const otherEmphasis = getEditorDomElement(mounted, "em");

      setSelectionAtElementTextEnd(mounted.view, otherEmphasis);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("Bolder and soft and _other_");
      expect(mounted.getMarkdown()).toBe(
        "[**Bolder** and *soft*](https://example.com) and _other_\n",
      );
    });

    it("preserves text selections that cross out of an active projection", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");
      const plainEnd = getEditorTextPosition(mounted, "plain") + "plain".length;

      setTextSelection(mounted.view, sourceStart + 2, plainEnd);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.view.state.selection.empty).toBe(false);
      expect(getSelectedEditorText(mounted)).toBe("Bold plain");
    });

    it("does not emit transient projected source through markdown updates", async () => {
      const onMarkdownUpdated = vi.fn();
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN, { onMarkdownUpdated });

      vi.useFakeTimers();

      try {
        enterProjection(mounted, "strong");
        await waitForMarkdownUpdateListener();

        expect(onMarkdownUpdated).not.toHaveBeenCalled();

        typeText(mounted.view, "er");
        await waitForMarkdownUpdateListener();

        expect(onMarkdownUpdated).not.toHaveBeenCalled();

        setSelectionAtDocumentEnd(mounted.view);
        await waitForMarkdownUpdateListener();

        expect(onMarkdownUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ markdown: "**Bolder** plain\n" }),
        );
        expect(onMarkdownUpdated).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("serializes one logical mixed link after finalizing active projected source", async () => {
      const onContentChanged = vi.fn();
      const mounted = await mountProjectionEditor(
        "[**Bold** and *soft*](https://example.com) plain",
        { onContentChanged },
      );

      enterProjection(mounted, "a");

      expect(onContentChanged).not.toHaveBeenCalled();

      const sourceStart = getEditorTextPosition(
        mounted,
        "[**Bold** and *soft*](https://example.com)",
      );

      setTextSelection(mounted.view, sourceStart + "[**Bold".length);
      typeText(mounted.view, "er");

      expect(onContentChanged).toHaveBeenCalledTimes(2);
      expect(mounted.getMarkdown()).toBe("[**Bolder** and *soft*](https://example.com) plain\n");
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(onContentChanged).toHaveBeenCalledTimes(2);
    });
  });

  describe("projection history", () => {
    it("uses projection-local undo and redo while projection is active", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");
      typeText(mounted.view, "er");

      expect(getEditorTextContent(mounted)).toBe("**Bolder** plain");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Bolde** plain");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Bolde** plain");
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Bolder** plain");
    });

    it("finalizes a clean active projection before running native undo and redo", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      setSelectionAtDocumentEnd(mounted.view);
      typeText(mounted.view, "!");
      enterProjection(mounted, "strong");

      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}\n`);

      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}!\n`);
    });

    it("preserves native undo and redo after projection commit", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");
      typeText(mounted.view, "er");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}\n`);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
    });

    it("preserves local and native history for padded inline-code source", async () => {
      const initialMarkdown = "`` pnpm run `preview` `` plain";
      const mounted = await mountProjectionEditor(initialMarkdown);

      enterProjection(mounted, "code");

      const sourceStart = getEditorTextPosition(mounted, "`` pnpm run `preview` ``");
      setTextSelection(mounted.view, sourceStart + 3 + "pnpm run `preview`".length);
      typeText(mounted.view, "!");

      expect(getEditorTextContent(mounted)).toBe("``pnpm run `preview`!`` plain");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(initialMarkdown);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("``pnpm run `preview`!`` plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("``pnpm run `preview`!`` plain\n");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(`${initialMarkdown}\n`);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe("``pnpm run `preview`!`` plain\n");
    });

    it("uses projection-local undo and redo for mixed-format link source", async () => {
      const mounted = await mountProjectionEditor(
        "[**Bold** and *soft*](https://example.com) plain",
      );

      enterProjection(mounted, "a");

      const sourceStart = getEditorTextPosition(
        mounted,
        "[**Bold** and *soft*](https://example.com)",
      );

      setTextSelection(mounted.view, sourceStart + "[**Bold".length);
      typeText(mounted.view, "er");

      expect(getEditorTextContent(mounted)).toBe(
        "[**Bolder** and *soft*](https://example.com) plain",
      );
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(
        "[**Bolde** and *soft*](https://example.com) plain",
      );
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(
        "[**Bold** and *soft*](https://example.com) plain",
      );
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(
        "[**Bolder** and *soft*](https://example.com) plain",
      );
    });
  });
});
