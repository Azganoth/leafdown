import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

const mountEditor = setupMilkdownEditorMount();

describe("createMilkdownEditor", () => {
  it("mounts and serializes through the Leafdown Milkdown factory", async () => {
    const mounted = await mountEditor("# Notes\n\nParagraph");

    expect(mounted.view.dom).toHaveClass("ProseMirror");
    expect(mounted.root).toHaveTextContent("Notes");
    expect(mounted.root).toHaveTextContent("Paragraph");
    expect(mounted.getMarkdown()).toContain("# Notes");
    expect(mounted.getMarkdown()).toContain("Paragraph");
  });
});
