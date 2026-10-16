// @vitest-environment happy-dom

import { undoDepth } from "@milkdown/kit/prose/history";
import { describe, expect, it } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorTextPosition } from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";
import { getMilkdownEditorSettledMarkdown } from "../utils/createMilkdownEditor";

const mount = setupMilkdownEditorMount(createMarkdownReferenceContext());

describe("settled Markdown", () => {
  it("reads what a save would write while leaving the edit in progress open", async () => {
    const mounted = await mount("Start [label](https://old.example) more\n\nend");

    enterProjection(mounted, "a");
    const oldPosition = getEditorTextPosition(mounted, "old");
    mounted.view.dispatch(mounted.view.state.tr.insertText("new", oldPosition, oldPosition + 3));

    const stateBefore = mounted.view.state;
    const historyBefore = undoDepth(stateBefore);
    const settled = getMilkdownEditorSettledMarkdown(mounted.editor);

    expect(mounted.view.state).toBe(stateBefore);
    expect(undoDepth(mounted.view.state)).toBe(historyBefore);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(settled).toBe("Start [label](https://new.example) more\n\nend\n");
    expect(mounted.getMarkdown()).toBe(settled);
  });
});
