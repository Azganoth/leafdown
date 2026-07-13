import {
  emphasisKeymap,
  hardbreakKeymap,
  inlineCodeKeymap,
  listItemKeymap,
  strongKeymap,
} from "@milkdown/kit/preset/commonmark";
import { strikethroughKeymap } from "@milkdown/kit/preset/gfm";
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

  it("disables native grammar and writing assistance on the editor surface", async () => {
    const mounted = await mountEditor("Paragraph");

    expect(mounted.view.dom).toHaveAttribute("spellcheck", "false");
    expect(mounted.view.dom).toHaveAttribute("autocorrect", "off");
    expect(mounted.view.dom).toHaveAttribute("data-gramm", "false");
    expect(mounted.view.dom).toHaveAttribute("data-ms-editor", "false");
    expect(mounted.root.querySelector(".milkdown")).toHaveAttribute("spellcheck", "false");
  });

  it("reserves inline formatting shortcuts for Leafdown commands", async () => {
    const mounted = await mountEditor("Paragraph");

    expect(mounted.editor.ctx.get(strongKeymap.key).ToggleBold.shortcuts).toEqual([]);
    expect(mounted.editor.ctx.get(emphasisKeymap.key).ToggleEmphasis.shortcuts).toEqual([]);
    expect(mounted.editor.ctx.get(inlineCodeKeymap.key).ToggleInlineCode.shortcuts).toEqual([]);
    expect(mounted.editor.ctx.get(strikethroughKeymap.key).ToggleStrikethrough.shortcuts).toEqual(
      [],
    );
  });

  it("retains Milkdown structural editing shortcuts", async () => {
    const mounted = await mountEditor("Paragraph");

    expect(mounted.editor.ctx.get(hardbreakKeymap.key).InsertHardbreak.shortcuts).toBe(
      "Shift-Enter",
    );
    expect(mounted.editor.ctx.get(listItemKeymap.key).NextListItem.shortcuts).toBe("Enter");
    expect(mounted.editor.ctx.get(listItemKeymap.key).SinkListItem.shortcuts).toEqual([
      "Tab",
      "Mod-]",
    ]);
  });
});
