// @vitest-environment happy-dom

import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import {
  createClipboardData,
  dispatchClipboardEvent,
  dispatchMouseEvent,
} from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import { finalizeSourceProjection, hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountEditor = setupMilkdownEditorMount();
const raw = String.raw;
const group = "[see @doe, p. 3; -@roe]";
const markdown = `Before ${group} after\n\nEnd\n`;

const readCitations = (mounted: Awaited<ReturnType<typeof mountEditor>>) =>
  [...mounted.view.dom.querySelectorAll<HTMLElement>('[data-type="citation"]')].map(
    (element) => element.dataset.value,
  );

describe("citation source projection", () => {
  it("presents the authored group as one named citation", async () => {
    const mounted = await mountEditor(markdown);
    const citation = mounted.view.dom.querySelector('[data-type="citation"]');
    expect(citation).toHaveTextContent(group);
    expect(citation).toHaveAttribute("role", "doc-biblioref");
    expect(citation).toHaveAttribute("aria-label", `Citation ${group}`);
    expect(mounted.view.dom.querySelectorAll('[data-type="citation"]')).toHaveLength(1);
  });

  it("names a multiline group on one line", async () => {
    const mounted = await mountEditor("[see\n@doe]\n");
    expect(mounted.view.dom.querySelector('[data-type="citation"]')).toHaveAttribute(
      "aria-label",
      "Citation [see @doe]",
    );
  });

  it.each(["left", "right", "node"] as const)(
    "enters from %s and restores untouched source",
    async (side) => {
      const mounted = await mountEditor(markdown);
      const position = getEditorNodePosition(mounted, "citation");
      if (side === "node") {
        mounted.view.dispatch(
          mounted.view.state.tr.setSelection(
            NodeSelection.create(mounted.view.state.doc, position),
          ),
        );
      } else {
        setTextSelection(mounted.view, position + (side === "right" ? 1 : 0));
      }
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toContain(group);
      expect(getSelectedEditorText(mounted)).toBe(side === "node" ? group : "");
      setSelectionAtDocumentEnd(mounted.view);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(readCitations(mounted)).toEqual([group]);
      expect(mounted.getMarkdown()).toBe(markdown);
    },
  );

  it.each([
    { key: "ArrowRight", offset: 0, side: "right" },
    { key: "ArrowLeft", offset: group.length, side: "left" },
  ])("enters from $key at the source's matching edge", async ({ key, offset, side }) => {
    const mounted = await mountEditor(markdown);
    const position = getEditorNodePosition(mounted, "citation");
    setSelectionAtDocumentEnd(mounted.view);
    runKeyDownHandlers(mounted.view, key);
    setTextSelection(mounted.view, position + (side === "right" ? 1 : 0));
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(position + offset);
  });

  it("opens the source with the caret inside the group on a click", async () => {
    const mounted = await mountEditor(markdown);
    const position = getEditorNodePosition(mounted, "citation");
    const citation = mounted.view.dom.querySelector<HTMLElement>('[data-type="citation"]')!;
    dispatchMouseEvent(citation, "mousedown", { button: 0 });
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(position + 1);
  });

  it("marks delimiters and keys apart from affixes", async () => {
    const mounted = await mountEditor("A [*see* @{doe 2026}{ii}, p. 3; -@roe] b\n");
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "citation"));
    const read = (selector: string) =>
      [...mounted.view.dom.querySelectorAll(selector)].map((span) => span.textContent);
    expect(read(".leafdown-source-projection__marker")).toEqual([
      "[",
      "@",
      "{",
      "}",
      "{",
      "}",
      ";",
      "-@",
      "]",
    ]);
    expect(read(".leafdown-source-projection__content--citation-key")).toEqual(["doe 2026", "roe"]);
  });

  it("commits an edited group as one citation with Undo and Redo", async () => {
    const mounted = await mountEditor(markdown);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "citation") + 1);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "p. 3") + 4);
    typeText(mounted.view, "-4");
    setSelectionAtDocumentEnd(mounted.view);
    const edited = markdown.replace("p. 3", "p. 3-4");
    expect(readCitations(mounted)).toEqual(["[see @doe, p. 3-4; -@roe]"]);
    expect(mounted.getMarkdown()).toBe(edited);
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(markdown);
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(edited);
  });

  it("finalizes an edit left in the source when the document is saved", async () => {
    const mounted = await mountEditor(markdown);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "citation") + 1);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "@doe") + 4);
    typeText(mounted.view, "99");
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    const saved = mounted.getMarkdown();
    expect(saved).toBe(markdown.replace("@doe", "@doe99"));
    const reopened = await mountEditor(saved);
    expect(readCitations(reopened)).toEqual(["[see @doe99, p. 3; -@roe]"]);
  });

  it.each([
    ["deletes the closing bracket", "; -@roe]", "; -@roe", "Before [see @doe, p. 3; -@roe after"],
    ["empties an item", "; -@roe]", ";]", raw`Before [see @doe, p. 3;] after`],
    ["escapes the key", "@doe", raw`\@doe`, raw`Before [see \@doe, p. 3; -@roe] after`],
  ])("commits source that %s as literal text", async (_name, from, to, saved) => {
    const mounted = await mountEditor(markdown);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "citation") + 1);
    const start = getEditorTextPosition(mounted, from);
    setTextSelection(mounted.view, start, start + from.length);
    typeText(mounted.view, to);
    finalizeSourceProjection(mounted.view);
    setSelectionAtDocumentEnd(mounted.view);
    expect(readCitations(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe(`${saved}\n\nEnd\n`);
    const reopened = await mountEditor(mounted.getMarkdown());
    expect(readCitations(reopened)).toEqual([]);
    expect(reopened.getMarkdown()).toBe(mounted.getMarkdown());
  });

  it("commits a group whose label a definition names as literal text", async () => {
    const mounted = await mountEditor("Before [@doe] after\n\n[@roe]: https://example.com\n");
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "citation") + 1);
    const start = getEditorTextPosition(mounted, "doe");
    setTextSelection(mounted.view, start, start + 3);
    typeText(mounted.view, "roe");
    setSelectionAtDocumentEnd(mounted.view);
    expect(readCitations(mounted)).toEqual([]);
    const reopened = await mountEditor(mounted.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  });

  it("edits multiline source and keeps its continuation", async () => {
    const source = "> Text [see\n> @doe, p. 3] end\n";
    const mounted = await mountEditor(source);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "citation"));
    expect(getEditorTextContent(mounted)).toContain("[see\n@doe, p. 3]");
    const start = getEditorTextPosition(mounted, "3]");
    setTextSelection(mounted.view, start, start + 1);
    typeText(mounted.view, "4");
    setSelectionAtDocumentEnd(mounted.view);
    expect(mounted.getMarkdown()).toBe(source.replace("p. 3", "p. 4"));
  });

  it("turns typed complete source into a citation after the caret leaves", async () => {
    const mounted = await mountEditor("Start");
    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, " [see @doe, p. 3]");
    expect(readCitations(mounted)).toEqual([]);
    setTextSelection(mounted.view, 1);
    expect(readCitations(mounted)).toEqual(["[see @doe, p. 3]"]);
    expect(mounted.getMarkdown()).toBe("Start [see @doe, p. 3]\n");
  });

  it.each(["[me@example.com]", "[see the appendix]", "[@doe;]", raw`\[@doe]`])(
    "leaves typed %s as text",
    async (text) => {
      const mounted = await mountEditor("Start");
      setSelectionAtDocumentEnd(mounted.view);
      typeText(mounted.view, ` ${text}`);
      setTextSelection(mounted.view, 1);
      expect(readCitations(mounted)).toEqual([]);
      const reopened = await mountEditor(mounted.getMarkdown());
      expect(readCitations(reopened)).toEqual([]);
    },
  );

  it("turns a plain-text paste into a citation and restores it with Undo and Redo", async () => {
    const mounted = await mountEditor("Start");
    setSelectionAtDocumentEnd(mounted.view);
    dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_PLAIN_MIME_TYPE]: "[-@roe2024; @smith2025]",
    });
    setTextSelection(mounted.view, 1);
    expect(readCitations(mounted)).toEqual(["[-@roe2024; @smith2025]"]);
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe("Start\n");
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe("Start[-@roe2024; @smith2025]\n");
  });

  it("preserves the citation through native copy and rich paste", async () => {
    const copied = await mountEditor(`A ${group} b`);
    const clipboard = createClipboardData();
    setTextSelection(copied.view, 1, copied.view.state.doc.content.size - 1);
    dispatchClipboardEvent(copied.view.dom, "copy", clipboard);
    expect(clipboard.getData(TEXT_PLAIN_MIME_TYPE).trim()).toBe(`A ${group} b`);

    const pasted = await mountEditor("");
    dispatchClipboardEvent(pasted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: clipboard.getData(TEXT_HTML_MIME_TYPE),
      [TEXT_PLAIN_MIME_TYPE]: clipboard.getData(TEXT_PLAIN_MIME_TYPE),
    });
    expect(readCitations(pasted)).toEqual([group]);
    expect(pasted.getMarkdown()).toBe(`A ${group} b\n`);
  });

  it("copies projected source as the text it spells", async () => {
    const mounted = await mountEditor(markdown);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "citation") + 1);
    const start = getEditorTextPosition(mounted, "@doe");
    setTextSelection(mounted.view, start, start + 4);
    const clipboard = createClipboardData();
    dispatchClipboardEvent(mounted.view.dom, "copy", clipboard);
    expect(clipboard.getData(TEXT_PLAIN_MIME_TYPE)).toBe("@doe");
    expect(mounted.getMarkdown()).toBe(markdown);
  });

  it("converts a literal group at once when its escape is deleted", async () => {
    const mounted = await mountEditor(raw`A [\@doe, p. 3] b` + "\n");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "doe"));
    expect(getEditorTextContent(mounted)).toBe(raw`A [\@doe, p. 3] b`);
    const escape = getEditorTextPosition(mounted, "\\");
    setTextSelection(mounted.view, escape + 1);
    runKeyDownHandlers(mounted.view, "Backspace");
    expect(getEditorTextContent(mounted)).toBe("A [@doe, p. 3] b");
    expect(mounted.getMarkdown()).toBe("A [@doe, p. 3] b\n");
    setSelectionAtDocumentEnd(mounted.view);
    expect(readCitations(mounted)).toEqual(["[@doe, p. 3]"]);
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    setSelectionAtDocumentEnd(mounted.view);
    expect(mounted.getMarkdown()).toBe(raw`A [\@doe, p. 3] b` + "\n");
  });

  it("projects a citation beside another object as one run and commits both", async () => {
    const mounted = await mountEditor("A [@doe]&copy; b\n");
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "citation") + 1);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(
      [...mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker")].map(
        (span) => span.textContent,
      ),
    ).toEqual(["[", "@", "]", "&copy;"]);
    typeText(mounted.view, " ");
    setSelectionAtDocumentEnd(mounted.view);
    expect(readCitations(mounted)).toEqual(["[@doe]"]);
    expect(mounted.getMarkdown()).toBe("A [@doe] &copy; b\n");
  });

  it("projects two adjacent citations together from the caret between them", async () => {
    const mounted = await mountEditor("A [@doe][-@roe] b\n");
    const seam = getEditorNodePosition(
      mounted,
      "citation",
      (node) => node.attrs.value === "[-@roe]",
    );
    setTextSelection(mounted.view, seam);
    expect(mounted.view.dom.querySelector('[data-type="citation"]')).toBeNull();
    expect(mounted.view.state.doc.textBetween(1, mounted.view.state.selection.from)).toBe(
      "A [@doe]",
    );
    typeText(mounted.view, " ");
    setSelectionAtDocumentEnd(mounted.view);
    expect(readCitations(mounted)).toEqual(["[@doe]", "[-@roe]"]);
    expect(mounted.getMarkdown()).toBe("A [@doe] [-@roe] b\n");
  });
});
