import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection } from "@milkdown/kit/prose/state";
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
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setSelectionAtElementTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import { hasActiveSourceProjection, pasteIntoSourceProjection } from "./sourceProjection";

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

const selectFootnoteReference = (
  mounted: MountedMilkdownEditor,
  predicate: (node: ProseMirrorNode) => boolean = () => true,
) => {
  const position = getEditorNodePosition(mounted, "footnote_reference", predicate);

  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, position)),
  );
};

const waitForMarkdownUpdateListener = async () => {
  await vi.advanceTimersByTimeAsync(MARKDOWN_UPDATE_LISTENER_DEBOUNCE_MS);
};

const enterProjection = (
  mounted: MountedMilkdownEditor,
  selector: "a" | "code" | "del" | "em" | "strong",
) => {
  const element = getEditorDomElement(mounted, selector);

  setSelectionAtElementTextEnd(mounted.view, element);

  expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
};

const runCommand = async (mounted: MountedMilkdownEditor, commandId: "edit.redo" | "edit.undo") =>
  runEditorCommand(mounted.editor, commandId);

describe("source projection", () => {
  describe("entry and rendering", () => {
    it("projects strong markers as real editable document text", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);
      expect(
        mounted.view.dom.querySelector(".leafdown-source-edit[aria-label='Inline Markdown']"),
      ).not.toBeInTheDocument();

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

      setTextSelection(mounted.view, sourceStart + 1);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

      setTextSelection(mounted.view, sourceStart + "**Bold".length);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    });

    it.each([
      { expected: "__Bold__ plain", initial: "__Bold__ plain", selector: "strong" as const },
      { expected: "_Soft_ plain", initial: "_Soft_ plain", selector: "em" as const },
    ])(
      "projects underscore source markers for $initial",
      async ({ expected, initial, selector }) => {
        const mounted = await mountProjectionEditor(initial);

        enterProjection(mounted, selector);

        expect(getEditorTextContent(mounted)).toBe(expected);
      },
    );

    it("styles projected markers separately from projected content", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const markers = Array.from(
        mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker"),
      );
      const content = getEditorDomElement(mounted, ".leafdown-source-projection__content--strong");

      expect(markers.map((marker) => marker.textContent).join("")).toBe("****");
      expect(content).toHaveTextContent("Bold");
    });

    it("projects strikethrough markers as real editable document text", async () => {
      const mounted = await mountProjectionEditor("~~Strike~~ plain");

      enterProjection(mounted, "del");

      expect(getEditorTextContent(mounted)).toBe("~~Strike~~ plain");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-edit[aria-label='Inline Markdown']"),
      ).not.toBeInTheDocument();
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--strikethrough"),
      ).toHaveTextContent("Strike");
    });

    it("projects inline-code markers as real editable document text", async () => {
      const mounted = await mountProjectionEditor("`Code` plain");

      enterProjection(mounted, "code");

      expect(getEditorTextContent(mounted)).toBe("`Code` plain");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-edit[aria-label='Inline Markdown']"),
      ).not.toBeInTheDocument();
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--inline-code"),
      ).toHaveTextContent("Code");
    });

    it.each([
      { source: "`` `leading `` plain", text: "`leading" },
      { source: "`` trailing` `` plain", text: "trailing`" },
      { source: "`` `both` `` plain", text: "`both`" },
      { source: "`` ` `` plain", text: "`" },
    ])(
      "projects valid padded source for inline code with boundary backticks",
      async ({ source, text }) => {
        const mounted = await mountProjectionEditor(source);

        enterProjection(mounted, "code");

        expect(getEditorTextContent(mounted)).toBe(source);
        expect(
          mounted.view.dom.querySelector(".leafdown-source-projection__content--inline-code"),
        ).toHaveTextContent(text);
        expect(
          Array.from(
            mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker"),
            (element) => element.textContent,
          ).join(""),
        ).toBe("``  ``");
      },
    );

    it("maps an inline-code selection around source-only boundary padding and restores cleanly", async () => {
      const source = "`` pnpm run `preview` `` plain";
      const mounted = await mountProjectionEditor(source);
      const originalDocument = mounted.view.state.doc;

      enterProjection(mounted, "code");

      const sourceStart = getEditorTextPosition(mounted, "`` pnpm run `preview` ``");

      setTextSelection(mounted.view, sourceStart + 3, sourceStart + 3 + "pnpm".length);
      expect(getSelectedEditorText(mounted)).toBe("pnpm");

      setSelectionAtDocumentEnd(mounted.view);
      expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
    });

    it("projects link source as real editable document text", async () => {
      const mounted = await mountProjectionEditor("[Link](https://example.com) plain");

      enterProjection(mounted, "a");

      expect(getEditorTextContent(mounted)).toBe("[Link](https://example.com) plain");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-edit[aria-label='Inline Markdown']"),
      ).not.toBeInTheDocument();
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--link"),
      ).toHaveTextContent("Link");
    });

    it("projects only the exact mark combination around the caret", async () => {
      const mounted = await mountProjectionEditor("***Bold and italic***");

      enterProjection(mounted, "strong");

      const selectionFrom = getEditorTextPosition(mounted, "and");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "and".length);

      expect(runEditorCommand(mounted.editor, "format.strong")).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

      setSelectionAtDocumentEnd(mounted.view);

      const expectedTargets = [
        { documentText: "***Bold*** and italic", word: "Bold" },
        { documentText: "Bold *and* italic", word: "and" },
        { documentText: "Bold and ***italic***", word: "italic" },
      ] as const;

      for (const { documentText, word } of expectedTargets) {
        const caretPosition = getEditorTextPosition(mounted, word) + 1;

        setTextSelection(mounted.view, caretPosition);

        expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
        expect(getEditorTextContent(mounted)).toBe(documentText);

        setSelectionAtDocumentEnd(mounted.view);
      }
    });

    it("projects a uniform inline target containing a forward or backward selection", async () => {
      const onContentChanged = vi.fn();
      const mounted = await mountProjectionEditor("*Single asterisk emphasis* plain", {
        onContentChanged,
      });

      setSelectionAtDocumentEnd(mounted.view);

      const selectionFrom = getEditorTextPosition(mounted, "asterisk");
      const selectionTo = selectionFrom + "asterisk".length;

      setTextSelection(mounted.view, selectionFrom, selectionTo);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("asterisk");
      expect(mounted.view.state.selection.anchor).toBeLessThan(mounted.view.state.selection.head);
      expect(onContentChanged).not.toHaveBeenCalled();

      setSelectionAtDocumentEnd(mounted.view);
      setTextSelection(mounted.view, selectionTo, selectionFrom);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("asterisk");
      expect(mounted.view.state.selection.anchor).toBeGreaterThan(
        mounted.view.state.selection.head,
      );
      expect(onContentChanged).not.toHaveBeenCalled();

      setSelectionAtDocumentEnd(mounted.view);

      const targetFrom = getEditorTextPosition(mounted, "Single");
      const targetTo = getEditorTextPosition(mounted, "emphasis") + "emphasis".length;

      setTextSelection(mounted.view, targetFrom, targetTo);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("Single asterisk emphasis");
      expect(onContentChanged).not.toHaveBeenCalled();
    });

    it("projects a uniform link containing a text selection", async () => {
      const mounted = await mountProjectionEditor("[Link](https://example.com) plain");

      setSelectionAtDocumentEnd(mounted.view);

      const selectionFrom = getEditorTextPosition(mounted, "Link");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "Link".length);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("Link");
      expect(getEditorTextContent(mounted)).toBe("[Link](https://example.com) plain");
    });

    it("immediately projects the exact segment created by a formatting command", async () => {
      const mounted = await mountProjectionEditor("*Single asterisk emphasis*");

      enterProjection(mounted, "em");

      const selectionFrom = getEditorTextPosition(mounted, "asterisk");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "asterisk".length);

      expect(runEditorCommand(mounted.editor, "format.strong")).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("asterisk");
      expect(getEditorTextContent(mounted)).toBe("Single ***asterisk*** emphasis");
      expect(mounted.getMarkdown()).toBe("*Single* ***asterisk*** *emphasis*\n");
    });

    it("immediately projects the exact segment left by a formatting command", async () => {
      const mounted = await mountProjectionEditor("***Bold and italic***");

      enterProjection(mounted, "strong");

      const selectionFrom = getEditorTextPosition(mounted, "and");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "and".length);

      expect(runEditorCommand(mounted.editor, "format.strong")).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("and");
      expect(getEditorTextContent(mounted)).toBe("Bold *and* italic");
    });

    it("does not project selections crossing exact inline targets or text blocks", async () => {
      const mixedInline = await mountProjectionEditor("***Bold*** plain *soft*");
      const inlineFrom = getEditorTextPosition(mixedInline, "Bold");
      const inlineTo = getEditorTextPosition(mixedInline, "soft") + "soft".length;

      setTextSelection(mixedInline.view, inlineFrom, inlineTo);

      expect(hasActiveSourceProjection(mixedInline.view.state)).toBe(false);

      const mixedBlocks = await mountProjectionEditor("**First**\n\n*Second*");
      const blockFrom = getEditorTextPosition(mixedBlocks, "First");
      const blockTo = getEditorTextPosition(mixedBlocks, "Second") + "Second".length;

      setTextSelection(mixedBlocks.view, blockFrom, blockTo);

      expect(hasActiveSourceProjection(mixedBlocks.view.state)).toBe(false);
    });

    it("projects a mixed-format link label as one logical source owner", async () => {
      const mounted = await mountProjectionEditor("[**Bold** and *soft*](https://example.com)");
      const link = getEditorDomElement(mounted, "a");

      setSelectionAtElementTextEnd(mounted.view, link);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("[**Bold** and *soft*](https://example.com)");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--strong"),
      ).toHaveTextContent("Bold");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--emphasis"),
      ).toHaveTextContent("soft");

      setSelectionAtDocumentEnd(mounted.view);

      const selectionFrom = getEditorTextPosition(mounted, "Bold");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "Bold".length);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("Bold");
    });

    it("maps a selection through escaped text in a mixed-format link label", async () => {
      const mounted = await mountProjectionEditor(
        "[literal \\* and **bold**](https://example.com)",
      );
      const selectionFrom = getEditorTextPosition(mounted, "bold");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "bold".length);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("[literal \\* and **bold**](https://example.com)");
      expect(getSelectedEditorText(mounted)).toBe("bold");
    });

    it("restores the exact original document after a clean projection", async () => {
      const mounted = await mountProjectionEditor(
        '**[Strong Link](https://example.com "Title")** plain',
      );
      const originalDocument = mounted.view.state.doc;

      enterProjection(mounted, "a");

      expect(mounted.view.state.doc.eq(originalDocument)).toBe(false);
      expect(mounted.view.dom.querySelector("a")).not.toBeInTheDocument();
      expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
    });
  });

  describe("footnote-reference projection", () => {
    it("maps entry from either side and keeps every source position editable", async () => {
      const initialMarkdown = "Before[^note] after\n\n[^note]: Detail";
      const source = "[^note]";
      const left = await mountProjectionEditor(initialMarkdown);
      const leftReferencePosition = getEditorNodePosition(left, "footnote_reference");

      setTextSelection(left.view, leftReferencePosition);

      const leftSourceStart = getEditorTextPosition(left, source);

      expect(left.view.state.selection.from).toBe(leftSourceStart);

      for (let offset = 0; offset <= source.length; offset += 1) {
        setTextSelection(left.view, leftSourceStart + offset);
        expect(hasActiveSourceProjection(left.view.state)).toBe(true);
      }

      const right = await mountProjectionEditor(initialMarkdown);
      const rightReferencePosition = getEditorNodePosition(right, "footnote_reference");

      setTextSelection(right.view, rightReferencePosition + 1);

      const rightSourceStart = getEditorTextPosition(right, source);

      expect(right.view.state.selection.from).toBe(rightSourceStart + source.length);
      expect(hasActiveSourceProjection(right.view.state)).toBe(true);
    });

    it("projects only semantic source from a marked node and restores exactly", async () => {
      const mounted = await mountProjectionEditor("**Text[^note]**\n\n[^note]: Detail");
      const originalDocument = mounted.view.state.doc;

      selectFootnoteReference(mounted);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("note");
      expect(mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker")).toHaveLength(
        2,
      );
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--footnote-reference"),
      ).toHaveTextContent("note");
      expect(
        Array.from(
          mounted.view.dom.querySelectorAll("[data-leafdown-source~='footnote-reference']"),
          (element) => element.textContent,
        ).join(""),
      ).toBe("[^note]");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
    });

    it("rehydrates valid edited source as a canonical footnote reference", async () => {
      const mounted = await mountProjectionEditor("Text[^note]\n\n[^note]: Detail");

      selectFootnoteReference(mounted);
      typeText(mounted.view, "updated");

      expect(getEditorTextContent(mounted)).toContain("Text[^updated]");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toContain("Text[^updated]");
      expect(
        getEditorNodePosition(
          mounted,
          "footnote_reference",
          (node) => node.attrs.label === "updated",
        ),
      ).toBeGreaterThan(0);
    });

    it.each([
      {
        description: "strong",
        expectedMarks: ["strong"],
        expectedSource: "**Text[^NOTE]**",
        initialSource: "**Text[^note]**",
      },
      {
        description: "emphasis",
        expectedMarks: ["emphasis"],
        expectedSource: "*Text[^NOTE]*",
        initialSource: "*Text[^note]*",
      },
      {
        description: "strikethrough",
        expectedMarks: ["strike_through"],
        expectedSource: "~~Text[^NOTE]~~",
        initialSource: "~~Text[^note]~~",
      },
      {
        description: "combined strong and emphasis",
        expectedMarks: ["emphasis", "strong"],
        expectedSource: "***Text[^NOTE]***",
        initialSource: "***Text[^note]***",
      },
    ])(
      "preserves $description around a valid edited reference",
      async ({ expectedMarks, expectedSource, initialSource }) => {
        const mounted = await mountProjectionEditor(`${initialSource}\n\n[^note]: Detail`);

        selectFootnoteReference(mounted);
        typeText(mounted.view, "NOTE");
        setSelectionAtDocumentEnd(mounted.view);

        const referencePosition = getEditorNodePosition(
          mounted,
          "footnote_reference",
          (node) => node.attrs.label === "NOTE",
        );
        const reference = mounted.view.state.doc.nodeAt(referencePosition);

        expect(reference?.marks.map((mark) => mark.type.name).toSorted()).toEqual(expectedMarks);
        expect(mounted.getMarkdown()).toContain(expectedSource);
      },
    );

    it("preserves ambient marks when incomplete source becomes literal text", async () => {
      const mounted = await mountProjectionEditor("**Text[^note]**\n\n[^note]: Detail");

      selectFootnoteReference(mounted);

      const source = "[^note]";
      const sourceStart = getEditorTextPosition(mounted, source);

      setTextSelection(mounted.view, sourceStart + source.length);
      runKeyDownHandlers(mounted.view, "Backspace");
      setSelectionAtDocumentEnd(mounted.view);

      const strongMark = mounted.view.state.schema.marks.strong;
      let hasStrongLiteral = false;

      mounted.view.state.doc.descendants((node) => {
        if (node.isText && node.text?.includes("[^note") && strongMark.isInSet(node.marks)) {
          hasStrongLiteral = true;
        }
      });

      expect(hasStrongLiteral).toBe(true);
      expect(mounted.getMarkdown()).toContain("**Text\\[^note**");
    });

    it("commits incomplete footnote source as exact literal document text", async () => {
      const mounted = await mountProjectionEditor("Text[^note]\n\n[^note]: Detail");

      selectFootnoteReference(mounted);

      const source = "[^note]";
      const sourceStart = getEditorTextPosition(mounted, source);

      setTextSelection(mounted.view, sourceStart + source.length);
      runKeyDownHandlers(mounted.view, "Backspace");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toContain("Text[^note");

      setSelectionAtDocumentEnd(mounted.view);

      expect(getEditorTextContent(mounted)).toContain("Text[^note");
      expect(mounted.getMarkdown()).toContain("Text\\[^note");
    });

    it.each([
      { anchorInSource: true, direction: "forward" },
      { anchorInSource: false, direction: "backward" },
    ] as const)(
      "preserves a $direction selection crossing the projected reference boundary",
      async ({ anchorInSource }) => {
        const mounted = await mountProjectionEditor("Before[^note] after\n\n[^note]: Detail");

        selectFootnoteReference(mounted);

        const sourceStart = getEditorTextPosition(mounted, "[^note]");
        const afterEnd = getEditorTextPosition(mounted, "after") + "after".length;
        const anchor = anchorInSource ? sourceStart + 2 : afterEnd;
        const head = anchorInSource ? afterEnd : sourceStart + 2;

        setTextSelection(mounted.view, anchor, head);

        const referencePosition = getEditorNodePosition(mounted, "footnote_reference");
        const { selection } = mounted.view.state;

        expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
        expect(selection.empty).toBe(false);
        expect(selection.anchor <= selection.head).toBe(anchorInSource);
        expect(selection.from).toBeLessThanOrEqual(referencePosition);
        expect(selection.to).toBeGreaterThan(referencePosition);
      },
    );

    it("commits one reference before switching directly to another", async () => {
      const mounted = await mountProjectionEditor(
        "One[^one] two[^two]\n\n[^one]: First\n\n[^two]: Second",
      );

      selectFootnoteReference(mounted, (node) => node.attrs.label === "one");
      expect(pasteIntoSourceProjection(mounted.view, "updated")).toBe(true);

      const secondPosition = getEditorNodePosition(
        mounted,
        "footnote_reference",
        (node) => node.attrs.label === "two",
      );

      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(
          NodeSelection.create(mounted.view.state.doc, secondPosition),
        ),
      );

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("two");
      expect(
        getEditorNodePosition(
          mounted,
          "footnote_reference",
          (node) => node.attrs.label === "updated",
        ),
      ).toBeGreaterThan(0);

      const markdown = mounted.getMarkdown();

      expect(markdown).toContain("One[^updated] two[^two]");
      expect(markdown).toContain("[^one]: First");
      expect(markdown).toContain("[^two]: Second");
      expect(markdown).not.toContain("[^updated]:");
    });

    it("uses local history before preserving native undo and redo after commit", async () => {
      const initialMarkdown = "Text[^note]\n\n[^note]: Detail";
      const mounted = await mountProjectionEditor(initialMarkdown);

      selectFootnoteReference(mounted);
      expect(pasteIntoSourceProjection(mounted.view, "updated")).toBe(true);

      expect(getEditorTextContent(mounted)).toContain("Text[^updated]");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(getEditorTextContent(mounted)).toContain("Text[^note]");
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(getEditorTextContent(mounted)).toContain("Text[^updated]");

      setSelectionAtDocumentEnd(mounted.view);

      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(`${initialMarkdown}\n`);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe("Text[^updated]\n\n[^note]: Detail\n");
    });

    it("tracks only real edits and suppresses transient Markdown updates", async () => {
      const onContentChanged = vi.fn();
      const onMarkdownUpdated = vi.fn();
      const mounted = await mountProjectionEditor("Text[^note]\n\n[^note]: Detail", {
        onContentChanged,
        onMarkdownUpdated,
      });

      vi.useFakeTimers();

      try {
        selectFootnoteReference(mounted);
        await waitForMarkdownUpdateListener();

        expect(onContentChanged).not.toHaveBeenCalled();
        expect(onMarkdownUpdated).not.toHaveBeenCalled();

        expect(pasteIntoSourceProjection(mounted.view, "updated")).toBe(true);
        await waitForMarkdownUpdateListener();

        expect(onContentChanged).toHaveBeenCalledTimes(1);
        expect(onMarkdownUpdated).not.toHaveBeenCalled();
        expect(mounted.getMarkdown()).toBe("Text[^updated]\n\n[^note]: Detail\n");
        expect(onContentChanged).toHaveBeenCalledTimes(1);

        await waitForMarkdownUpdateListener();

        expect(onMarkdownUpdated).toHaveBeenCalledWith(
          expect.objectContaining({
            markdown: "Text[^updated]\n\n[^note]: Detail\n",
          }),
        );
        expect(onMarkdownUpdated).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("preserves the caret when active invalid source is finalized for saving", async () => {
      const mounted = await mountProjectionEditor("Text[^note]\n\n[^note]: Detail");

      selectFootnoteReference(mounted);

      const source = "[^note]";
      const sourceStart = getEditorTextPosition(mounted, source);

      setTextSelection(mounted.view, sourceStart + source.length);
      runKeyDownHandlers(mounted.view, "Backspace");

      const literal = "[^note";

      expect(mounted.getMarkdown()).toContain("Text\\[^note");
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.view.state.selection.from).toBe(
        getEditorTextPosition(mounted, literal) + literal.length,
      );
    });
  });

  describe("source editing", () => {
    it.each([
      {
        expected: "**Bolder** plain\n",
        initial: BOLD_PLAIN_MARKDOWN,
        selector: "strong" as const,
      },
      {
        expected: "__Bolder__ plain\n",
        initial: "__Bold__ plain",
        selector: "strong" as const,
      },
      {
        expected: "*Softer* plain\n",
        initial: "*Soft* plain",
        selector: "em" as const,
      },
      {
        expected: "_Softer_ plain\n",
        initial: "_Soft_ plain",
        selector: "em" as const,
      },
      {
        expected: "***Bolder*** plain\n",
        initial: "***Bold*** plain",
        selector: "strong" as const,
      },
      {
        expected: "___Bolder___ plain\n",
        initial: "___Bold___ plain",
        selector: "strong" as const,
      },
      {
        expected: "_**Bolder**_ plain\n",
        initial: "**_Bold_** plain",
        selector: "strong" as const,
      },
    ])("commits valid projected source for $initial", async ({ expected, initial, selector }) => {
      const mounted = await mountProjectionEditor(initial);

      enterProjection(mounted, selector);
      typeText(mounted.view, "er");
      setSelectionAtDocumentEnd(mounted.view);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.getMarkdown()).toBe(expected);
    });

    it("downgrades strong projection to emphasis when a strong marker is deleted", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart + 1);
      runKeyDownHandlers(mounted.view, "Backspace");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("*Bold* plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("*Bold* plain\n");
    });

    it("commits edited strikethrough source and preserves nested marks", async () => {
      const mounted = await mountProjectionEditor("~~_**Nested**_~~ plain");

      enterProjection(mounted, "strong");
      typeText(mounted.view, "er");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("_**~~Nesteder~~**_ plain\n");
    });

    it("keeps edited link-like text literal inside an ordinary mark projection", async () => {
      const mounted = await mountProjectionEditor("**placeholder** plain");

      enterProjection(mounted, "strong");
      const source = "**placeholder**";
      const sourceStart = getEditorTextPosition(mounted, source);

      setTextSelection(mounted.view, sourceStart, sourceStart + source.length);
      expect(pasteIntoSourceProjection(mounted.view, "**[Links](https://example.com)**")).toBe(
        true,
      );
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("**\\[Links]\\(https\\://example.com)** plain\n");
      expect(mounted.view.dom.querySelector("a")).not.toBeInTheDocument();
      expect(getEditorDomElement(mounted, "strong")).toHaveTextContent(
        "[Links](https://example.com)",
      );
    });

    it("uses a longer delimiter run when inline-code content gains a backtick", async () => {
      const mounted = await mountProjectionEditor("`Code` plain");

      enterProjection(mounted, "code");

      const sourceStart = getEditorTextPosition(mounted, "`Code`");

      setTextSelection(mounted.view, sourceStart + "`Co".length);
      typeText(mounted.view, "`");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("``Co`de`` plain\n");
    });

    it("preserves inline-code marks and boundary backticks after a projected edit", async () => {
      const source = "`` pnpm run `preview` `` plain";
      const mounted = await mountProjectionEditor(source);

      enterProjection(mounted, "code");

      const sourceStart = getEditorTextPosition(mounted, "`` pnpm run `preview` ``");
      setTextSelection(mounted.view, sourceStart + 3 + "pnpm run `preview`".length);
      typeText(mounted.view, "!");

      expect(getEditorTextContent(mounted)).toBe("``pnpm run `preview`!`` plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("``pnpm run `preview`!`` plain\n");
      expect(getEditorDomElement(mounted, "code")).toHaveTextContent("pnpm run `preview`!");
    });

    it("adds source padding when inline-code content gains a boundary backtick", async () => {
      const mounted = await mountProjectionEditor("`Code` plain");

      enterProjection(mounted, "code");

      const sourceStart = getEditorTextPosition(mounted, "`Code`");
      setTextSelection(mounted.view, sourceStart + "`Code".length);
      typeText(mounted.view, "`");

      expect(getEditorTextContent(mounted)).toBe("`` Code` `` plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("`` Code` `` plain\n");
      expect(getEditorDomElement(mounted, "code")).toHaveTextContent("Code`");
    });

    it("does not project invalid unpadded inline-code source as a code mark", async () => {
      const source = "``pnpm run `preview``` plain";
      const mounted = await mountProjectionEditor(source);

      const sourceStart = getEditorTextPosition(mounted, "pnpm run `preview`");

      setTextSelection(mounted.view, sourceStart + 1);

      expect(mounted.view.dom.querySelector("code")).not.toBeInTheDocument();
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    });

    it("commits edited link and autolink source", async () => {
      const link = await mountProjectionEditor("[Link](https://example.com) plain");

      enterProjection(link, "a");

      const linkSourceStart = getEditorTextPosition(link, "[Link](https://example.com)");

      setTextSelection(link.view, linkSourceStart + 1);
      typeText(link.view, "Updated ");
      setSelectionAtDocumentEnd(link.view);

      expect(link.getMarkdown()).toBe("[Updated Link](https://example.com) plain\n");

      const autolink = await mountProjectionEditor("<https://example.com>");

      enterProjection(autolink, "a");

      const autolinkSourceStart = getEditorTextPosition(autolink, "<https://example.com>");

      setTextSelection(
        autolink.view,
        autolinkSourceStart,
        autolinkSourceStart + "<https://example.com>".length,
      );
      expect(pasteIntoSourceProjection(autolink.view, "<https://leafdown.dev>")).toBe(true);
      setSelectionAtDocumentEnd(autolink.view);

      expect(autolink.getMarkdown()).toBe("<https://leafdown.dev>\n");
    });

    it("commits edits to a mixed-format link without splitting its wrapper", async () => {
      const mounted = await mountProjectionEditor(
        '[**Bold** and *soft*](https://example.com "Title")',
      );

      enterProjection(mounted, "a");

      const sourceStart = getEditorTextPosition(
        mounted,
        '[**Bold** and *soft*](https://example.com "Title")',
      );

      setTextSelection(mounted.view, sourceStart + "[**Bold".length);
      typeText(mounted.view, "er");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe('[**Bolder** and *soft*](https://example.com "Title")\n');
      expect(
        Array.from(mounted.view.dom.querySelectorAll("a"), (element) => element.textContent).join(
          "",
        ),
      ).toBe("Bolder and soft");
    });

    it.each([
      {
        content: "strike",
        expectedContent: "striked",
        expectedMarkdown: "[plain ~~striked~~](https://example.com)\n",
        initialMarkdown: "[plain ~~strike~~](https://example.com)",
        selector: "del",
        source: "[plain ~~strike~~](https://example.com)",
      },
      {
        content: "code",
        expectedContent: "coded",
        expectedMarkdown: "[plain `coded`](https://example.com)\n",
        initialMarkdown: "[plain `code`](https://example.com)",
        selector: "code",
        source: "[plain `code`](https://example.com)",
      },
    ] as const)(
      "rehydrates an edited $selector label inside one logical link projection",
      async ({ content, expectedContent, expectedMarkdown, initialMarkdown, selector, source }) => {
        const mounted = await mountProjectionEditor(initialMarkdown);

        setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, selector));

        expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
        expect(getEditorTextContent(mounted)).toBe(source);

        const contentEnd = getEditorTextPosition(mounted, content) + content.length;

        setTextSelection(mounted.view, contentEnd);
        typeText(mounted.view, "d");
        setSelectionAtDocumentEnd(mounted.view);

        expect(mounted.getMarkdown()).toBe(expectedMarkdown);
        expect(
          Array.from(mounted.view.dom.querySelectorAll("a"), (element) => element.textContent).join(
            "",
          ),
        ).toBe(`plain ${expectedContent}`);
        expect(getEditorDomElement(mounted, selector)).toHaveTextContent(expectedContent);
      },
    );

    it("commits destination edits while preserving a mixed-format label", async () => {
      const mounted = await mountProjectionEditor("[**Bold** and *soft*](https://example.com)");

      enterProjection(mounted, "a");

      const destinationFrom = getEditorTextPosition(mounted, "https://example.com");

      setTextSelection(
        mounted.view,
        destinationFrom,
        destinationFrom + "https://example.com".length,
      );
      expect(pasteIntoSourceProjection(mounted.view, "https://leafdown.dev")).toBe(true);
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("[**Bold** and *soft*](https://leafdown.dev)\n");
      expect(getEditorDomElement(mounted, "a")).toHaveAttribute("href", "https://leafdown.dev");
    });

    it("commits malformed mixed-link source literally without losing text", async () => {
      const mounted = await mountProjectionEditor(
        "[**Bold** and *soft*](https://example.com) plain",
      );

      enterProjection(mounted, "a");

      const source = "[**Bold** and *soft*](https://example.com)";
      const sourceStart = getEditorTextPosition(mounted, source);

      setTextSelection(mounted.view, sourceStart + source.length);
      runKeyDownHandlers(mounted.view, "Backspace");
      setSelectionAtDocumentEnd(mounted.view);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.view.dom.querySelector("a, strong, em")).not.toBeInTheDocument();
      expect(getEditorTextContent(mounted)).toBe(`${source.slice(0, -1)} plain`);
    });

    it("rejects adjacent link wrappers even when their ProseMirror marks could merge", async () => {
      const mounted = await mountProjectionEditor(
        "[**Bold** and *soft*](https://example.com) plain",
      );
      const source = "[Bold](https://example.com)[soft](https://example.com)";

      enterProjection(mounted, "a");

      const originalSource = "[**Bold** and *soft*](https://example.com)";
      const sourceStart = getEditorTextPosition(mounted, originalSource);

      setTextSelection(mounted.view, sourceStart, sourceStart + originalSource.length);
      expect(pasteIntoSourceProjection(mounted.view, source)).toBe(true);
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.dom.querySelector("a")).not.toBeInTheDocument();
      expect(getEditorTextContent(mounted)).toBe(`${source} plain`);
    });

    it("preserves an ambient mark that extends beyond a mixed-format link", async () => {
      const mounted = await mountProjectionEditor(
        "*Before [**Bold** and soft](https://example.com) after*",
      );

      enterProjection(mounted, "a");

      expect(getEditorTextContent(mounted)).toBe(
        "Before [**Bold** and soft](https://example.com) after",
      );

      const sourceStart = getEditorTextPosition(
        mounted,
        "[**Bold** and soft](https://example.com)",
      );

      setTextSelection(mounted.view, sourceStart + "[**Bold".length);
      typeText(mounted.view, "er");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe(
        "*Before [**Bolder** and soft](https://example.com) after*\n",
      );
    });

    it("preserves an empty-destination link when its label is edited", async () => {
      const mounted = await mountProjectionEditor("[Link]()");

      enterProjection(mounted, "a");

      const sourceStart = getEditorTextPosition(mounted, "[Link]()");

      setTextSelection(mounted.view, sourceStart + 1);
      typeText(mounted.view, "Updated ");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("[Updated Link]()\n");
      expect(getEditorDomElement(mounted, "a")).toHaveAttribute("href", "");
    });

    it("preserves a uniform outer strong mark around projected links", async () => {
      const mounted = await mountProjectionEditor("**[Strong Link](https://example.com)**");

      enterProjection(mounted, "a");

      expect(getEditorTextContent(mounted)).toBe("**[Strong Link](https://example.com)**");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("**[Strong Link](https://example.com)**\n");
    });

    it("upgrades emphasis projection to strong when a marker is typed at the delimiter", async () => {
      const mounted = await mountProjectionEditor("*Soft* plain");

      enterProjection(mounted, "em");

      const sourceStart = getEditorTextPosition(mounted, "*Soft*");

      setTextSelection(mounted.view, sourceStart + 1);
      typeText(mounted.view, "*");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Soft** plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("**Soft** plain\n");
    });

    it("reforms emphasis projection when a missing left marker is readded", async () => {
      const mounted = await mountProjectionEditor("*Soft* plain");

      enterProjection(mounted, "em");

      const sourceStart = getEditorTextPosition(mounted, "*Soft*");

      setTextSelection(mounted.view, sourceStart + 1);
      runKeyDownHandlers(mounted.view, "Backspace");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("Soft* plain");

      typeText(mounted.view, "*");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("*Soft* plain");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--emphasis"),
      ).toHaveTextContent("Soft");
    });

    it("forms projection when a left marker completes plain raw inline source", async () => {
      const mounted = await mountProjectionEditor("Soft* plain");

      const sourceStart = getEditorTextPosition(mounted, "Soft*");

      setTextSelection(mounted.view, sourceStart);
      typeText(mounted.view, "*");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("*Soft* plain");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--emphasis"),
      ).toHaveTextContent("Soft");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("*Soft* plain\n");
    });

    it("forms inline-code projection when a left backtick completes plain source", async () => {
      const mounted = await mountProjectionEditor("Code` plain");

      const sourceStart = getEditorTextPosition(mounted, "Code`");

      setTextSelection(mounted.view, sourceStart);
      typeText(mounted.view, "`");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("`Code` plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("`Code` plain\n");
    });

    it("keeps outer-boundary text outside the projected content", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart);
      typeText(mounted.view, "A");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(`A${BOLD_PLAIN_MARKDOWN}`);

      expect(mounted.getMarkdown()).toBe(`A${BOLD_PLAIN_MARKDOWN}\n`);
    });

    it.each(["~", "`"])("keeps a foreign marker %s outside a strong projection", async (marker) => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart);
      typeText(mounted.view, marker);

      expect(getEditorTextContent(mounted)).toBe(`${marker}${BOLD_PLAIN_MARKDOWN}`);
      expect(mounted.getMarkdown()).toBe(`\\${marker}${BOLD_PLAIN_MARKDOWN}\n`);
    });

    it("inserts delimiter-interior text inside the projected content", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart + 1);
      typeText(mounted.view, "Z");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**ZBold** plain");
    });

    it("uses the edited delimiter side when completing marker runs", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      mounted.view.dispatch(
        mounted.view.state.tr.replaceWith(
          sourceStart,
          sourceStart + "**Bold**".length,
          mounted.view.state.schema.text("***Bold"),
        ),
      );
      setTextSelection(mounted.view, sourceStart + "***Bold".length);

      typeText(mounted.view, "*");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("*Bold* plain");

      typeText(mounted.view, "*");

      expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);

      typeText(mounted.view, "*");

      expect(getEditorTextContent(mounted)).toBe("***Bold*** plain");
    });

    it("keeps marker edits local instead of merging adjacent marked runs", async () => {
      const mounted = await mountProjectionEditor("**One** **Two**");

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**One**");

      setTextSelection(mounted.view, sourceStart + "**One*".length);
      runKeyDownHandlers(mounted.view, "Backspace");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("*One* **Two**\n");
    });

    it("commits malformed projected source as literal text", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(
        mounted.view,
        sourceStart + "**Bold*".length,
        sourceStart + "**Bold**".length,
      );
      typeText(mounted.view, "_");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Bold*_ plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
      expect(getEditorTextContent(mounted)).toBe("**Bold*_ plain");
    });
  });

  describe("keyboard handoff", () => {
    it("delegates Enter and projects the formatted content after the split", async () => {
      const mounted = await mountProjectionEditor("**LeftRight**");

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**LeftRight**");

      setTextSelection(mounted.view, sourceStart + "**Left".length);
      typeText(mounted.view, " edited");

      const { handled } = runKeyDownHandlers(mounted.view, "Enter");

      expect(handled).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(mounted.view.dom.querySelectorAll("p")).toHaveLength(2);
      expect(
        Array.from(mounted.view.dom.querySelectorAll("strong"), (element) => element.textContent),
      ).toEqual(["Left edited"]);
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--strong"),
      ).toHaveTextContent("Right");
      expect(mounted.view.state.selection.$from.parent.textContent).toBe("**Right**");
      expect(mounted.view.state.selection.$from.parentOffset).toBe(2);
    });

    it("delegates Shift+Enter and projects the formatted content after the break", async () => {
      const mounted = await mountProjectionEditor("**LeftRight**");

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**LeftRight**");

      setTextSelection(mounted.view, sourceStart + "**Left".length);

      const { handled } = runKeyDownHandlers(mounted.view, "Enter", { shift: true });

      expect(handled).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(mounted.view.dom.querySelector("br")).toBeInTheDocument();
      expect(
        Array.from(mounted.view.dom.querySelectorAll("strong"), (element) => element.textContent),
      ).toEqual(["Left"]);
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--strong"),
      ).toHaveTextContent("Right");
    });

    it("delegates Enter after committing invalid projected source literally", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(
        mounted.view,
        sourceStart + "**Bold*".length,
        sourceStart + "**Bold**".length,
      );
      typeText(mounted.view, "_");
      setTextSelection(mounted.view, sourceStart + "**Bo".length);

      expect(runKeyDownHandlers(mounted.view, "Enter").handled).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.view.dom.querySelectorAll("p")).toHaveLength(2);
      expect(mounted.view.dom.querySelector("strong, em")).not.toBeInTheDocument();
      expect(getEditorTextContent(mounted)).toBe("**Bold*_ plain");
    });

    it("keeps source projection active on Escape", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const { event, handled } = runKeyDownHandlers(mounted.view, "Escape");

      expect(handled).toBe(false);
      expect(event.defaultPrevented).toBe(false);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);
    });
  });

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
