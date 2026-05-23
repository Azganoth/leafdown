import { afterEach, describe, expect, it } from "vitest";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown);
  mountedEditors.push(mounted);
  return mounted;
};

describe("createMilkdownEditor", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("mounts and serializes through the Leafdown Milkdown factory", async () => {
    const mounted = await mountEditor("# Notes\n\nParagraph");

    expect(mounted.view.dom).toHaveClass("ProseMirror");
    expect(mounted.root).toHaveTextContent("Notes");
    expect(mounted.root).toHaveTextContent("Paragraph");
    expect(mounted.getMarkdown()).toContain("# Notes");
    expect(mounted.getMarkdown()).toContain("Paragraph");
  });
});
