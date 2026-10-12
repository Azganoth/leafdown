// @vitest-environment happy-dom

import { Schema, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { liftTarget } from "@milkdown/kit/prose/transform";
import { EditorView, type DecorationSet } from "@milkdown/kit/prose/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createCodeBlockDecorations } from "../utils/codeBlockDecorations";
import { createLeafdownHighlightParser, type LeafdownHighlightParser } from "../utils/highlighting";
import { createCodeHighlightPlugin, leafdownCodeHighlightPluginKey } from "./codeHighlight";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block", toDOM: () => ["p", 0] },
    code_block: {
      content: "text*",
      group: "block",
      code: true,
      marks: "",
      attrs: { language: { default: "" } },
      toDOM: () => ["pre", ["code", 0]],
    },
    blockquote: { content: "block+", group: "block", toDOM: () => ["blockquote", 0] },
  },
});

const paragraph = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
const code = (language: string, text: string) =>
  schema.nodes.code_block.create({ language }, text ? schema.text(text) : null);
const quote = (...content: ProseMirrorNode[]) => schema.nodes.blockquote.create(null, content);

const createDoc = () =>
  schema.nodes.doc.create(null, [
    paragraph("Intro"),
    code("ts", "const first: number = 1;\nexport { first };"),
    paragraph("Middle"),
    code("rust", "fn main() {\n    let value = 2;\n}"),
    quote(code("bash", 'echo "quoted"'), paragraph("Quoted")),
    code("", "plain text"),
    code("json", '{ "last": true }'),
    paragraph("End"),
  ]);

let shiki: LeafdownHighlightParser;

beforeAll(async () => {
  shiki = await createLeafdownHighlightParser();
});

const setup = () => {
  const parser = vi.fn<LeafdownHighlightParser>((options) => shiki(options));
  const state = EditorState.create({
    doc: createDoc(),
    plugins: [createCodeHighlightPlugin(parser)],
  });

  parser.mockClear();

  return { parser, state };
};

const findPositions = (doc: ProseMirrorNode, predicate: (node: ProseMirrorNode) => boolean) => {
  const positions: number[] = [];

  doc.descendants((node, position) => {
    if (predicate(node)) {
      positions.push(position);
    }
  });

  return positions;
};

const codeBlockAt = (doc: ProseMirrorNode, index: number) =>
  findPositions(doc, (node) => node.type.name === "code_block")[index];

const paragraphAt = (doc: ProseMirrorNode, text: string) =>
  findPositions(doc, (node) => node.type.name === "paragraph" && node.textContent === text)[0];

const topLevelTypes = (doc: ProseMirrorNode) => doc.children.map((node) => node.type.name);

const describeDecorations = (decorations: DecorationSet | undefined) =>
  (decorations?.find() ?? [])
    .map(
      (decoration) =>
        `${decoration.from}-${decoration.to} ${JSON.stringify(
          (decoration as unknown as { type: { attrs: unknown } }).type.attrs,
        )}`,
    )
    .toSorted();

const rebuildDecorations = (doc: ProseMirrorNode) =>
  createCodeBlockDecorations(doc, (node, position) =>
    shiki({
      content: node.textContent,
      language: (node.attrs.language as string) || undefined,
      pos: position,
      size: node.nodeSize,
    }),
  );

const applyAndCompare = (state: EditorState, transaction: Transaction) => {
  const next = state.apply(transaction);

  expect(describeDecorations(leafdownCodeHighlightPluginKey.getState(next)?.decorations)).toEqual(
    describeDecorations(rebuildDecorations(next.doc)),
  );

  return next;
};

const highlightedPositions = (parser: ReturnType<typeof setup>["parser"]) =>
  parser.mock.calls.map(([options]) => options.pos);

describe("code highlighting", () => {
  it("highlights every code block, nested ones included, when the document is created", () => {
    const parser = vi.fn<LeafdownHighlightParser>((options) => shiki(options));
    const state = EditorState.create({
      doc: createDoc(),
      plugins: [createCodeHighlightPlugin(parser)],
    });

    expect(highlightedPositions(parser)).toEqual(
      findPositions(state.doc, (node) => node.type.name === "code_block"),
    );
    expect(
      describeDecorations(leafdownCodeHighlightPluginKey.getState(state)?.decorations),
    ).toContainEqual(expect.stringContaining("--shiki-light"));
  });

  it("highlights nothing for an edit outside code blocks", () => {
    const { parser, state } = setup();
    const middle = paragraphAt(state.doc, "Middle");
    let next = applyAndCompare(state, state.tr.insertText(" typed", middle + 1));

    next = applyAndCompare(next, next.tr.insertText("!", paragraphAt(next.doc, "Quoted") + 1));
    applyAndCompare(next, next.tr.insertText("!", paragraphAt(next.doc, "End") + 4));

    expect(parser).not.toHaveBeenCalled();
  });

  it("highlights only the code block an edit changes", () => {
    const { parser, state } = setup();
    const rust = codeBlockAt(state.doc, 1);
    let next = applyAndCompare(state, state.tr.insertText("    let added = 3;\n", rust + 13));

    expect(highlightedPositions(parser)).toEqual([rust]);

    parser.mockClear();
    const quoted = codeBlockAt(next.doc, 2);
    next = applyAndCompare(next, next.tr.delete(quoted + 1, quoted + 5));

    expect(highlightedPositions(parser)).toEqual([quoted]);

    parser.mockClear();
    const last = codeBlockAt(next.doc, 4);
    applyAndCompare(next, next.tr.delete(last + 1, last + next.doc.nodeAt(last)!.nodeSize - 1));

    expect(highlightedPositions(parser)).toEqual([last]);
  });

  it("keeps blocks highlighted when paragraphs between them are inserted or removed", () => {
    const { parser, state } = setup();
    const rust = codeBlockAt(state.doc, 1);
    let next = applyAndCompare(state, state.tr.insert(rust, paragraph("Inserted")));
    const middle = paragraphAt(next.doc, "Middle");

    next = applyAndCompare(
      next,
      next.tr.delete(middle, middle + next.doc.nodeAt(middle)!.nodeSize),
    );
    const inserted = paragraphAt(next.doc, "Inserted");
    applyAndCompare(next, next.tr.delete(inserted, inserted + next.doc.nodeAt(inserted)!.nodeSize));

    expect(parser).not.toHaveBeenCalled();
  });

  it("highlights the joined block once when a deletion spans code blocks", () => {
    const { parser, state } = setup();
    const from = codeBlockAt(state.doc, 0) + 7;
    const to = codeBlockAt(state.doc, 1) + 4;
    const next = applyAndCompare(state, state.tr.delete(from, to));

    expect(next.doc.nodeAt(codeBlockAt(next.doc, 0))?.textContent).toBe(
      "const main() {\n    let value = 2;\n}",
    );
    expect(highlightedPositions(parser)).toEqual([codeBlockAt(next.doc, 0)]);
  });

  it("highlights both halves of a split code block and the block two others join into", () => {
    const { state } = setup();
    let next = applyAndCompare(state, state.tr.split(codeBlockAt(state.doc, 0) + 26));

    expect(next.doc.nodeAt(codeBlockAt(next.doc, 1))?.textContent).toBe("export { first };");

    next = applyAndCompare(next, next.tr.join(codeBlockAt(next.doc, 1)));
    const json = codeBlockAt(next.doc, 4);
    applyAndCompare(next, next.tr.join(json));
  });

  it("highlights a code block again when its language changes", () => {
    const { parser, state } = setup();
    const plain = codeBlockAt(state.doc, 3);
    let next = applyAndCompare(
      state,
      state.tr.setNodeMarkup(plain, undefined, { language: "typescript" }),
    );

    expect(highlightedPositions(parser)).toEqual([plain]);

    parser.mockClear();
    next = applyAndCompare(next, next.tr.setNodeAttribute(plain, "language", "rust"));
    applyAndCompare(next, next.tr.setNodeAttribute(plain, "language", ""));

    expect(highlightedPositions(parser)).toEqual([plain, plain]);
  });

  it("clears a code block turned into a paragraph and highlights a paragraph turned into code", () => {
    const { parser, state } = setup();
    const ts = codeBlockAt(state.doc, 0);
    let next = applyAndCompare(
      state,
      state.tr.setBlockType(ts + 1, ts + 1, schema.nodes.paragraph),
    );

    expect(parser).not.toHaveBeenCalled();

    const middle = paragraphAt(next.doc, "Middle");
    next = applyAndCompare(
      next,
      next.tr.setBlockType(middle + 1, middle + 1, schema.nodes.code_block, { language: "ts" }),
    );

    expect(highlightedPositions(parser)).toEqual([middle]);
  });

  it("keeps code blocks highlighted when they are wrapped in or lifted out of a quote", () => {
    const { state } = setup();
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

  it("highlights each block a multi-step transaction changes and none it only moves", () => {
    const { parser, state } = setup();
    const transaction = state.tr
      .insertText("// ", codeBlockAt(state.doc, 3) + 1)
      .insertText("Before ", paragraphAt(state.doc, "Intro") + 1);
    transaction.insertText("// ", codeBlockAt(transaction.doc, 0) + 1);
    const next = applyAndCompare(state, transaction);

    expect(highlightedPositions(parser).toSorted((a, b) => a - b)).toEqual([
      codeBlockAt(next.doc, 0),
      codeBlockAt(next.doc, 3),
    ]);
  });

  it("highlights every block when the whole document is replaced", () => {
    const { parser, state } = setup();
    const next = applyAndCompare(
      state,
      state.tr.replaceWith(0, state.doc.content.size, createDoc().content),
    );

    expect(highlightedPositions(parser)).toEqual(
      findPositions(next.doc, (node) => node.type.name === "code_block"),
    );
  });

  it("keeps the decorations of a transaction that changes no content", () => {
    const { parser, state } = setup();
    const next = state.apply(state.tr.setMeta("leafdown-test", true));

    expect(leafdownCodeHighlightPluginKey.getState(next)).toBe(
      leafdownCodeHighlightPluginKey.getState(state),
    );
    expect(parser).not.toHaveBeenCalled();
  });
});

const longCode = (language: string, lines: number) =>
  code(
    language,
    Array.from({ length: lines }, (_, line) => `const line${line} = ${line};`).join("\n"),
  );

const createLongDoc = () =>
  schema.nodes.doc.create(null, [
    paragraph("Intro"),
    longCode("ts", 120),
    paragraph("Middle"),
    code("rust", "fn main() {\n    let value = 2;\n}"),
    quote(code("bash", 'echo "quoted"'), paragraph("Quoted")),
    code("", "plain text"),
    code("json", '{ "last": true }'),
    code("ts", "let edited = 1;"),
    paragraph("End"),
  ]);

const mountLongDoc = () => {
  const parser = vi.fn<LeafdownHighlightParser>((options) => shiki(options));
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: createLongDoc(),
      plugins: [createCodeHighlightPlugin(parser)],
    }),
  });

  views.push(view);

  return { parser, view };
};

const views: EditorView[] = [];

const pendingPositions = (state: EditorState) =>
  leafdownCodeHighlightPluginKey.getState(state)?.pending;

const expectFullyHighlighted = (state: EditorState) => {
  expect(pendingPositions(state)).toEqual([]);
  expect(describeDecorations(leafdownCodeHighlightPluginKey.getState(state)?.decorations)).toEqual(
    describeDecorations(rebuildDecorations(state.doc)),
  );
};

describe("code highlighting after the document is shown", () => {
  afterEach(() => {
    views.splice(0).forEach((view) => view.destroy());
    vi.useRealTimers();
  });

  it("highlights the first lines at once and the remaining blocks once the editor is idle", () => {
    vi.useFakeTimers();
    const { parser, view } = mountLongDoc();
    const blocks = findPositions(view.state.doc, (node) => node.type.name === "code_block");

    expect(highlightedPositions(parser)).toEqual([blocks[0]]);
    expect(pendingPositions(view.state)).toEqual(blocks.slice(1));

    parser.mockClear();
    vi.runAllTimers();

    expect(highlightedPositions(parser)).toEqual(blocks.slice(1));
    expectFullyHighlighted(view.state);
  });

  it("highlights blocks edited, retyped, added, moved, or removed while others are pending", () => {
    vi.useFakeTimers();
    const { view } = mountLongDoc();
    const at = (index: number) => codeBlockAt(view.state.doc, index);

    view.dispatch(view.state.tr.insertText("    let added = 3;\n", at(1) + 13));
    view.dispatch(view.state.tr.setNodeAttribute(at(3), "language", "typescript"));
    view.dispatch(view.state.tr.setNodeMarkup(at(4), undefined, { language: "rust" }));
    view.dispatch(view.state.tr.insert(at(1), code("bash", "ls -la")));
    view.dispatch(view.state.tr.delete(at(5), at(5) + view.state.doc.nodeAt(at(5))!.nodeSize));
    const wrapped = view.state.doc
      .resolve(at(1) + 1)
      .blockRange(view.state.doc.resolve(at(2) + 1))!;
    view.dispatch(view.state.tr.wrap(wrapped, [{ type: schema.nodes.blockquote }]));
    view.dispatch(view.state.tr.insert(at(3), paragraph("Before")));
    view.dispatch(view.state.tr.setBlockType(at(5) + 1, at(5) + 1, schema.nodes.paragraph));

    expect(pendingPositions(view.state)!.length).toBeGreaterThan(0);

    vi.runAllTimers();

    expectFullyHighlighted(view.state);
  });

  it("highlights nothing more once the editor is destroyed", () => {
    vi.useFakeTimers();
    const { parser, view } = mountLongDoc();

    parser.mockClear();
    view.destroy();
    vi.runAllTimers();

    expect(parser).not.toHaveBeenCalled();
  });

  it("starts from the block at the top of the viewport", () => {
    vi.useFakeTimers();
    const { parser, view } = mountLongDoc();
    const blocks = findPositions(view.state.doc, (node) => node.type.name === "code_block");

    vi.spyOn(view.dom, "getBoundingClientRect").mockReturnValue(new DOMRect(0, -400, 800, 2000));
    vi.spyOn(view, "posAtCoords").mockReturnValue({ pos: blocks[3] + 2, inside: -1 });
    parser.mockClear();
    vi.runAllTimers();

    expect(highlightedPositions(parser)).toEqual([...blocks.slice(3), blocks[1], blocks[2]]);
  });
});
