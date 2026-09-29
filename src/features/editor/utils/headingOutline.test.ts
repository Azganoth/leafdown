import { closeHistory, history, redo, undo } from "@milkdown/kit/prose/history";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { getHeadingOutline } from "./headingOutline";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    heading: { content: "inline*", group: "block", attrs: { level: { default: 1 } } },
    blockquote: { content: "block+", group: "block" },
    bullet_list: { content: "list_item+", group: "block" },
    list_item: { content: "block+" },
  },
});

const heading = (level: number, text: string) =>
  schema.nodes.heading.create({ level }, schema.text(text));

describe("heading outline", () => {
  it("keeps duplicate headings distinct and includes skipped levels and container context", () => {
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc.create(null, [
        heading(1, "Same"),
        schema.nodes.blockquote.create(null, heading(3, "Quoted")),
        schema.nodes.bullet_list.create(
          null,
          schema.nodes.list_item.create(null, heading(2, "Nested")),
        ),
        heading(1, "Same"),
      ]),
    });
    const outline = getHeadingOutline(state);

    expect(outline.headings.map(({ text, level, context }) => ({ text, level, context }))).toEqual([
      { text: "Same", level: 1, context: [] },
      { text: "Quoted", level: 3, context: ["blockquote"] },
      { text: "Nested", level: 2, context: ["bullet_list"] },
      { text: "Same", level: 1, context: [] },
    ]);
    expect(new Set(outline.headings.map((item) => item.position)).size).toBe(4);
  });

  it("recomputes labels, levels, positions, and the active heading after edits and undo/redo", () => {
    let state = EditorState.create({
      schema,
      doc: schema.nodes.doc.create(null, [heading(1, "First"), heading(2, "Second")]),
      plugins: [history()],
    });
    const first = getHeadingOutline(state).headings[0];
    state = state.apply(state.tr.insertText("New ", first.position + 1));
    expect(getHeadingOutline(state).headings[0].text).toBe("New First");

    const second = getHeadingOutline(state).headings[1];
    state = state.apply(
      closeHistory(state.tr).setNodeMarkup(second.position, undefined, { level: 4 }),
    );
    expect(getHeadingOutline(state).headings[1].level).toBe(4);
    expect(getHeadingOutline(state).headings[1].position).toBe(second.position);

    state = state.apply(
      state.tr.setSelection(TextSelection.near(state.doc.resolve(second.position + 1))),
    );
    expect(getHeadingOutline(state).activePosition).toBe(second.position);
    expect(undo(state, (transaction) => (state = state.apply(transaction)))).toBe(true);
    expect(getHeadingOutline(state).headings[1].level).toBe(2);
    expect(redo(state, (transaction) => (state = state.apply(transaction)))).toBe(true);
    expect(getHeadingOutline(state).headings[1].level).toBe(4);
  });
});
