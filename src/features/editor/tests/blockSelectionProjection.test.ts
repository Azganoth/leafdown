// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { BOLD_PLAIN_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { typeText } from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";

import { runEditorCommand } from "../commands";
import {
  BlockSelection,
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
} from "../plugins/blockSelection";
import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountEditor = setupMilkdownEditorMount();
const MARKDOWN = `${BOLD_PLAIN_MARKDOWN}\n\nSecond`;

const selectEveryRootBlock = (mounted: Awaited<ReturnType<typeof mountEditor>>) => {
  const targets = getSelectableBlockTargets(mounted.view.state.doc);
  const selection = createHierarchicalBlockSelection(
    mounted.view.state.doc,
    targets[0].pos,
    targets.at(-1)?.pos ?? targets[0].pos,
  );
  mounted.view.dispatch(mounted.view.state.tr.setSelection(selection));
};

describe("block selection source projection integration", () => {
  it("restores clean source exactly before entering block selection", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(MARKDOWN, { onContentChanged });

    enterProjection(mounted, "strong");
    selectEveryRootBlock(mounted);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);
    expect((mounted.view.state.selection as BlockSelection).content().content.childCount).toBe(2);
    expect(mounted.getMarkdown()).toBe(`${MARKDOWN}\n`);
    expect(onContentChanged).not.toHaveBeenCalled();
  });

  it("commits edited source once and preserves block selection through native history", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(MARKDOWN, { onContentChanged });

    enterProjection(mounted, "strong");
    typeText(mounted.view, "er");
    const dirtyChangeCount = onContentChanged.mock.calls.length;
    selectEveryRootBlock(mounted);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);
    expect(mounted.getMarkdown()).toBe(`**Bolder** plain\n\nSecond\n`);
    expect(onContentChanged).toHaveBeenCalledTimes(dirtyChangeCount);

    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(`${MARKDOWN}\n`);
    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);

    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(`**Bolder** plain\n\nSecond\n`);
    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);
  });
});
