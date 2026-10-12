import { Fragment, Schema, Slice, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { liftTarget } from "@milkdown/kit/prose/transform";
import { Decoration, type DecorationSet } from "@milkdown/kit/prose/view";
import { describe, expect, it, vi } from "vitest";

import {
  createHeadingFoldDecorations,
  createHeadingFoldPlugin,
  getFoldedHeadings,
  headingFoldPluginKey,
  revealFoldedRange,
} from "./headingFold";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    heading: { content: "inline*", group: "block", attrs: { level: { default: 1 } } },
    blockquote: { content: "block+", group: "block" },
  },
});

const paragraph = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
const heading = (level: number, text: string) =>
  schema.nodes.heading.create({ level }, schema.text(text));
const quote = (...content: ProseMirrorNode[]) => schema.nodes.blockquote.create(null, content);

const createDoc = () =>
  schema.nodes.doc.create(null, [
    paragraph("Intro"),
    heading(1, "Guide"),
    paragraph("Guide body"),
    heading(2, "Install"),
    paragraph("Install body"),
    heading(3, "Detail"),
    paragraph("Detail body"),
    heading(2, "Empty"),
    heading(2, "Use"),
    paragraph("Use body"),
    quote(heading(2, "Quoted"), paragraph("Quoted body"), heading(3, "Quoted end")),
    paragraph("After quote"),
    heading(1, "Next"),
    paragraph("Next body"),
  ]);

const positionOf = (doc: ProseMirrorNode, text: string) => {
  let found = -1;
  doc.descendants((node, position) => {
    if (found < 0 && node.isTextblock && node.textContent === text) found = position;
    return found < 0;
  });
  expect(found).toBeGreaterThanOrEqual(0);
  return found;
};

const endOf = (doc: ProseMirrorNode, text: string) =>
  positionOf(doc, text) + doc.nodeAt(positionOf(doc, text))!.nodeSize;

const describeDecorations = (decorations: DecorationSet | undefined) =>
  (decorations?.find() ?? [])
    .map((decoration) => {
      const { attrs } = (decoration as unknown as { type: { attrs?: unknown } }).type;
      return `${decoration.from}-${decoration.to} ${attrs ? JSON.stringify(attrs) : "widget"}`;
    })
    .toSorted();

const foldDecorations = (state: EditorState) => headingFoldPluginKey.getState(state)?.decorations;

const expectRebuilt = (state: EditorState) => {
  expect(describeDecorations(foldDecorations(state))).toEqual(
    describeDecorations(createHeadingFoldDecorations(state.doc, getFoldedHeadings(state))),
  );
};

const expectRebuiltAfter = (state: EditorState, transaction: Transaction) => {
  const next = state.apply(transaction);
  expectRebuilt(next);
  return next;
};

// Positions of the decorations created while applying, which a full rebuild would create for
// every heading with a section.
const applyAndTrack = (state: EditorState, transaction: Transaction) => {
  const node = vi.spyOn(Decoration, "node");
  const widget = vi.spyOn(Decoration, "widget");
  const next = state.apply(transaction);
  const decorated = [...node.mock.calls, ...widget.mock.calls]
    .map(([from]) => from)
    .toSorted((left, right) => left - right);
  node.mockRestore();
  widget.mockRestore();
  expectRebuilt(next);
  return { next, decorated };
};

const fold = (state: EditorState, text: string) =>
  expectRebuiltAfter(
    state,
    state.tr.setMeta(headingFoldPluginKey, { fold: positionOf(state.doc, text) }),
  );

const setup = (folds: readonly string[]) => {
  let state = EditorState.create({ doc: createDoc(), plugins: [createHeadingFoldPlugin()] });
  for (const text of folds) state = fold(state, text);
  expect(getFoldedHeadings(state)).toHaveLength(folds.length);
  return state;
};

const foldCases = [
  { name: "without folds", folds: [] },
  { name: "with folds", folds: ["Install", "Quoted", "Next"] },
];

describe.each(foldCases)("heading fold decorations $name", ({ folds }) => {
  it("decorates no heading when typing in a paragraph", () => {
    let state = setup(folds);
    const edits: ((doc: ProseMirrorNode) => [text: string, from: number, to: number])[] = [
      (doc) => ["!", endOf(doc, "Use body") - 1, endOf(doc, "Use body") - 1],
      (doc) => ["?", positionOf(doc, "Intro") + 1, positionOf(doc, "Intro") + 1],
      (doc) => ["", endOf(doc, "After quote") - 3, endOf(doc, "After quote") - 1],
    ];

    for (const edit of edits) {
      const { next, decorated } = applyAndTrack(state, state.tr.insertText(...edit(state.doc)));
      expect(decorated).toEqual([]);
      state = next;
    }
    expect(getFoldedHeadings(state)).toHaveLength(folds.length);
  });

  it("decorates a heading created from a paragraph and ends the section before it", () => {
    const state = setup(folds);
    const next = expectRebuiltAfter(
      state,
      state.tr.setBlockType(
        positionOf(state.doc, "Detail body") + 1,
        positionOf(state.doc, "Detail body") + 1,
        schema.nodes.heading,
        { level: 2 },
      ),
    );

    expect(next.doc.nodeAt(positionOf(next.doc, "Detail body"))?.type.name).toBe("heading");
  });

  it("follows a heading turned into a paragraph or removed", () => {
    let state = setup(folds);
    state = expectRebuiltAfter(
      state,
      state.tr.setBlockType(
        positionOf(state.doc, "Detail") + 1,
        positionOf(state.doc, "Detail") + 1,
        schema.nodes.paragraph,
      ),
    );
    state = expectRebuiltAfter(
      state,
      state.tr.delete(positionOf(state.doc, "Use"), endOf(state.doc, "Use")),
    );
    expectRebuiltAfter(
      state,
      state.tr.delete(positionOf(state.doc, "Quoted end"), endOf(state.doc, "Quoted end")),
    );
  });

  it("follows a heading's level changing", () => {
    let state = setup(folds);
    state = expectRebuiltAfter(
      state,
      state.tr.setNodeMarkup(positionOf(state.doc, "Install"), undefined, { level: 1 }),
    );
    state = expectRebuiltAfter(
      state,
      state.tr.setNodeAttribute(positionOf(state.doc, "Empty"), "level", 3),
    );
    state = expectRebuiltAfter(
      state,
      state.tr.setNodeAttribute(positionOf(state.doc, "Quoted end"), "level", 1),
    );
    expectRebuiltAfter(
      state,
      state.tr.setNodeMarkup(positionOf(state.doc, "Next"), undefined, { level: 3 }),
    );
  });

  it("follows a heading gaining or losing its section", () => {
    let state = setup(folds);
    state = expectRebuiltAfter(state, state.tr.insert(endOf(state.doc, "Empty"), paragraph("New")));
    expect(state.doc.nodeAt(positionOf(state.doc, "New"))?.type.name).toBe("paragraph");
    state = expectRebuiltAfter(
      state,
      state.tr.delete(positionOf(state.doc, "New"), endOf(state.doc, "New")),
    );
    state = expectRebuiltAfter(
      state,
      state.tr.delete(positionOf(state.doc, "Detail body"), endOf(state.doc, "Detail body")),
    );
    expectRebuiltAfter(
      state,
      state.tr.delete(positionOf(state.doc, "Next body"), endOf(state.doc, "Next body")),
    );
  });

  it("follows a heading split in two and joined back", () => {
    const state = setup(folds);
    const split = expectRebuiltAfter(state, state.tr.split(positionOf(state.doc, "Use") + 2));
    const joined = expectRebuiltAfter(split, split.tr.join(endOf(split.doc, "U")));

    expect(joined.doc.eq(state.doc)).toBe(true);
    expectRebuiltAfter(joined, joined.tr.split(endOf(joined.doc, "Guide body") - 1));
  });

  it("follows blocks wrapped in a quote and lifted out of one", () => {
    let state = setup(folds);
    const $from = state.doc.resolve(positionOf(state.doc, "Guide") + 1);
    const $to = state.doc.resolve(endOf(state.doc, "Use body") - 1);
    const range = $from.blockRange($to)!;
    state = expectRebuiltAfter(state, state.tr.wrap(range, [{ type: schema.nodes.blockquote }]));

    const quoted = state.doc.resolve(positionOf(state.doc, "Quoted") + 1);
    const quotedEnd = state.doc.resolve(endOf(state.doc, "Quoted end") - 1);
    const lift = quoted.blockRange(quotedEnd)!;
    expectRebuiltAfter(state, state.tr.lift(lift, liftTarget(lift)!));
  });

  it("follows content inserted into and removed from a section", () => {
    let state = setup(folds);
    state = expectRebuiltAfter(
      state,
      state.tr.insert(endOf(state.doc, "Install body"), heading(1, "Inserted")),
    );
    state = expectRebuiltAfter(
      state,
      state.tr.delete(positionOf(state.doc, "Inserted"), endOf(state.doc, "Inserted")),
    );
    state = expectRebuiltAfter(
      state,
      state.tr.insert(positionOf(state.doc, "Quoted body"), paragraph("Quoted lead")),
    );
    expectRebuiltAfter(
      state,
      state.tr.delete(positionOf(state.doc, "Use"), endOf(state.doc, "After quote")),
    );
  });

  it("decorates each heading a multi-step transaction changes", () => {
    const state = setup(folds);
    const transaction = state.tr
      .insert(endOf(state.doc, "Empty"), paragraph("Gained"))
      .setNodeAttribute(positionOf(state.doc, "Guide"), "level", 2);
    transaction.delete(
      transaction.mapping.map(positionOf(state.doc, "Next")),
      transaction.mapping.map(endOf(state.doc, "Next")),
    );
    transaction.insertText("!", transaction.mapping.map(endOf(state.doc, "Intro") - 1));

    expectRebuiltAfter(state, transaction);
  });

  it("decorates every heading when the whole document is replaced", () => {
    const state = setup(folds);
    const replacement = createDoc();

    expectRebuiltAfter(
      state,
      state.tr.replace(
        0,
        state.doc.content.size,
        new Slice(Fragment.from(replacement.content), 0, 0),
      ),
    );
  });
});

describe("folding and unfolding", () => {
  it("re-decorates only the toggled heading and its section", () => {
    let state = setup([]);

    const folded = applyAndTrack(
      state,
      state.tr.setMeta(headingFoldPluginKey, { fold: positionOf(state.doc, "Install") }),
    );
    state = folded.next;
    expect(folded.decorated).toEqual([
      positionOf(state.doc, "Install"),
      endOf(state.doc, "Install") - 1,
      positionOf(state.doc, "Install body"),
      positionOf(state.doc, "Detail"),
      positionOf(state.doc, "Detail body"),
    ]);

    state = fold(state, "Guide");
    state = expectRebuiltAfter(
      state,
      state.tr.setMeta(headingFoldPluginKey, { unfold: [positionOf(state.doc, "Install")] }),
    );
    state = expectRebuiltAfter(
      state,
      revealFoldedRange(state.tr, positionOf(state.doc, "Detail body") + 1),
    );

    expect(getFoldedHeadings(state)).toEqual([]);
  });

  it("drops a fold whose section an edit removes", () => {
    let state = setup(["Detail"]);
    state = expectRebuiltAfter(
      state,
      state.tr.delete(positionOf(state.doc, "Detail body"), endOf(state.doc, "Detail body")),
    );

    expect(getFoldedHeadings(state)).toEqual([]);
  });
});
