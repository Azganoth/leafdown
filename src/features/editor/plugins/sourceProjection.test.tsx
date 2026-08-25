import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { BOLD_PLAIN_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  findEditorTextNode,
  getEditorDomElement,
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  getMarkNames,
  getSelectedEditorText,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setSelectionAtElementTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { enterProjection, selectFootnoteReference } from "@/test/utils/sourceProjection";

import { runEditorCommand } from "../commands";
import { hasActiveSourceProjection, pasteIntoSourceProjection } from "./sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});
const MARKDOWN_UPDATE_LISTENER_DEBOUNCE_MS = 300;

const getProjectedFootnoteSource = (mounted: MountedMilkdownEditor) =>
  Array.from(
    mounted.view.dom.querySelectorAll("[data-leafdown-source~='footnote-reference']"),
    (element) => element.textContent,
  ).join("");

const waitForMarkdownUpdateListener = async () => {
  await vi.advanceTimersByTimeAsync(MARKDOWN_UPDATE_LISTENER_DEBOUNCE_MS);
};

const runCommand = async (mounted: MountedMilkdownEditor, commandId: "edit.redo" | "edit.undo") =>
  runEditorCommand(mounted.editor, commandId);

// ProseMirror finishes a composition on a timer and reconciles the DOM when it fires. Without the
// wait that lands after the editor is gone.
const PROSEMIRROR_COMPOSITION_END_MS = 20;

const composeText = async (mounted: MountedMilkdownEditor, position: number, text: string) => {
  vi.useFakeTimers();

  try {
    setTextSelection(mounted.view, position);
    mounted.view.dom.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    typeText(mounted.view, text);
    mounted.view.dom.dispatchEvent(new Event("compositionend", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(PROSEMIRROR_COMPOSITION_END_MS);
  } finally {
    vi.useRealTimers();
  }
};

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

    it.each([
      { name: "bare", source: "tail https://example.com" },
      { name: "angle-bracket", source: "tail <https://example.com>" },
    ])("projects a $name autolink as its authored source", async ({ source }) => {
      const mounted = await mountProjectionEditor(source);

      enterProjection(mounted, "a");

      expect(getEditorTextContent(mounted)).toBe(source);
      expect(mounted.getMarkdown()).toBe(`${source}\n`);
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
      expect(mounted.getMarkdown()).toBe("*Single **asterisk** emphasis*\n");
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

    it("presents a mixed-format projected link label as one semantic range", async () => {
      const source =
        '[**calibration summary** with *field observations*, ~~retired wording~~, and `v2`](./article-navigator/01-overview.md "Calibration review")';
      const label =
        "**calibration summary** with *field observations*, ~~retired wording~~, and `v2`";
      const mounted = await mountProjectionEditor(source);

      enterProjection(mounted, "a");

      const labelRanges = mounted.view.dom.querySelectorAll(
        ".leafdown-source-projection__content--link-label",
      );

      expect(Array.from(labelRanges, (range) => range.textContent).join("")).toBe(label);
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--strong"),
      ).toHaveTextContent("calibration summary");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--emphasis"),
      ).toHaveTextContent("field observations");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--strikethrough"),
      ).toHaveTextContent("retired wording");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--inline-code"),
      ).toHaveTextContent("v2");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe(`${source}\n`);
    });

    it("presents a plain titled projected link label as one semantic range", async () => {
      const source = '[Plain label](./article.md "Reference")';
      const mounted = await mountProjectionEditor(source);

      enterProjection(mounted, "a");

      expect(
        Array.from(
          mounted.view.dom.querySelectorAll(".leafdown-source-projection__content--link-label"),
          (fragment) => fragment.textContent,
        ).join(""),
      ).toBe("Plain label");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe(`${source}\n`);
    });

    it("synchronizes projected link-label hover across presentation fragments", async () => {
      const onContentChanged = vi.fn();
      const mounted = await mountProjectionEditor(
        "[**Bold** and *soft*](https://example.com) plain",
        {
          onContentChanged,
        },
      );

      enterProjection(mounted, "a");

      const projectedDocument = mounted.view.state.doc;
      const getLabelFragments = () =>
        Array.from(
          mounted.view.dom.querySelectorAll(".leafdown-source-projection__content--link-label"),
        );
      const firstFragment = getLabelFragments()[0];
      const lastFragment = getLabelFragments().at(-1);

      if (!firstFragment || !lastFragment) {
        throw new Error("Expected projected link-label presentation fragments.");
      }

      dispatchMouseEvent(firstFragment, "mouseover");

      expect(
        getLabelFragments().every((fragment) =>
          fragment.classList.contains("leafdown-source-projection__content--link-label-hovered"),
        ),
      ).toBe(true);
      expect(mounted.view.state.doc.eq(projectedDocument)).toBe(true);
      expect(onContentChanged).not.toHaveBeenCalled();

      dispatchMouseEvent(firstFragment, "mouseout", { relatedTarget: lastFragment });

      expect(
        getLabelFragments().every((fragment) =>
          fragment.classList.contains("leafdown-source-projection__content--link-label-hovered"),
        ),
      ).toBe(true);

      dispatchMouseEvent(getLabelFragments().at(-1)!, "mouseout");

      expect(
        getLabelFragments().every(
          (fragment) =>
            !fragment.classList.contains("leafdown-source-projection__content--link-label-hovered"),
        ),
      ).toBe(true);
      expect(mounted.view.state.doc.eq(projectedDocument)).toBe(true);
      expect(onContentChanged).not.toHaveBeenCalled();
    });

    it("isolates projected label presentation from adjacent links with the same destination", async () => {
      const mounted = await mountProjectionEditor(
        "[First](https://example.com) [**Second** and *soft*](https://example.com)",
      );
      const secondLinkPosition = getEditorTextPosition(mounted, "Second") + 1;

      setTextSelection(mounted.view, secondLinkPosition);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(
        Array.from(
          mounted.view.dom.querySelectorAll(".leafdown-source-projection__content--link-label"),
          (fragment) => fragment.textContent,
        ).join(""),
      ).toBe("**Second** and *soft*");
      const falseClassElements = Array.from(mounted.view.dom.querySelectorAll(".false"));

      expect(falseClassElements).toEqual([]);
    });

    it("maps a selection through escaped text in a mixed-format link label", async () => {
      const mounted = await mountProjectionEditor(
        "[\\*literal\\* and **bold**](https://example.com)",
      );
      const selectionFrom = getEditorTextPosition(mounted, "bold");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "bold".length);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(
        "[\\*literal\\* and **bold**](https://example.com)",
      );
      expect(getSelectedEditorText(mounted)).toBe("bold");
    });

    it("projects a link label holding a footnote reference", async () => {
      const source = "[Link containing a reference[^follow-up]](./field-report.md)";
      const mounted = await mountProjectionEditor(`${source}\n\n[^follow-up]: Detail`);
      const originalDocument = mounted.view.state.doc;
      const labelStart = getEditorTextPosition(mounted, "Link containing a reference");

      setTextSelection(mounted.view, labelStart + "Link".length);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toContain(source);
      expect(
        Array.from(
          mounted.view.dom.querySelectorAll(".leafdown-source-projection__content--link-label"),
          (fragment) => fragment.textContent,
        ).join(""),
      ).toBe("Link containing a reference[^follow-up]");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--footnote-reference"),
      ).toHaveTextContent("[^follow-up]");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);

      const selectionFrom = getEditorTextPosition(mounted, "containing");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "containing".length);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("containing");
    });

    it.each([
      { offset: 0, side: "before", sourceOffset: "[Link containing a reference".length },
      {
        offset: 1,
        side: "after",
        sourceOffset: "[Link containing a reference[^follow-up]".length,
      },
    ])(
      "projects a link label from the caret $side its footnote reference",
      async ({ offset, sourceOffset }) => {
        const source = "[Link containing a reference[^follow-up]](./field-report.md)";
        const mounted = await mountProjectionEditor(`${source}\n\n[^follow-up]: Detail`);

        setTextSelection(
          mounted.view,
          getEditorNodePosition(mounted, "footnote_reference") + offset,
        );

        expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
        expect(mounted.view.state.selection.from).toBe(
          getEditorTextPosition(mounted, source) + sourceOffset,
        );
      },
    );

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

    it("projects the owning marked fragment from its footnote node and restores exactly", async () => {
      const mounted = await mountProjectionEditor("**Text[^note]**\n\n[^note]: Detail");
      const originalDocument = mounted.view.state.doc;

      selectFootnoteReference(mounted);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("note");
      expect(mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker")).toHaveLength(
        4,
      );
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--footnote-reference"),
      ).toHaveTextContent("note");
      expect(
        Array.from(
          mounted.view.dom.querySelectorAll("[data-leafdown-source~='footnote-reference']"),
          (element) => element.textContent,
        ).join(""),
      ).toBe("**Text[^note]**");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
    });

    it.each([
      {
        description: "strong",
        source: "**archive note[^archive]**",
      },
      {
        description: "emphasis",
        source: "*follow-up reference[^follow-up]*",
      },
    ])(
      "projects one $description source range when entering through its text",
      async ({ source }) => {
        const mounted = await mountProjectionEditor(
          `${source}\n\n[^archive]: Detail\n\n[^follow-up]: More`,
        );
        const textPosition = getEditorTextPosition(
          mounted,
          source.includes("archive") ? "archive" : "follow-up",
        );

        setTextSelection(mounted.view, textPosition + 1);

        expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
        expect(getProjectedFootnoteSource(mounted)).toBe(source);
      },
    );

    it.each([
      { offset: 0, side: "before", sourceOffset: "**Text".length },
      { offset: 1, side: "after", sourceOffset: "**Text[^note]".length },
    ])(
      "enters the owning marked fragment from the $side reference boundary",
      async ({ offset, sourceOffset }) => {
        const source = "**Text[^note]**";
        const mounted = await mountProjectionEditor(`${source}\n\n[^note]: Detail`);
        const referencePosition = getEditorNodePosition(mounted, "footnote_reference");

        setTextSelection(mounted.view, referencePosition + offset);

        const projectedSourceStart = getEditorTextPosition(mounted, source);

        expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
        expect(mounted.view.state.selection.from).toBe(projectedSourceStart + sourceOffset);
      },
    );

    it.each([
      { description: "text after the reference", source: "**left[^note]right**" },
      { description: "whitespace before the reference atom", source: "**left [^note]**" },
      { description: "whitespace after the reference atom", source: "**[^note] right**" },
      {
        description: "a link the mark wraps",
        source: "**left[^note][link](https://example.com)right**",
      },
    ])("keeps $description inside one marked fragment", async ({ source }) => {
      const mounted = await mountProjectionEditor(`${source}\n\n[^note]: Detail`);

      selectFootnoteReference(mounted);

      expect(getProjectedFootnoteSource(mounted)).toBe(source);
    });

    it.each([
      {
        boundary: "inline code",
        markdown: "**left[^note]`code`right**",
      },
      {
        boundary: "image",
        markdown: "**left[^note]![alt](image.png)right**",
      },
      {
        boundary: "inline HTML",
        markdown: "**left[^note]<span>raw</span>right**",
      },
      {
        boundary: "hard break",
        markdown: "**left[^note]  \nright**",
      },
    ])("stops a marked footnote fragment at a $boundary", async ({ markdown }) => {
      const mounted = await mountProjectionEditor(`${markdown}\n\n[^note]: Detail`);

      selectFootnoteReference(mounted);

      expect(getProjectedFootnoteSource(mounted)).toBe("**left[^note]**");
    });

    it.each([
      {
        boundary: "different mark set",
        markdown: "**left[^note]**_right_",
      },
      {
        boundary: "different strong-marker attributes",
        markdown: "**left[^note]**__right__",
      },
    ])("stops at an adjacent $boundary", async ({ markdown }) => {
      const mounted = await mountProjectionEditor(`${markdown}\n\n[^note]: Detail`);

      selectFootnoteReference(mounted);

      expect(getProjectedFootnoteSource(mounted)).toBe("**left[^note]**");
    });

    it("trims only marked edge whitespace around a footnote fragment", async () => {
      const mounted = await mountProjectionEditor("Before Text[^note] after\n\n[^note]: Detail");
      const textPosition = getEditorTextPosition(mounted, "Text");
      const referencePosition = getEditorNodePosition(mounted, "footnote_reference");
      const strongMark = mounted.view.state.schema.marks.strong.create({ marker: "*" });

      mounted.view.dispatch(
        mounted.view.state.tr.addMark(textPosition - 1, referencePosition + 2, strongMark),
      );
      selectFootnoteReference(mounted);

      expect(getProjectedFootnoteSource(mounted)).toBe("**Text[^note]**");
      expect(getEditorTextContent(mounted)).toContain("Before **Text[^note]** after");
    });

    it("keeps a linked marked footnote reference on its standalone adapter", async () => {
      const source = "[**left[^note]**](https://example.com)";
      const mounted = await mountProjectionEditor(`${source}\n\n[^note]: Detail`);

      selectFootnoteReference(mounted);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getProjectedFootnoteSource(mounted)).toBe("[^note]");
      expect(
        mounted.view.dom.querySelector(".leafdown-source-projection__content--link"),
      ).not.toBeInTheDocument();
    });

    it("downgrades the owning strong fragment while keeping its canonical reference", async () => {
      const mounted = await mountProjectionEditor("**Text[^note]**\n\n[^note]: Detail");

      selectFootnoteReference(mounted);

      const sourceStart = getEditorTextPosition(mounted, "**Text[^note]**");

      setTextSelection(mounted.view, sourceStart + 1);
      runKeyDownHandlers(mounted.view, "Backspace");
      setSelectionAtDocumentEnd(mounted.view);

      const referencePosition = getEditorNodePosition(mounted, "footnote_reference");
      const reference = mounted.view.state.doc.nodeAt(referencePosition);

      expect(reference?.marks.map((mark) => mark.type.name)).toEqual(["emphasis"]);
      expect(mounted.getMarkdown()).toContain("*Text[^note]*");
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

      const strongLiteral = findEditorTextNode(mounted, "[^note", (node) =>
        getMarkNames(node).includes("strong"),
      );

      expect(strongLiteral).not.toBeNull();
      expect(mounted.getMarkdown()).toContain("**Text\\[^note**");
    });

    it("commits an invalid outer wrapper as complete unmarked literal text", async () => {
      const mounted = await mountProjectionEditor("**Text[^note]**\n\n[^note]: Detail");

      selectFootnoteReference(mounted);

      const source = "**Text[^note]**";
      const sourceStart = getEditorTextPosition(mounted, source);

      setTextSelection(mounted.view, sourceStart + source.length - 2, sourceStart + source.length);
      runKeyDownHandlers(mounted.view, "Backspace");
      setSelectionAtDocumentEnd(mounted.view);

      const strongMark = mounted.view.state.schema.marks.strong;
      const literalNode = findEditorTextNode(mounted, "**Text[^note]");

      expect(literalNode).not.toBeNull();
      expect(strongMark.isInSet(literalNode!.marks)).toBeUndefined();
      expect(() => getEditorNodePosition(mounted, "footnote_reference")).toThrow(
        "Could not find footnote_reference node.",
      );
    });

    it.each([
      {
        description: "strong source with leading whitespace",
        markerSize: 2,
        side: "leading",
        source: "**Text[^note]**",
      },
      {
        description: "strong source with trailing whitespace",
        markerSize: 2,
        side: "trailing",
        source: "**Text[^note]**",
      },
      {
        description: "emphasis source with leading whitespace",
        markerSize: 1,
        side: "leading",
        source: "*Text[^note]*",
      },
      {
        description: "emphasis source with trailing whitespace",
        markerSize: 1,
        side: "trailing",
        source: "*Text[^note]*",
      },
      {
        description: "strikethrough source with leading whitespace",
        markerSize: 2,
        side: "leading",
        source: "~~Text[^note]~~",
      },
      {
        description: "strikethrough source with trailing whitespace",
        markerSize: 2,
        side: "trailing",
        source: "~~Text[^note]~~",
      },
      {
        description: "combined source with leading whitespace",
        markerSize: 3,
        side: "leading",
        source: "***Text[^note]***",
      },
      {
        description: "combined source with trailing whitespace",
        markerSize: 3,
        side: "trailing",
        source: "***Text[^note]***",
      },
    ] as const)(
      "commits CommonMark-invalid $description as complete unmarked literal text",
      async ({ markerSize, side, source }) => {
        const mounted = await mountProjectionEditor(`${source}\n\n[^note]: Detail`);

        selectFootnoteReference(mounted);

        const sourceStart = getEditorTextPosition(mounted, source);
        const insertionOffset = side === "leading" ? markerSize : source.length - markerSize;
        const invalidSource = `${source.slice(0, insertionOffset)} ${source.slice(insertionOffset)}`;

        setTextSelection(mounted.view, sourceStart + insertionOffset);
        typeText(mounted.view, " ");
        setSelectionAtDocumentEnd(mounted.view);

        const literalNode = findEditorTextNode(mounted, invalidSource);

        expect(literalNode).not.toBeNull();
        expect(literalNode!.marks).toHaveLength(0);
        expect(() => getEditorNodePosition(mounted, "footnote_reference")).toThrow(
          "Could not find footnote_reference node.",
        );
      },
    );

    it("keeps a valid outer wrapper when marked reference content becomes unsupported", async () => {
      const source = "**Text[^note]**";
      const imageSource = "![Text[^note]](./pic.png)";
      const mounted = await mountProjectionEditor(`${source}\n\n[^note]: Detail`);

      selectFootnoteReference(mounted);

      const sourceStart = getEditorTextPosition(mounted, source);

      setTextSelection(mounted.view, sourceStart + 2, sourceStart + source.length - 2);
      typeText(mounted.view, imageSource);
      setSelectionAtDocumentEnd(mounted.view);

      const strongMark = mounted.view.state.schema.marks.strong;
      const literalNode = findEditorTextNode(mounted, imageSource);

      expect(literalNode).not.toBeNull();
      expect(strongMark.isInSet(literalNode!.marks)).toBeDefined();
      expect(() => getEditorNodePosition(mounted, "footnote_reference")).toThrow(
        "Could not find footnote_reference node.",
      );
      expect(mounted.view.dom.querySelector("img")).not.toBeInTheDocument();
    });

    it("rehydrates an edited marked link label holding a reference", async () => {
      const source = "**left[^note][link[^other]](https://example.com)right**";
      const mounted = await mountProjectionEditor(`${source}\n\n[^note]: D\n\n[^other]: O`);

      selectFootnoteReference(mounted);

      expect(getProjectedFootnoteSource(mounted)).toBe(source);

      const sourceStart = getEditorTextPosition(mounted, source);

      setTextSelection(mounted.view, sourceStart + "**left[^note][link".length);
      typeText(mounted.view, "ed");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toContain(source.replace("[link", "[linked"));
      expect(
        getEditorNodePosition(
          mounted,
          "footnote_reference",
          (node) => node.attrs.label === "other",
        ),
      ).toBeGreaterThan(0);
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
      expect(mounted.getMarkdown()).toBe("Text[^note\n\n[^note]: Detail\n");
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

      expect(mounted.getMarkdown()).toBe("Text[^note\n\n[^note]: Detail\n");
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.view.state.selection.from).toBe(
        getEditorTextPosition(mounted, literal) + literal.length,
      );
    });

    it.each([
      { direction: "forward", reverse: false },
      { direction: "backward", reverse: true },
    ])(
      "preserves a $direction selection across the owning marked fragment",
      async ({ reverse }) => {
        const source = "**archive note[^archive]**";
        const mounted = await mountProjectionEditor(`${source}\n\n[^archive]: Detail`);
        const textFrom = getEditorTextPosition(mounted, "archive note");
        const referenceTo = getEditorNodePosition(mounted, "footnote_reference") + 1;

        setTextSelection(
          mounted.view,
          reverse ? referenceTo : textFrom,
          reverse ? textFrom : referenceTo,
        );

        expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
        expect(getSelectedEditorText(mounted)).toBe("archive note[^archive]");
        expect(mounted.view.state.selection.anchor > mounted.view.state.selection.head).toBe(
          reverse,
        );
      },
    );

    it("uses projection-local history before preserving native history for a marked reference", async () => {
      const initialMarkdown = "**Text[^note]**\n\n[^note]: Detail";
      const editedMarkdown = "**Text[^updated]**\n\n[^note]: Detail\n";
      const mounted = await mountProjectionEditor(initialMarkdown);

      selectFootnoteReference(mounted);
      expect(pasteIntoSourceProjection(mounted.view, "updated")).toBe(true);

      expect(getProjectedFootnoteSource(mounted)).toBe("**Text[^updated]**");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(getProjectedFootnoteSource(mounted)).toBe("**Text[^note]**");
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(getProjectedFootnoteSource(mounted)).toBe("**Text[^updated]**");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe(editedMarkdown);
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(`${initialMarkdown}\n`);
      expect(await runCommand(mounted, "edit.redo")).toBe(true);
      expect(mounted.getMarkdown()).toBe(editedMarkdown);
    });

    it("commits a marked reference before switching directly to another marked fragment", async () => {
      const mounted = await mountProjectionEditor(
        "**One[^one]** and *two[^two]*\n\n[^one]: First\n\n[^two]: Second",
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
      expect(getProjectedFootnoteSource(mounted)).toBe("*two[^two]*");
      expect(mounted.getMarkdown()).toBe(
        "**One[^updated]** and *two[^two]*\n\n[^one]: First\n\n[^two]: Second\n",
      );
      expect(mounted.getMarkdown()).not.toContain("[^updated]:");
    });

    it("tracks only marked-fragment edits and emits the finalized Markdown update", async () => {
      const onContentChanged = vi.fn();
      const onMarkdownUpdated = vi.fn();
      const mounted = await mountProjectionEditor("**Text[^note]**\n\n[^note]: Detail", {
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
        expect(mounted.getMarkdown()).toBe("**Text[^updated]**\n\n[^note]: Detail\n");

        await waitForMarkdownUpdateListener();

        expect(onMarkdownUpdated).toHaveBeenCalledWith(
          expect.objectContaining({
            markdown: "**Text[^updated]**\n\n[^note]: Detail\n",
          }),
        );
        expect(onMarkdownUpdated).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      {
        source: "**archive note[^archive]**",
        definition: "[^archive]: Detail",
        text: "archive note",
      },
      {
        source: "*follow-up reference[^follow-up]*",
        definition: "[^follow-up]: More",
        text: "follow-up reference",
      },
    ])(
      "saves and reopens $source through the existing Milkdown serializer",
      async ({ definition, source, text }) => {
        const expectedMarkdown = `${source}\n\n${definition}\n`;
        const mounted = await mountProjectionEditor(`${source}\n\n${definition}`);

        setTextSelection(mounted.view, getEditorTextPosition(mounted, text) + 1);

        expect(getProjectedFootnoteSource(mounted)).toBe(source);
        expect(mounted.getMarkdown()).toBe(expectedMarkdown);

        const reopened = await mountProjectionEditor(expectedMarkdown);

        setTextSelection(reopened.view, getEditorTextPosition(reopened, text) + 1);

        expect(getProjectedFootnoteSource(reopened)).toBe(source);
      },
    );
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

      expect(mounted.getMarkdown()).toBe("**\\[Links]\\(https://example.com)** plain\n");
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

    it.each([
      {
        expected: "`` `!Code `` plain",
        position: "`".length,
        side: "leading",
      },
      {
        expected: "``Code`!`` plain",
        position: "`Code".length,
        side: "trailing",
      },
    ])("keeps the caret with a $side boundary-backtick edit", async ({ expected, position }) => {
      const mounted = await mountProjectionEditor("`Code` plain");

      enterProjection(mounted, "code");

      const sourceStart = getEditorTextPosition(mounted, "`Code`");
      setTextSelection(mounted.view, sourceStart + position);
      typeText(mounted.view, "`");
      typeText(mounted.view, "!");

      expect(getEditorTextContent(mounted)).toBe(expected);
    });

    it("does not turn source padding into inline-code content after deleting the only backtick", async () => {
      const mounted = await mountProjectionEditor("`` ` `` plain");

      enterProjection(mounted, "code");

      const sourceStart = getEditorTextPosition(mounted, "`` ` ``");
      setTextSelection(mounted.view, sourceStart + 4);
      runKeyDownHandlers(mounted.view, "Backspace");

      expect(getEditorTextContent(mounted)).toBe("`` plain");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("\\`\\` plain\n");
      expect(mounted.view.dom.querySelector("code")).not.toBeInTheDocument();
    });

    it.each([
      {
        expected: "`leading` plain",
        position: 4,
        source: "`` `leading `` plain",
      },
      {
        expected: "`trailing` plain",
        position: 12,
        source: "`` trailing` `` plain",
      },
    ])(
      "removes a $source boundary backtick without retaining padding",
      async ({ expected, position, source }) => {
        const mounted = await mountProjectionEditor(source);

        enterProjection(mounted, "code");

        const sourceStart = getEditorTextPosition(mounted, source.slice(0, -" plain".length));
        setTextSelection(mounted.view, sourceStart + position);
        runKeyDownHandlers(mounted.view, "Backspace");

        expect(getEditorTextContent(mounted)).toBe(expected);
      },
    );

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

    it("commits an edited label holding a footnote reference", async () => {
      const source = "[Link containing a reference[^follow-up]](./field-report.md)";
      const mounted = await mountProjectionEditor(`${source}\n\n[^follow-up]: Detail`);
      const labelStart = getEditorTextPosition(mounted, "Link containing a reference");

      setTextSelection(mounted.view, labelStart + "Link".length);

      const sourceStart = getEditorTextPosition(mounted, source);

      setTextSelection(mounted.view, sourceStart + "[Link".length);
      typeText(mounted.view, "ed");
      setSelectionAtDocumentEnd(mounted.view);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.getMarkdown()).toBe(
        `${source.replace("[Link", "[Linked")}\n\n[^follow-up]: Detail\n`,
      );

      const reference = mounted.view.state.doc.nodeAt(
        getEditorNodePosition(mounted, "footnote_reference"),
      );

      expect(getMarkNames(reference!)).toEqual(["link"]);
      expect(reference?.marks[0].attrs.href).toBe("./field-report.md");
    });

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

    it.each([
      {
        content: "text",
        input: " ",
        markdown: "_text_ tail",
        selector: "em" as const,
        source: "_text_",
      },
      {
        content: "text",
        input: "x",
        markdown: "_text_ tail",
        selector: "em" as const,
        source: "_text_",
      },
      {
        content: "text",
        input: " ",
        markdown: "~~text~~ tail",
        selector: "del" as const,
        source: "~~text~~",
      },
      {
        content: "text",
        input: "x",
        markdown: "~~text~~ tail",
        selector: "del" as const,
        source: "~~text~~",
      },
      {
        content: "text",
        input: " ",
        markdown: "**text** tail",
        selector: "strong" as const,
        source: "**text**",
      },
      {
        content: "text",
        input: "x",
        markdown: "**text** tail",
        selector: "strong" as const,
        source: "**text**",
      },
      {
        content: "text",
        input: " ",
        markdown: "`text` tail",
        selector: "code" as const,
        source: "`text`",
      },
      {
        content: "text",
        input: "x",
        markdown: "`text` tail",
        selector: "code" as const,
        source: "`text`",
      },
      {
        content: "a",
        input: " ",
        markdown: "[a](b) tail",
        selector: "a" as const,
        source: "[a](b)",
      },
      {
        content: "a",
        input: "x",
        markdown: "[a](b) tail",
        selector: "a" as const,
        source: "[a](b)",
      },
    ])(
      "applies $input typed after the closing delimiter of $markdown outside the construct",
      async ({ content, input, markdown, selector, source }) => {
        const mounted = await mountProjectionEditor(markdown);

        enterProjection(mounted, selector);

        const sourceStart = getEditorTextPosition(mounted, source);

        setTextSelection(mounted.view, sourceStart + source.length);
        typeText(mounted.view, input);

        expect(getEditorTextContent(mounted)).toBe(`${content}${input} tail`);

        setSelectionAtDocumentEnd(mounted.view);

        expect(mounted.view.dom.querySelector(selector)).toBeInTheDocument();
        expect(mounted.getMarkdown()).toBe(`${source}${input} tail\n`);
      },
    );

    it("commits edited source before applying text typed after its closing delimiter", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart + "**Bold".length);
      typeText(mounted.view, "er");
      setTextSelection(mounted.view, sourceStart + "**Bolder**".length);
      typeText(mounted.view, "x");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.dom.querySelector("strong")).toHaveTextContent("Bolder");
      expect(mounted.getMarkdown()).toBe("**Bolder**x plain\n");
    });

    it("applies text typed after a footnote reference's closing delimiter outside its source", async () => {
      const mounted = await mountProjectionEditor("text[^a] tail\n\n[^a]: note");

      selectFootnoteReference(mounted);

      const sourceStart = getEditorTextPosition(mounted, "[^a]");

      setTextSelection(mounted.view, sourceStart + "[^a]".length);
      typeText(mounted.view, "x");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.dom.querySelector("sup")).toBeInTheDocument();
      expect(mounted.getMarkdown()).toBe("text[^a]x tail\n\n[^a]: note\n");
    });

    it("keeps a literal marker beside a projection out of an input rule", async () => {
      const mounted = await mountProjectionEditor("*__text__");

      enterProjection(mounted, "strong");

      const sourceStart = getEditorTextPosition(mounted, "__text__");

      setTextSelection(mounted.view, sourceStart + "__text__".length);
      typeText(mounted.view, "*");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.dom.querySelector("strong")).toHaveTextContent("text");
      expect(getEditorTextContent(mounted)).toBe("*text*");
      expect(mounted.getMarkdown()).toBe("\\*__text__\\*\n");
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

    it("keeps text typed at a link's opening delimiter outside its source", async () => {
      const mounted = await mountProjectionEditor("[a](b) tail");

      enterProjection(mounted, "a");

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "[a](b)"));
      typeText(mounted.view, "x");

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("x[a](b) tail");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.dom.querySelector("a")).toBeInTheDocument();
      expect(mounted.getMarkdown()).toBe("x[a](b) tail\n");
    });

    it("applies a space typed at a link's opening delimiter", async () => {
      const mounted = await mountProjectionEditor("see [a](b) tail");

      enterProjection(mounted, "a");

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "[a](b)"));
      typeText(mounted.view, " ");

      expect(getEditorTextContent(mounted)).toBe("see  [a](b) tail");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.view.dom.querySelector("a")).toBeInTheDocument();
      expect(getEditorTextContent(mounted)).toBe("see  a tail");
    });

    it("keeps text typed at a footnote reference's opening delimiter outside its source", async () => {
      const mounted = await mountProjectionEditor("text[^a] tail\n\n[^a]: note");

      selectFootnoteReference(mounted);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "[^a]"));
      typeText(mounted.view, "x");

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("textx[^a] tail\n\n[^a]: note\n");
    });

    it.each([
      { markdown: "[a](b) tail", name: "link", source: "[a](b)", tagName: "a" },
      {
        markdown: "text[^a] tail\n\n[^a]: note",
        name: "footnote reference",
        source: "[^a]",
        tagName: "sup",
      },
    ])(
      "commits a $name as literal text when a backslash opens its source",
      async ({ markdown, source, tagName }) => {
        const mounted = await mountProjectionEditor(markdown);

        if (tagName === "a") {
          enterProjection(mounted, "a");
        } else {
          selectFootnoteReference(mounted);
        }

        setTextSelection(mounted.view, getEditorTextPosition(mounted, source));
        typeText(mounted.view, "\\");
        setSelectionAtDocumentEnd(mounted.view);

        expect(mounted.view.dom.querySelector(tagName)).not.toBeInTheDocument();
      },
    );

    it.each([
      { markdown: "[a](b) tail", offset: 0, side: "the source start" },
      { markdown: "[a](b) tail", offset: "[a]".length, side: "the destination" },
    ])("escapes a link with a backslash typed at $side", async ({ markdown, offset }) => {
      const mounted = await mountProjectionEditor(markdown);

      enterProjection(mounted, "a");

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "[a](b)") + offset);
      typeText(mounted.view, "\\");
      setSelectionAtDocumentEnd(mounted.view);

      const authored = await mountProjectionEditor("\\[a](b) tail");

      expect(getEditorTextContent(mounted)).toBe("[a](b) tail");
      expect(mounted.view.state.doc.toJSON()).toEqual(authored.view.state.doc.toJSON());
      expect(mounted.getMarkdown()).toBe("\\[a](b) tail\n");
    });

    it("escapes a footnote reference with a backslash typed at its source start", async () => {
      const mounted = await mountProjectionEditor("text[^a] tail\n\n[^a]: note");

      selectFootnoteReference(mounted);

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "[^a]"));
      typeText(mounted.view, "\\");
      setSelectionAtDocumentEnd(mounted.view);

      const authored = await mountProjectionEditor("text\\[^a] tail\n\n[^a]: note");

      expect(mounted.view.state.doc.toJSON()).toEqual(authored.view.state.doc.toJSON());
      expect(mounted.getMarkdown()).toBe("text\\[^a] tail\n\n[^a]: note\n");
    });

    it("keeps a backslash the author means as text", async () => {
      const mounted = await mountProjectionEditor("[a](b) tail");

      enterProjection(mounted, "a");

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "[a](b)"));
      typeText(mounted.view, "\\ ");
      setSelectionAtDocumentEnd(mounted.view);

      expect(getEditorTextContent(mounted)).toBe("\\ [a](b) tail");
    });

    it("spells an escaped backslash as one character", async () => {
      const mounted = await mountProjectionEditor("[a](b) tail");

      enterProjection(mounted, "a");

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "[a](b)"));
      typeText(mounted.view, "\\\\");
      setSelectionAtDocumentEnd(mounted.view);

      expect(getEditorTextContent(mounted)).toBe("\\[a](b) tail");
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

    it("leaves composition input to the browser instead of rewriting the range", async () => {
      const mounted = await mountProjectionEditor("[first field walk](./doc.md) tail");

      enterProjection(mounted, "a");

      const walkEnd = getEditorTextPosition(mounted, "walk") + "walk".length;

      setTextSelection(mounted.view, walkEnd);

      expect(typeText(mounted.view, "!")).toBe(true);

      mounted.view.dom.dispatchEvent(new Event("compositionstart", { bubbles: true }));

      expect(mounted.view.composing).toBe(true);
      expect(typeText(mounted.view, "に")).toBe(false);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("[first field walk!に](./doc.md) tail");
    });

    it.each([
      { expected: "**BoldX** plain", offset: 7, side: "closing" },
      { expected: "**XBold** plain", offset: 1, side: "opening" },
    ])("normalizes input composed inside the $side marker", async ({ expected, offset }) => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");
      await composeText(mounted, getEditorTextPosition(mounted, BOLD_PLAIN_MARKDOWN) + offset, "X");

      expect(getEditorTextContent(mounted)).toBe(expected);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe(`${expected}\n`);
    });

    it("undoes normalized composed input in one step", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");
      await composeText(mounted, getEditorTextPosition(mounted, BOLD_PLAIN_MARKDOWN) + 7, "X");

      expect(getEditorTextContent(mounted)).toBe("**BoldX** plain");
      expect(await runCommand(mounted, "edit.undo")).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);
    });

    it("leaves input composed outside the markers literal, as typing there does", async () => {
      const mounted = await mountProjectionEditor(BOLD_PLAIN_MARKDOWN);

      enterProjection(mounted, "strong");
      await composeText(mounted, getEditorTextPosition(mounted, BOLD_PLAIN_MARKDOWN), "X");

      expect(getEditorTextContent(mounted)).toBe("X**Bold** plain");
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
});
