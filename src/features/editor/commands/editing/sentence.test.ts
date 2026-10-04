// @vitest-environment happy-dom

import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
  selectTableCellRange,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "..";
import { createHierarchicalBlockSelection } from "../../plugins/blockSelection";
import { canDeleteSentence, deleteSentence } from "./deletion";
import { canRedo, canUndo } from "./history";
import { canSelectSentence, selectSentence } from "./selection";

const mountEditor = setupMilkdownEditorMount();

const THREE_SENTENCES = "First one. Second one. Third.";

const positionOf = (mounted: MountedMilkdownEditor, text: string, offset = 0) =>
  getEditorTextPosition(mounted, text) + offset;

const selectSentenceAt = (mounted: MountedMilkdownEditor, anchor: number, head = anchor) => {
  setTextSelection(mounted.view, anchor, head);

  return selectSentence(mounted.view) ? getSelectedEditorText(mounted) : null;
};

const isSentenceCommandAvailable = (mounted: MountedMilkdownEditor) =>
  canSelectSentence(mounted.view.state) || canDeleteSentence(mounted.view.state);

// Walks a run sentence by sentence by placing the caret at each sentence's start.
const collectSentences = (mounted: MountedMilkdownEditor, start: number) => {
  const sentences: string[] = [];
  let position = start;

  while (selectSentenceAt(mounted, position) !== null) {
    const { from, to } = mounted.view.state.selection;

    if (from !== position) {
      break;
    }

    sentences.push(getSelectedEditorText(mounted));
    position = to;
  }

  return sentences;
};

describe("sentence selection", () => {
  it("selects the whole sentence around the caret", async () => {
    const mounted = await mountEditor(THREE_SENTENCES);

    expect(selectSentenceAt(mounted, positionOf(mounted, "cond one"))).toBe("Second one. ");
    expect(mounted.view.state.selection.anchor).toBe(positionOf(mounted, "Second"));
    expect(mounted.view.state.selection.head).toBe(positionOf(mounted, "Third"));
  });

  it("reads the sentence after a boundary, and the last one at the end", async () => {
    const mounted = await mountEditor(THREE_SENTENCES);
    const start = positionOf(mounted, "First");

    expect(selectSentenceAt(mounted, start)).toBe("First one. ");
    expect(selectSentenceAt(mounted, positionOf(mounted, "Second"))).toBe("Second one. ");
    expect(selectSentenceAt(mounted, start + THREE_SENTENCES.length)).toBe("Third.");
  });

  it("owns the whitespace after a sentence", async () => {
    const mounted = await mountEditor("One.  Two.");

    expect(selectSentenceAt(mounted, positionOf(mounted, "  Two", 1))).toBe("One.  ");
  });

  it("widens a selection to the sentences it touches", async () => {
    const mounted = await mountEditor(THREE_SENTENCES);

    expect(
      selectSentenceAt(mounted, positionOf(mounted, "one. Second"), positionOf(mounted, "cond")),
    ).toBe("First one. Second one. ");
  });

  it("is unavailable once the sentence is already selected", async () => {
    const mounted = await mountEditor(THREE_SENTENCES);

    selectSentenceAt(mounted, positionOf(mounted, "cond"));
    expect(canSelectSentence(mounted.view.state)).toBe(false);
    expect(selectSentence(mounted.view)).toBe(false);
    expect(getSelectedEditorText(mounted)).toBe("Second one. ");
  });

  it("extends an unterminated final sentence to the end", async () => {
    const mounted = await mountEditor("One. Tail without end");

    expect(selectSentenceAt(mounted, positionOf(mounted, "without"))).toBe("Tail without end");
  });

  it("is unavailable in an empty paragraph", async () => {
    const mounted = await mountEditor("Text.");
    const { view } = mounted;
    const end = view.state.doc.content.size;

    view.dispatch(view.state.tr.insert(end, view.state.schema.nodes.paragraph.create()));
    setTextSelection(view, end + 1);

    expect(view.state.selection.$head.parent.content.size).toBe(0);
    expect(isSentenceCommandAvailable(mounted)).toBe(false);
  });

  it.each([
    {
      name: "a quoted terminator with its closing quote",
      markdown: 'He said "Stop." Then left.',
      expected: ['He said "Stop." ', "Then left."],
    },
    {
      name: "a parenthesized terminator with its closing bracket",
      markdown: "(It works.) Next.",
      expected: ["(It works.) ", "Next."],
    },
    {
      // The runtime splits after a title abbreviation but not inside a decimal; the fixture
      // records that rather than correcting it.
      name: "an abbreviation and a decimal",
      markdown: "Dr. Smith paid 3.50 today. Then he left.",
      expected: ["Dr. ", "Smith paid 3.50 today. ", "Then he left."],
    },
    {
      name: "CJK terminators without spaces",
      markdown: "你好。再见！谢谢？好",
      expected: ["你好。", "再见！", "谢谢？", "好"],
    },
    {
      name: "a Devanagari danda",
      markdown: "मैं ठीक हूँ। तुम कैसे हो?",
      expected: ["मैं ठीक हूँ। ", "तुम कैसे हो?"],
    },
    {
      name: "combining characters",
      markdown: "Café is open. Come in.",
      expected: ["Café is open. ", "Come in."],
    },
    {
      name: "astral emoji with a skin-tone modifier",
      markdown: "I \u{1F600} emoji. \u{1F44D}\u{1F3FD} Next.",
      expected: ["I \u{1F600} emoji. ", "\u{1F44D}\u{1F3FD} Next."],
    },
  ])("segments $name", async ({ markdown, expected }) => {
    const mounted = await mountEditor(markdown);

    expect(collectSentences(mounted, positionOf(mounted, expected[0]))).toEqual(expected);
  });

  it("keeps a soft line break inside the sentence", async () => {
    const mounted = await mountEditor("One line\ncontinues here. Next.");

    expect(getEditorTextContent(mounted)).toBe("One line\ncontinues here. Next.");
    expect(selectSentenceAt(mounted, positionOf(mounted, "line"))).toBe(
      "One line\ncontinues here. ",
    );
  });

  it("stops at a hard break and does not cross it", async () => {
    const mounted = await mountEditor("First part\\\nsecond part. Next.");
    const breakPosition = getEditorNodePosition(mounted, "hardbreak");

    expect(selectSentenceAt(mounted, positionOf(mounted, "part"))).toBe("First part");
    expect(selectSentenceAt(mounted, breakPosition + 1)).toBe("second part. ");
    expect(
      selectSentenceAt(mounted, positionOf(mounted, "part"), positionOf(mounted, "second")),
    ).toBeNull();
  });

  it("joins text across marks and links without their destinations", async () => {
    const mounted = await mountEditor(
      "Some **bold. Text** and [a link. Here](https://example.com/a.b) end.",
    );

    // Carets stay in plain text; one at a mark's edge would project it.
    expect(selectSentenceAt(mounted, positionOf(mounted, "ome"))).toBe("Some bold. ");
    expect(selectSentenceAt(mounted, positionOf(mounted, "nd a"))).toBe("Text and a link. ");
    expect(selectSentenceAt(mounted, positionOf(mounted, "nd."))).toBe("Here end.");
  });

  it.each([
    { name: "paragraphs", markdown: "First paragraph.\n\nSecond paragraph." },
    { name: "list items", markdown: "- First paragraph.\n- Second paragraph." },
    { name: "quoted paragraphs", markdown: "> First paragraph.\n>\n> Second paragraph." },
    {
      name: "footnote prose and the next paragraph",
      markdown: "Body[^1]\n\n[^1]: First paragraph.\n\nSecond paragraph.",
    },
  ])("keeps to its own block between $name", async ({ markdown }) => {
    const mounted = await mountEditor(markdown);
    const firstEnd = positionOf(mounted, "First paragraph.", "First paragraph.".length);
    const secondStart = positionOf(mounted, "Second paragraph.");

    expect(selectSentenceAt(mounted, firstEnd)).toBe("First paragraph.");
    expect(selectSentenceAt(mounted, secondStart)).toBe("Second paragraph.");
    expect(selectSentenceAt(mounted, firstEnd, secondStart)).toBeNull();
  });

  it("keeps to its own table cell", async () => {
    const mounted = await mountEditor(
      "| First paragraph. | Second paragraph. |\n| --- | --- |\n| a | b |",
    );

    expect(
      selectSentenceAt(mounted, positionOf(mounted, "First paragraph.", "First paragraph.".length)),
    ).toBe("First paragraph.");
    expect(selectSentenceAt(mounted, positionOf(mounted, "Second paragraph."))).toBe(
      "Second paragraph.",
    );
  });

  it("treats an inline atom as a boundary it never selects", async () => {
    const mounted = await mountEditor("Before it $x$ after it. Next.");

    expect(selectSentenceAt(mounted, positionOf(mounted, "fore"))).toBe("Before it ");
    expect(mounted.view.state.selection.to).toBeLessThanOrEqual(
      getEditorNodePosition(mounted, "math_inline"),
    );
  });

  it("selects without dirtying the document or adding history", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(THREE_SENTENCES, { onContentChanged });

    selectSentenceAt(mounted, positionOf(mounted, "cond"));

    expect(onContentChanged).not.toHaveBeenCalled();
    expect(canUndo(mounted.view.state)).toBe(false);
  });
});

describe("sentence availability", () => {
  it.each([
    { parent: "code_block", markdown: "```\nOne. Two.\n```", text: "Two." },
    { parent: "frontmatter", markdown: "---\ntitle: One. Two.\n---\n\nBody.", text: "Two." },
    {
      parent: "footnote_definition_label",
      markdown: "Body[^note.a]\n\n[^note.a]: Text.",
      text: "note.a",
    },
    {
      parent: "definition_destination",
      markdown: '[ref]: https://example.com/a.b "One. Two."\n\nUse [ref].',
      text: "example.com",
    },
    {
      parent: "definition_title",
      markdown: '[ref]: https://example.com "One. Two."\n\nUse [ref].',
      text: "Two.",
    },
  ])("is unavailable inside $parent", async ({ markdown, parent, text }) => {
    const mounted = await mountEditor(markdown);
    const position = positionOf(mounted, text, 2);

    setTextSelection(mounted.view, position);
    expect(mounted.view.state.selection.$head.parent.type.name).toBe(parent);
    expect(isSentenceCommandAvailable(mounted)).toBe(false);

    setTextSelection(mounted.view, position, position + 1);
    expect(isSentenceCommandAvailable(mounted)).toBe(false);
  });

  it("is unavailable for structural block, node, and table cell selections", async () => {
    const mounted = await mountEditor(
      "One. Two.\n\n---\n\n| One. Two. | b |\n| --- | --- |\n| c | d |",
    );
    const { view } = mounted;

    view.dispatch(view.state.tr.setSelection(createHierarchicalBlockSelection(view.state.doc, 0)));
    expect(isSentenceCommandAvailable(mounted)).toBe(false);

    view.dispatch(
      view.state.tr.setSelection(
        NodeSelection.create(view.state.doc, getEditorNodePosition(mounted, "hr")),
      ),
    );
    expect(isSentenceCommandAvailable(mounted)).toBe(false);

    selectTableCellRange(mounted, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(isSentenceCommandAvailable(mounted)).toBe(false);
  });

  it("runs through the shared command registry", async () => {
    const mounted = await mountEditor(THREE_SENTENCES);
    const caret = positionOf(mounted, "cond");

    setTextSelection(mounted.view, caret);
    expect(await runEditorCommand(mounted.editor, "edit.selectSentence")).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("Second one. ");

    setTextSelection(mounted.view, caret);
    expect(await runEditorCommand(mounted.editor, "edit.deleteSentence")).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("First one. Third.");
  });
});

describe("sentence deletion", () => {
  it("deletes the sentence selection would select, with its following whitespace", async () => {
    const mounted = await mountEditor(THREE_SENTENCES);

    setTextSelection(mounted.view, positionOf(mounted, "cond"));
    expect(deleteSentence(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("First one. Third.");

    setTextSelection(mounted.view, positionOf(mounted, "Third.", "Third.".length));
    expect(deleteSentence(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("First one. ");
  });

  it("deletes every sentence a selection touches", async () => {
    const mounted = await mountEditor(THREE_SENTENCES);

    setTextSelection(mounted.view, positionOf(mounted, "one. Second"), positionOf(mounted, "cond"));
    expect(deleteSentence(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("Third.");
  });

  it.each([
    {
      markdown: "Lead. Some **bold. Text** and more.",
      expected: "Lead. **Text** and more.\n",
    },
    {
      markdown: "Lead. Some [a link. Here](https://x.test) end.",
      expected: "Lead. [Here](https://x.test) end.\n",
    },
  ])("keeps the inline structure around text deleted from $markdown", async (fixture) => {
    const mounted = await mountEditor(fixture.markdown);

    setTextSelection(mounted.view, positionOf(mounted, "Some"));
    expect(deleteSentence(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(fixture.expected);
  });

  it("is one undo step separate from prior typing that restores the selection", async () => {
    const mounted = await mountEditor(THREE_SENTENCES);
    const end = positionOf(mounted, "Third.", "Third.".length);

    setTextSelection(mounted.view, end);
    typeText(mounted.view, " Four.");
    expect(deleteSentence(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("First one. Second one. Third. ");

    await runEditorCommand(mounted.editor, "edit.undo");
    expect(getEditorTextContent(mounted)).toBe(`${THREE_SENTENCES} Four.`);
    expect(mounted.view.state.selection).toBeInstanceOf(TextSelection);
    expect(mounted.view.state.selection.head).toBe(end + " Four.".length);

    await runEditorCommand(mounted.editor, "edit.undo");
    expect(getEditorTextContent(mounted)).toBe(THREE_SENTENCES);

    await runEditorCommand(mounted.editor, "edit.redo");
    await runEditorCommand(mounted.editor, "edit.redo");
    expect(getEditorTextContent(mounted)).toBe("First one. Second one. Third. ");
    expect(canRedo(mounted.view.state)).toBe(false);
  });

  it("adds no history or dirty state when there is nothing to delete", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor("```\nOne. Two.\n```", { onContentChanged });

    setTextSelection(mounted.view, positionOf(mounted, "Two."));
    expect(deleteSentence(mounted.view)).toBe(false);

    expect(onContentChanged).not.toHaveBeenCalled();
    expect(canUndo(mounted.view.state)).toBe(false);
  });
});
