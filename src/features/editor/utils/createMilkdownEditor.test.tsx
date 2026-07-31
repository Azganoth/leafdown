import { historyKeymap } from "@milkdown/kit/plugin/history";
import {
  blockquoteKeymap,
  bulletListKeymap,
  codeBlockKeymap,
  emphasisKeymap,
  hardbreakKeymap,
  headingKeymap,
  inlineCodeKeymap,
  listItemKeymap,
  orderedListKeymap,
  paragraphKeymap,
  strongKeymap,
} from "@milkdown/kit/preset/commonmark";
import { strikethroughKeymap } from "@milkdown/kit/preset/gfm";
import type { EditorState } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

import { composeEditorViewAttributes } from "./createMilkdownEditor";

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

  it("reserves history shortcuts for projection-aware Leafdown commands", async () => {
    const mounted = await mountEditor("Paragraph");

    expect(mounted.editor.ctx.get(historyKeymap.key).Undo.shortcuts).toEqual([]);
    expect(mounted.editor.ctx.get(historyKeymap.key).Redo.shortcuts).toEqual([]);
  });

  it("reserves paragraph and heading shortcuts for Leafdown commands", async () => {
    const mounted = await mountEditor("Paragraph");
    const headings = mounted.editor.ctx.get(headingKeymap.key);

    expect(mounted.editor.ctx.get(paragraphKeymap.key).TurnIntoText.shortcuts).toEqual([]);
    expect(headings.TurnIntoH1.shortcuts).toEqual([]);
    expect(headings.TurnIntoH2.shortcuts).toEqual([]);
    expect(headings.TurnIntoH3.shortcuts).toEqual([]);
    expect(headings.TurnIntoH4.shortcuts).toEqual([]);
    expect(headings.TurnIntoH5.shortcuts).toEqual([]);
    expect(headings.TurnIntoH6.shortcuts).toEqual([]);
    expect(headings.DowngradeHeading.shortcuts).toEqual(["Delete", "Backspace"]);
  });

  it("reserves semantic container shortcuts for Leafdown commands", async () => {
    const mounted = await mountEditor("Paragraph");

    expect(mounted.editor.ctx.get(orderedListKeymap.key).WrapInOrderedList.shortcuts).toEqual([]);
    expect(mounted.editor.ctx.get(bulletListKeymap.key).WrapInBulletList.shortcuts).toEqual([]);
    expect(mounted.editor.ctx.get(blockquoteKeymap.key).WrapInBlockquote.shortcuts).toEqual([]);
    expect(mounted.editor.ctx.get(codeBlockKeymap.key).CreateCodeBlock.shortcuts).toEqual([]);
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

  describe("composeEditorViewAttributes", () => {
    const added = { spellcheck: "false" };

    it("merges into an object form", () => {
      expect(composeEditorViewAttributes({ class: "editor" }, added)).toEqual({
        class: "editor",
        spellcheck: "false",
      });
    });

    it("merges into an absent form", () => {
      expect(composeEditorViewAttributes(undefined, added)).toEqual({ spellcheck: "false" });
    });

    it("preserves the function form so ProseMirror still resolves per state", () => {
      const composed = composeEditorViewAttributes(
        (state) => ({ class: `editor-${state.doc.childCount}` }),
        added,
      );

      expect(typeof composed).toBe("function");
      expect(
        (composed as (state: EditorState) => Record<string, string>)({
          doc: { childCount: 2 },
        } as unknown as EditorState),
      ).toEqual({ class: "editor-2", spellcheck: "false" });
    });
  });
});
