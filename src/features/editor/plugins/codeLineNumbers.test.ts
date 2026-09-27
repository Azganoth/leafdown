// @vitest-environment happy-dom

import { undoDepth } from "@milkdown/kit/prose/history";
import type { EditorView } from "@milkdown/kit/prose/view";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { dispatchClipboardEvent, parseClipboardHtml } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { setTextSelection } from "@/test/utils/prosemirror";

import { getEditorDocumentStatus } from "../utils/documentStatus";
import { areCodeLineNumbersEnabled, setCodeLineNumbersEnabled } from "./codeLineNumbers";

const mountEditor = setupMilkdownEditorMount();

const CODE = "const first = 1;\n\nconst third = 3;";
const CODE_BLOCKS_MARKDOWN = `\`\`\`ts\n${CODE}\n\`\`\`\n\n\`\`\`\n\`\`\`\n\nAfter\n`;

const getCodeBlocks = (view: EditorView) => [...view.dom.querySelectorAll("pre")];

const getLineBreaks = (block: Element) => [
  ...block.querySelectorAll<HTMLElement>(".leafdown-code-line-break"),
];

// The block draws line 1 and each line ending draws the line it opens.
const getLineNumbers = (block: Element) =>
  block.classList.contains("leafdown-code-block--numbered")
    ? ["1", ...getLineBreaks(block).map((lineBreak) => lineBreak.dataset.nextLineNumber)]
    : [];

const getCodeBlockRange = (view: EditorView, index: number) => {
  const ranges: { from: number; to: number }[] = [];

  view.state.doc.descendants((node, position) => {
    if (node.type.name === "code_block") {
      ranges.push({ from: position + 1, to: position + node.nodeSize - 1 });
    }
  });

  return ranges[index];
};

describe("code block line numbers", () => {
  it("leaves code blocks unnumbered while the setting is off", async () => {
    const mounted = await mountEditor(CODE_BLOCKS_MARKDOWN);

    expect(areCodeLineNumbersEnabled(mounted.view.state)).toBe(false);
    expect(mounted.view.dom.querySelector(".leafdown-code-block--numbered")).toBeNull();
    expect(mounted.view.dom.querySelector(".leafdown-code-line-break")).toBeNull();
  });

  it("numbers every logical line from 1, including empty lines and an empty block", async () => {
    const mounted = await mountEditor(CODE_BLOCKS_MARKDOWN, { displayCodeBlockLineNumbers: true });
    const [code, empty] = getCodeBlocks(mounted.view);

    expect(getLineNumbers(code)).toEqual(["1", "2", "3"]);
    expect(getLineNumbers(empty)).toEqual(["1"]);
    expect(code.style.getPropertyValue("--leafdown-code-line-number-digits").trim()).toBe("2");
  });

  it("numbers an empty last line from the line ending before it", async () => {
    const mounted = await mountEditor("```\nvalue\n\n```\n", { displayCodeBlockLineNumbers: true });

    expect(mounted.view.state.doc.firstChild?.textContent).toBe("value\n");
    expect(getLineNumbers(getCodeBlocks(mounted.view)[0])).toEqual(["1", "2"]);
  });

  it("draws each later number from the line ending that opens its line", async () => {
    const mounted = await mountEditor(CODE_BLOCKS_MARKDOWN, { displayCodeBlockLineNumbers: true });
    const { from } = getCodeBlockRange(mounted.view, 0);
    const lineBreaks = getLineBreaks(getCodeBlocks(mounted.view)[0]);

    expect(lineBreaks.map((lineBreak) => lineBreak.textContent)).toEqual(["\n", "\n"]);
    expect(lineBreaks.map((lineBreak) => mounted.view.posAtDOM(lineBreak, 0))).toEqual([
      from + CODE.indexOf("\n"),
      from + CODE.indexOf("\n") + 1,
    ]);
  });

  it("keeps the numbers out of the code text and the accessibility tree", async () => {
    const mounted = await mountEditor(CODE_BLOCKS_MARKDOWN, { displayCodeBlockLineNumbers: true });
    const editorCss = readFileSync(
      resolve(process.cwd(), "src/features/editor/components/milkdown-editor.css"),
      "utf8",
    );

    expect(getCodeBlocks(mounted.view)[0].textContent).toBe(CODE);
    expect(editorCss).toContain('content: "1" / "";');
    expect(editorCss).toContain('content: attr(data-next-line-number) / "";');
  });

  it("renumbers a block as its lines change and widens the gutter past 99 lines", async () => {
    const mounted = await mountEditor("```\nline\n```\n", { displayCodeBlockLineNumbers: true });

    mounted.view.dispatch(
      mounted.view.state.tr.insertText("\nnext", getCodeBlockRange(mounted.view, 0).to),
    );

    expect(getLineNumbers(getCodeBlocks(mounted.view)[0])).toEqual(["1", "2"]);

    mounted.view.dispatch(
      mounted.view.state.tr.insertText("\nline".repeat(98), getCodeBlockRange(mounted.view, 0).to),
    );

    const [widened] = getCodeBlocks(mounted.view);
    expect(getLineNumbers(widened).at(-1)).toBe("100");
    expect(widened.style.getPropertyValue("--leafdown-code-line-number-digits").trim()).toBe("3");
  });

  it("toggles an open document without changing, dirtying, or recording it", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(CODE_BLOCKS_MARKDOWN, { onContentChanged });
    const markdown = mounted.getMarkdown();
    const doc = mounted.view.state.doc;
    const status = getEditorDocumentStatus(mounted.view.state);

    setCodeLineNumbersEnabled(mounted.view, true);

    expect(getLineNumbers(getCodeBlocks(mounted.view)[0])).toEqual(["1", "2", "3"]);

    setCodeLineNumbersEnabled(mounted.view, false);

    expect(mounted.view.dom.querySelector(".leafdown-code-block--numbered")).toBeNull();
    expect(mounted.view.dom.querySelector(".leafdown-code-line-break")).toBeNull();
    expect(mounted.view.state.doc).toBe(doc);
    expect(mounted.getMarkdown()).toBe(markdown);
    expect(getEditorDocumentStatus(mounted.view.state)).toEqual(status);
    expect(undoDepth(mounted.view.state)).toBe(0);
    expect(onContentChanged).not.toHaveBeenCalled();
  });

  it.each(["copy", "cut"] as const)("leaves the numbers out of %s", async (type) => {
    const mounted = await mountEditor(CODE_BLOCKS_MARKDOWN, { displayCodeBlockLineNumbers: true });
    const { from, to } = getCodeBlockRange(mounted.view, 0);

    setTextSelection(mounted.view, from, to);

    const { clipboardData } = dispatchClipboardEvent(mounted.view.dom, type);

    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toBe(CODE);
    expect(parseClipboardHtml(clipboardData).textContent).toBe(CODE);
  });
});
