import { afterEach, describe, expect, it, vi } from "vitest";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { setSelectionAtDocumentEnd, typeText } from "@/test/utils/prosemirror";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (
  initialMarkdown: string,
  onContentTransaction = vi.fn(),
): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, { onContentTransaction });
  mountedEditors.push(mounted);
  return mounted;
};

describe("Leafdown dirty tracker plugin", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("does not mark the document dirty when initial Markdown is mounted", async () => {
    const onContentTransaction = vi.fn();

    await mountEditor("# Notes", onContentTransaction);

    expect(onContentTransaction).not.toHaveBeenCalled();
  });

  it("marks the document dirty after a document-changing history transaction", async () => {
    const onContentTransaction = vi.fn();
    const mounted = await mountEditor("Hello", onContentTransaction);

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "!");

    expect(onContentTransaction).toHaveBeenCalledTimes(1);
  });

  it("ignores programmatic document transactions outside editor history", async () => {
    const onContentTransaction = vi.fn();
    const mounted = await mountEditor("Hello", onContentTransaction);
    setSelectionAtDocumentEnd(mounted.view);
    const transaction = mounted.view.state.tr
      .insertText("!", mounted.view.state.selection.from)
      .setMeta("addToHistory", false);

    mounted.view.dispatch(transaction);

    expect(onContentTransaction).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toBe("Hello!\n");
  });
});
