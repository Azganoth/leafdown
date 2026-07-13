import { describe, expect, it } from "vitest";

import { HELLO_WORLD_TEXT, TWO_PARAGRAPH_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "../../plugins/sourceProjection";
import { selectAll } from "../editing/selection";
import {
  canClearInlineFormat,
  clearInlineFormat,
  toggleEmphasis,
  toggleInlineCode,
  toggleStrikethrough,
  toggleStrong,
} from "./inline";

const mountEditor = setupMilkdownEditorMount();

describe("editor inline formatting commands", () => {
  it("toggles inline formatting for selections and nearest words", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);

    setTextSelection(mounted.view, 1, 6);

    expect(canClearInlineFormat(mounted.view.state)).toBe(false);
    expect(toggleStrong(mounted.view)).toBe(true);
    expect(canClearInlineFormat(mounted.view.state)).toBe(true);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toContain("**Hello** world");
    expect(mounted.getMarkdown()).toContain("**Hello** world");

    expect(toggleStrong(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();

    setTextSelection(mounted.view, 8);

    expect(toggleEmphasis(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toContain("*world*");
    expect(mounted.getMarkdown()).toContain("*world*");

    expect(toggleStrikethrough(mounted.view)).toBe(true);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.getMarkdown()).toContain("*~~world~~*");
  });

  it.each([
    {
      expectedMarkdown: "**Double** asterisk **strong**\n",
      initialMarkdown: "**Double asterisk strong**",
      initialText: "Double asterisk strong",
      markedTexts: ["Double", "strong"],
      selectionText: "asterisk",
      selector: "strong",
      toggle: toggleStrong,
    },
    {
      expectedMarkdown: "*Single* asterisk *emphasis*\n",
      initialMarkdown: "*Single asterisk emphasis*",
      initialText: "Single asterisk emphasis",
      markedTexts: ["Single", "emphasis"],
      selectionText: "asterisk",
      selector: "em",
      toggle: toggleEmphasis,
    },
    {
      expectedMarkdown: "~~Strike~~ middle ~~through~~\n",
      initialMarkdown: "~~Strike middle through~~",
      initialText: "Strike middle through",
      markedTexts: ["Strike", "through"],
      selectionText: "middle",
      selector: "del",
      toggle: toggleStrikethrough,
    },
    {
      expectedMarkdown: "`Code` middle `span`\n",
      initialMarkdown: "`Code middle span`",
      initialText: "Code middle span",
      markedTexts: ["Code", "span"],
      selectionText: "middle",
      selector: "code",
      toggle: toggleInlineCode,
    },
  ])(
    "preserves whitespace when partially removing $selector formatting",
    async ({
      expectedMarkdown,
      initialMarkdown,
      initialText,
      markedTexts,
      selectionText,
      selector,
      toggle,
    }) => {
      const mounted = await mountEditor(initialMarkdown);
      const selectionFrom = getEditorTextPosition(mounted, selectionText);
      const selectionTo = selectionFrom + selectionText.length;

      setTextSelection(mounted.view, selectionFrom, selectionTo);

      expect(toggle(mounted.view)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(initialText);
      expect(getSelectedEditorText(mounted)).toBe(selectionText);
      expect(mounted.view.state.selection.from).toBe(selectionFrom);
      expect(mounted.view.state.selection.to).toBe(selectionTo);
      expect(
        Array.from(mounted.view.dom.querySelectorAll(selector), (element) => element.textContent),
      ).toEqual(markedTexts);
      expect(mounted.getMarkdown()).toBe(expectedMarkdown);
    },
  );

  it("preserves nested formatting when removing a partial inner mark", async () => {
    const mounted = await mountEditor("***Bold and italic***");
    const selectionFrom = getEditorTextPosition(mounted, "and");

    setTextSelection(mounted.view, selectionFrom, selectionFrom + "and".length);

    expect(toggleStrong(mounted.view)).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("and");

    const markdown = mounted.getMarkdown();
    const reopened = await mountEditor(markdown);

    expect(getEditorTextContent(reopened)).toBe("Bold and italic");
    expect(
      Array.from(reopened.view.dom.querySelectorAll("strong"), (element) => element.textContent),
    ).toEqual(["Bold", "italic"]);
    expect(
      Array.from(reopened.view.dom.querySelectorAll("em"), (element) => element.textContent)
        .join("")
        .replaceAll(" ", ""),
    ).toBe("Boldanditalic");
  });

  it("uses inline code as exclusive inline formatting", async () => {
    const mounted = await mountEditor("**Hello** world");

    setTextSelection(mounted.view, 1, 6);

    expect(toggleInlineCode(mounted.view)).toBe(true);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toContain("`Hello` world");
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
    expect(mounted.getMarkdown()).toContain("`Hello` world");
    expect(mounted.view.dom.querySelector("code")).toHaveTextContent("Hello");
  });

  it("preserves whitespace when inline code replaces partial formatting", async () => {
    const mounted = await mountEditor("**Double asterisk strong**");
    const selectionFrom = getEditorTextPosition(mounted, "asterisk");

    setTextSelection(mounted.view, selectionFrom, selectionFrom + "asterisk".length);

    expect(toggleInlineCode(mounted.view)).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("asterisk");
    expect(mounted.getMarkdown()).toBe("**Double** `asterisk` **strong**\n");
  });

  it("applies inline formatting across selected blocks and arms collapsed empty formatting", async () => {
    const selectedBlocksEditor = await mountEditor(TWO_PARAGRAPH_MARKDOWN);

    expect(selectAll(selectedBlocksEditor.view)).toBe(true);
    expect(toggleStrong(selectedBlocksEditor.view)).toBe(true);

    expect(selectedBlocksEditor.view.dom.querySelectorAll("strong")).toHaveLength(2);
    expect(selectedBlocksEditor.getMarkdown()).toContain("**First**");
    expect(selectedBlocksEditor.getMarkdown()).toContain("**Second**");

    const collapsedEditor = await mountEditor("");

    setTextSelection(collapsedEditor.view, 1);

    expect(toggleEmphasis(collapsedEditor.view)).toBe(true);

    typeText(collapsedEditor.view, "empty");

    expect(getEditorTextContent(collapsedEditor)).toBe("*empty*");
    expect(collapsedEditor.getMarkdown()).toContain("*empty*");
  });

  it("clears selected and active inline formatting", async () => {
    const mounted = await mountEditor("**Hello** *world*");

    setTextSelection(mounted.view, 1, 6);

    expect(canClearInlineFormat(mounted.view.state)).toBe(true);
    expect(clearInlineFormat(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
    expect(mounted.view.dom.querySelector("em")).toHaveTextContent("world");

    setTextSelection(mounted.view, 8);

    expect(clearInlineFormat(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("em")).not.toBeInTheDocument();
  });

  it("preserves whitespace when clearing partial nested formatting", async () => {
    const mounted = await mountEditor("***Bold and italic***");
    const selectionFrom = getEditorTextPosition(mounted, "and");

    setTextSelection(mounted.view, selectionFrom, selectionFrom + "and".length);

    expect(clearInlineFormat(mounted.view)).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("and");
    expect(mounted.getMarkdown()).toBe("***Bold*** and ***italic***\n");
  });
});
