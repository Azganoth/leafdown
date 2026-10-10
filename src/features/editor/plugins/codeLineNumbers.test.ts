// @vitest-environment happy-dom

import { undoDepth } from "@milkdown/kit/prose/history";
import { Schema, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { liftTarget } from "@milkdown/kit/prose/transform";
import { Decoration, type EditorView } from "@milkdown/kit/prose/view";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { dispatchClipboardEvent, parseClipboardHtml } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { setTextSelection } from "@/test/utils/prosemirror";

import { getEditorDocumentStatus } from "../utils/documentStatus";
import {
  areCodeLineNumbersEnabled,
  createCodeLineNumbersPlugin,
  leafdownCodeLineNumbersPluginKey,
  setCodeLineNumbersEnabled,
} from "./codeLineNumbers";

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

    expect(getCodeBlocks(mounted.view)[0].querySelector("code")?.textContent).toBe(CODE);
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

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    code_block: { content: "text*", group: "block", code: true, marks: "" },
    blockquote: { content: "block+", group: "block" },
  },
});

const paragraph = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
const code = (text: string) =>
  schema.nodes.code_block.create(null, text ? schema.text(text) : null);
const quote = (...content: ProseMirrorNode[]) => schema.nodes.blockquote.create(null, content);

const createDoc = () =>
  schema.nodes.doc.create(null, [
    paragraph("Intro"),
    code("first\nsecond"),
    paragraph("Middle"),
    code("one\n\nthree\n"),
    quote(code("quoted\nline"), paragraph("Quoted")),
    code(""),
    code(Array.from({ length: 99 }, (_, index) => `line ${index + 1}`).join("\n")),
    paragraph("End"),
  ]);

const findPositions = (doc: ProseMirrorNode, predicate: (node: ProseMirrorNode) => boolean) => {
  const positions: number[] = [];

  doc.descendants((node, position) => {
    if (predicate(node)) {
      positions.push(position);
    }
  });

  return positions;
};

const codeBlockPositions = (doc: ProseMirrorNode) =>
  findPositions(doc, (node) => node.type.name === "code_block");

const codeBlockAt = (doc: ProseMirrorNode, index: number) => codeBlockPositions(doc)[index];

const paragraphAt = (doc: ProseMirrorNode, text: string) =>
  findPositions(doc, (node) => node.type.name === "paragraph" && node.textContent === text)[0];

const topLevelTypes = (doc: ProseMirrorNode) => doc.children.map((node) => node.type.name);

const createState = (enabled: boolean, doc = createDoc()) =>
  EditorState.create({ doc, plugins: [createCodeLineNumbersPlugin(() => enabled)] });

const describeDecorations = (state: EditorState) =>
  (leafdownCodeLineNumbersPluginKey.getState(state)?.decorations.find() ?? [])
    .map(
      (decoration) =>
        `${decoration.from}-${decoration.to} ${JSON.stringify(
          (decoration as unknown as { type: { attrs: unknown } }).type.attrs,
        )}`,
    )
    .toSorted();

// Each numbered block gets one node decoration, so those created while applying a transaction
// name the blocks it numbered.
let numbered: number[] = [];

const applyAndCompare = (state: EditorState, transaction: Transaction) => {
  const numbering = vi.spyOn(Decoration, "node");
  const next = state.apply(transaction);

  numbered.push(...numbering.mock.calls.map(([from]) => from));
  numbering.mockRestore();

  expect(describeDecorations(next)).toEqual(
    describeDecorations(createState(areCodeLineNumbersEnabled(next), next.doc)),
  );

  return next;
};

describe("code block line numbers across edits", () => {
  beforeEach(() => {
    numbered = [];
  });

  it("numbers no block for an edit outside code blocks", () => {
    const state = createState(true);
    let next = applyAndCompare(
      state,
      state.tr.insertText(" typed", paragraphAt(state.doc, "Middle") + 1),
    );

    next = applyAndCompare(next, next.tr.insertText("!", paragraphAt(next.doc, "Quoted") + 1));
    applyAndCompare(next, next.tr.insertText("!", paragraphAt(next.doc, "End") + 4));

    expect(numbered).toEqual([]);
  });

  it("keeps blocks numbered when paragraphs between them are inserted or removed", () => {
    const state = createState(true);
    let next = applyAndCompare(state, state.tr.insert(codeBlockAt(state.doc, 1), paragraph("New")));
    const middle = paragraphAt(next.doc, "Middle");

    next = applyAndCompare(
      next,
      next.tr.delete(middle, middle + next.doc.nodeAt(middle)!.nodeSize),
    );
    const inserted = paragraphAt(next.doc, "New");
    applyAndCompare(next, next.tr.delete(inserted, inserted + next.doc.nodeAt(inserted)!.nodeSize));

    expect(numbered).toEqual([]);
  });

  it("renumbers only the code block an edit changes", () => {
    const state = createState(true);
    const second = codeBlockAt(state.doc, 1);
    let next = applyAndCompare(state, state.tr.insertText("\ntwo", second + 4));

    expect(next.doc.nodeAt(second)?.textContent).toBe("one\ntwo\n\nthree\n");
    expect(numbered).toEqual([second]);

    numbered = [];
    const quoted = codeBlockAt(next.doc, 2);
    next = applyAndCompare(next, next.tr.delete(quoted + 7, quoted + 8));

    expect(next.doc.nodeAt(quoted)?.textContent).toBe("quotedline");
    expect(numbered).toEqual([quoted]);

    numbered = [];
    const empty = codeBlockAt(next.doc, 3);
    next = applyAndCompare(next, next.tr.insertText("\n", empty + 1));

    expect(numbered).toEqual([empty]);

    numbered = [];
    const long = codeBlockAt(next.doc, 4);
    applyAndCompare(
      next,
      next.tr.insertText("\nline 100", long + next.doc.nodeAt(long)!.nodeSize - 1),
    );

    expect(numbered).toEqual([long]);
  });

  it("numbers the joined block once when a deletion spans code blocks", () => {
    const state = createState(true);
    const from = codeBlockAt(state.doc, 0) + 7;
    const to = codeBlockAt(state.doc, 1) + 4;
    const next = applyAndCompare(state, state.tr.delete(from, to));

    expect(next.doc.nodeAt(codeBlockAt(next.doc, 0))?.textContent).toBe("first\n\n\nthree\n");
    expect(numbered).toEqual([codeBlockAt(next.doc, 0)]);
  });

  it("numbers both halves of a split code block and the block two others join into", () => {
    const state = createState(true);
    let next = applyAndCompare(state, state.tr.split(codeBlockAt(state.doc, 1) + 5));

    expect(next.doc.nodeAt(codeBlockAt(next.doc, 2))?.textContent).toBe("\nthree\n");

    next = applyAndCompare(next, next.tr.join(codeBlockAt(next.doc, 2)));
    applyAndCompare(next, next.tr.join(codeBlockAt(next.doc, 4)));
  });

  it("clears a code block turned into a paragraph and numbers a paragraph turned into code", () => {
    const state = createState(true);
    const first = codeBlockAt(state.doc, 0);
    let next = applyAndCompare(
      state,
      state.tr.setBlockType(first + 1, first + 1, schema.nodes.paragraph),
    );

    expect(numbered).toEqual([]);

    const middle = paragraphAt(next.doc, "Middle");
    next = applyAndCompare(
      next,
      next.tr.setBlockType(middle + 1, middle + 1, schema.nodes.code_block),
    );

    expect(numbered).toEqual([middle]);
  });

  it("keeps code blocks numbered when they are wrapped in or lifted out of a quote", () => {
    const state = createState(true);
    const doc = state.doc;
    const range = doc
      .resolve(codeBlockAt(doc, 0) + 1)
      .blockRange(doc.resolve(codeBlockAt(doc, 1) + 1))!;
    let next = applyAndCompare(state, state.tr.wrap(range, [{ type: schema.nodes.blockquote }]));

    expect(topLevelTypes(next.doc).slice(0, 3)).toEqual(["paragraph", "blockquote", "blockquote"]);

    const quoted = next.doc.resolve(codeBlockAt(next.doc, 2) + 1).blockRange()!;
    next = applyAndCompare(next, next.tr.lift(quoted, liftTarget(quoted)!));

    const wrapped = next.doc
      .resolve(codeBlockAt(next.doc, 0) + 1)
      .blockRange(next.doc.resolve(codeBlockAt(next.doc, 1) + 1))!;
    next = applyAndCompare(next, next.tr.lift(wrapped, liftTarget(wrapped)!));

    expect(topLevelTypes(next.doc).slice(0, 6)).toEqual([
      "paragraph",
      "code_block",
      "paragraph",
      "code_block",
      "code_block",
      "blockquote",
    ]);
  });

  it("numbers every block when the whole document is replaced", () => {
    const state = createState(true);
    const next = applyAndCompare(
      state,
      state.tr.replaceWith(0, state.doc.content.size, createDoc().content),
    );

    expect(numbered).toEqual(codeBlockPositions(next.doc));
  });

  it("does no numbering while off and numbers the edited document when turned on", () => {
    const state = createState(false);
    let next = applyAndCompare(
      state,
      state.tr.insertText("\nadded", codeBlockAt(state.doc, 0) + 6),
    );

    expect(numbered).toEqual([]);
    expect(describeDecorations(next)).toEqual([]);

    next = applyAndCompare(next, next.tr.setMeta(leafdownCodeLineNumbersPluginKey, true));

    expect(numbered).toEqual(codeBlockPositions(next.doc));

    next = applyAndCompare(next, next.tr.insertText("\nmore", codeBlockAt(next.doc, 0) + 6));
    next = applyAndCompare(next, next.tr.setMeta(leafdownCodeLineNumbersPluginKey, false));

    expect(describeDecorations(next)).toEqual([]);
  });

  it("keeps the decorations of a transaction that changes no content", () => {
    const state = createState(true);
    const next = applyAndCompare(state, state.tr.setMeta("leafdown-test", true));

    expect(leafdownCodeLineNumbersPluginKey.getState(next)).toBe(
      leafdownCodeLineNumbersPluginKey.getState(state),
    );
    expect(numbered).toEqual([]);
  });
});
