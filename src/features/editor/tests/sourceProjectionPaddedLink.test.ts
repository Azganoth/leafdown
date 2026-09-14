// @vitest-environment happy-dom

import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  getEditorTextPosition,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { leafdownSourceProjectionPluginKey } from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const DEFINITION = "\n\n[label]: ./doc.md";

const PADDINGS = [
  { leading: " ", padding: "its leading edge", trailing: "" },
  { leading: "", padding: "its trailing edge", trailing: " " },
  { leading: " ", padding: "both edges", trailing: " " },
  { leading: "  ", padding: "both edges with a run", trailing: "\t" },
];

const LABEL_FORMS = [
  { form: "an inline link", getSource: (label: string) => `[${label}](./doc.md "Title")` },
  { form: "a mixed-format link", getSource: (label: string) => `[${label}](./doc.md)` },
  { form: "a full reference link", getSource: (label: string) => `[${label}][label]` },
  { form: "a shortcut reference link", getSource: (label: string) => `[${label}]` },
];

const CASES = PADDINGS.flatMap((padding) =>
  LABEL_FORMS.map(({ form, getSource }) => {
    const content = form === "a mixed-format link" ? "**bold** label" : "label";
    const label = `${padding.leading}${content}${padding.trailing}`;
    const source = getSource(label);
    const definitions = form.includes("reference") ? DEFINITION : "";

    return {
      ...padding,
      form,
      labelText: label.replace("**bold**", "bold"),
      markdown: `Before ${source} after${definitions}\n\nend\n`,
      source,
    };
  }),
);

const getLinkRange = (document: ProseMirrorNode) => {
  let from = -1;
  let to = -1;

  document.firstChild?.forEach((node, offset) => {
    if (node.marks.some((mark) => mark.type.name === "link")) {
      from = from < 0 ? offset + 1 : from;
      to = offset + 1 + node.nodeSize;
    }
  });

  return { from, text: document.textBetween(from, to), to };
};

const readSession = (mounted: Awaited<ReturnType<typeof mountProjectionEditor>>) =>
  leafdownSourceProjectionPluginKey.getState(mounted.view.state)?.session ?? null;

describe("link source projection over a label padded with whitespace", () => {
  it.each(CASES)(
    "writes $form padded at $padding back unchanged",
    async ({ labelText, markdown }) => {
      const mounted = await mountProjectionEditor(markdown);

      setSelectionAtDocumentEnd(mounted.view);

      const written = mounted.getMarkdown();
      const reopened = await mountProjectionEditor(written);

      setSelectionAtDocumentEnd(reopened.view);

      expect(written).toBe(markdown);
      expect(getLinkRange(reopened.view.state.doc).text).toBe(labelText);
    },
  );

  it.each(CASES)(
    "projects the complete source of $form padded at $padding from every label position",
    async ({ markdown, source }) => {
      const mounted = await mountProjectionEditor(markdown);
      const { from, to } = getLinkRange(mounted.view.state.doc);

      for (let position = from; position <= to; position += 1) {
        setSelectionAtDocumentEnd(mounted.view);
        setTextSelection(mounted.view, position);

        const session = readSession(mounted);

        expect(session?.adapter.id).toBe("link");
        expect(session?.target).toMatchObject({ from, originalSource: source, to });
        expect(getEditorTextContent(mounted)).toContain(`Before ${source} after`);
      }
    },
  );

  it.each(CASES)(
    "projects $form padded at $padding from a text selection across its label",
    async ({ markdown, source }) => {
      const mounted = await mountProjectionEditor(markdown);
      const { from, to } = getLinkRange(mounted.view.state.doc);

      setTextSelection(mounted.view, from, to);

      expect(readSession(mounted)?.target).toMatchObject({ from, originalSource: source, to });
    },
  );

  it.each(CASES.filter(({ form }) => form !== "a shortcut reference link"))(
    "commits an edit to $form padded at $padding keeping the padding",
    async ({ labelText, markdown, source }) => {
      const mounted = await mountProjectionEditor(markdown);

      setTextSelection(mounted.view, getLinkRange(mounted.view.state.doc).from);

      const labelEnd = source.indexOf("label") + "label".length;

      setTextSelection(mounted.view, getEditorTextPosition(mounted, source) + labelEnd);
      typeText(mounted.view, "s");
      setSelectionAtDocumentEnd(mounted.view);

      const edited = `${source.slice(0, labelEnd)}s${source.slice(labelEnd)}`;

      expect(mounted.getMarkdown()).toBe(markdown.replace(source, edited));
      expect(getLinkRange(mounted.view.state.doc).text).toBe(labelText.replace("label", "labels"));
    },
  );

  it.each([
    { label: "an unpadded label", markdown: "Before [label](./doc.md) after\n\nend\n" },
    { label: "whitespace inside a label", markdown: "Before [a  \tb](./doc.md) after\n\nend\n" },
    ...[
      "[&#x20;label&#x20;](./doc.md)",
      "[label&#9;](./doc.md)",
      "[&#x20;**bold**](./doc.md)",
      "[**bold**&#x20;](./doc.md)",
      "[` ` label](./doc.md)",
      "[label ` `](./doc.md)",
      "[` `**bold**](./doc.md)",
      "[ &#x20;**bold** ](./doc.md)",
    ].map((source) => ({
      label: `a label whose edge whitespace is written as ${source}`,
      markdown: `Before ${source} after\n\nend\n`,
    })),
  ])("writes $label back unchanged", async ({ markdown }) => {
    const mounted = await mountProjectionEditor(markdown);

    setSelectionAtDocumentEnd(mounted.view);

    const written = mounted.getMarkdown();
    const reopened = await mountProjectionEditor(written);

    setSelectionAtDocumentEnd(reopened.view);

    expect(written).toBe(markdown);
    expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  });

  it.each([
    { edge: "opens", expected: "[ **a** b](./doc.md)", label: " a b", marked: [0, 2] },
    { edge: "closes", expected: "[a **b** ](./doc.md)", label: "a b ", marked: [2, 4] },
  ])(
    "writes whitespace a delimiter mark $edge on outside the mark and inside the label",
    async ({ expected, label, marked: [start, end] }) => {
      const mounted = await mountProjectionEditor(`Before [${label}](./doc.md) after\n\nend\n`);
      const { view } = mounted;
      const { from } = getLinkRange(view.state.doc);

      setSelectionAtDocumentEnd(view);
      view.dispatch(
        view.state.tr.addMark(from + start, from + end, view.state.schema.marks.strong.create()),
      );

      expect(mounted.getMarkdown()).toBe(`Before ${expected} after\n\nend\n`);
    },
  );
});
