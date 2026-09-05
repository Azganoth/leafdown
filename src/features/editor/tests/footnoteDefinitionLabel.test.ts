// @vitest-environment happy-dom

import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import {
  createClipboardData,
  dispatchClipboardEvent,
  parseClipboardHtml,
} from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorNodePosition,
  getEditorTextContent,
  runKeyDownHandlers,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const DEFINITION_SELECTOR = "dl[data-type='footnote_definition']";
const LABEL_SELECTOR = `${DEFINITION_SELECTOR} > dt`;

const getDefinition = (mounted: MountedMilkdownEditor, index = 0) => {
  const definitions: { node: ProseMirrorNode; pos: number }[] = [];

  mounted.view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "footnote_definition") {
      return node.isBlock;
    }

    definitions.push({ node, pos });

    return false;
  });

  const definition = definitions[index];

  if (!definition) {
    throw new Error(`Could not find footnote definition ${index}.`);
  }

  return definition;
};

const getCommittedLabels = (mounted: MountedMilkdownEditor) => {
  const labels: string[] = [];

  mounted.view.state.doc.descendants((node) => {
    if (node.type.name === "footnote_definition") {
      labels.push(String(node.attrs.label));

      return false;
    }

    return node.isBlock;
  });

  return labels;
};

const getReferenceLabels = (mounted: MountedMilkdownEditor) => {
  const labels: string[] = [];

  mounted.view.state.doc.descendants((node) => {
    if (node.type.name === "footnote_reference") {
      labels.push(String(node.attrs.label));
    }

    return true;
  });

  return labels;
};

// The caret stays in the label the edit belongs to, so nothing commits until a later move.
const typeLabel = (mounted: MountedMilkdownEditor, text: string, index = 0) => {
  const { node, pos } = getDefinition(mounted, index);
  const label = node.firstChild;

  if (!label) {
    throw new Error("Footnote definition holds no label.");
  }

  const from = pos + 2;
  const transaction = mounted.view.state.tr.insertText(text, from, from + label.content.size);

  transaction.setSelection(TextSelection.create(transaction.doc, from + text.length));
  mounted.view.dispatch(transaction);
};

const leaveLabel = (mounted: MountedMilkdownEditor) => {
  setTextSelection(mounted.view, 1);
};

describe("footnote definition label", () => {
  it("spells the label once, as the content the definition opens with", async () => {
    const mounted = await mountEditor("Text[^note]\n\n[^note]: Detail");
    const definition = getEditorDomElement(mounted, DEFINITION_SELECTOR);
    const label = getEditorDomElement(mounted, LABEL_SELECTOR);

    expect(definition.querySelectorAll("dt")).toHaveLength(1);
    expect(label).toHaveTextContent(/^note$/u);
    expect(definition.querySelector("p")).toHaveTextContent("Detail");
  });

  it("keeps the marker runs out of every position the document holds", async () => {
    const mounted = await mountEditor("Text[^note]\n\n[^note]: Detail");
    const label = getEditorDomElement(mounted, LABEL_SELECTOR);
    const definitionPos = getEditorNodePosition(mounted, "footnote_definition");
    const definitionNode = mounted.view.state.doc.nodeAt(definitionPos);

    expect(getEditorTextContent(mounted)).not.toContain("[^note]:");

    const caret = TextSelection.near(
      mounted.view.state.doc.resolve(mounted.view.posAtDOM(label, 0)),
      1,
    );

    expect(caret.from).toBeGreaterThan(definitionPos);
    expect(caret.from).toBeLessThan(definitionPos + (definitionNode?.nodeSize ?? 0));
    expect(caret.$from.parent).toBe(definitionNode?.firstChild);
  });

  it("presents the label the same wherever the caret is", async () => {
    const mounted = await mountEditor("Text[^note]\n\n[^note]: Detail");
    const label = getEditorDomElement(mounted, LABEL_SELECTOR);
    const away = label.outerHTML;

    setTextSelection(mounted.view, mounted.view.posAtDOM(label, 0));

    expect(getEditorDomElement(mounted, LABEL_SELECTOR).outerHTML).toBe(away);

    setTextSelection(mounted.view, 1);

    expect(getEditorDomElement(mounted, LABEL_SELECTOR).outerHTML).toBe(away);
  });

  it("writes back the label the file was read with", async () => {
    const markdown = "Text[^note]\n\n[^note]: Detail\n";
    const mounted = await mountEditor(markdown);

    expect(mounted.getMarkdown()).toBe(markdown);
  });

  it("renames the definition and its references when the caret leaves the label", async () => {
    const mounted = await mountEditor("A[^note] B[^note]\n\n[^note]: Detail");

    typeLabel(mounted, "source");

    expect(getCommittedLabels(mounted)).toEqual(["note"]);
    expect(getReferenceLabels(mounted)).toEqual(["note", "note"]);

    leaveLabel(mounted);

    expect(getCommittedLabels(mounted)).toEqual(["source"]);
    expect(getReferenceLabels(mounted)).toEqual(["source", "source"]);
    expect(mounted.getMarkdown()).toBe("A[^source] B[^source]\n\n[^source]: Detail\n");
  });

  it("writes the label the author typed when the caret has not left it", async () => {
    const mounted = await mountEditor("A[^note]\n\n[^note]: Detail");

    typeLabel(mounted, "source");

    expect(mounted.getMarkdown()).toBe("A[^source]\n\n[^source]: Detail\n");
  });

  it("keeps the label the definition was read with when the edit empties it", async () => {
    const mounted = await mountEditor("A[^note]\n\n[^note]: Detail");

    typeLabel(mounted, "");
    leaveLabel(mounted);

    expect(getCommittedLabels(mounted)).toEqual(["note"]);
    expect(getEditorDomElement(mounted, LABEL_SELECTOR)).toHaveTextContent(/^note$/u);
    expect(mounted.getMarkdown()).toBe("A[^note]\n\n[^note]: Detail\n");
  });

  it("keeps the label the definition was read with when the edit cannot be written", async () => {
    const mounted = await mountEditor("A[^note]\n\n[^note]: Detail");

    typeLabel(mounted, "so]urce");
    leaveLabel(mounted);

    expect(getCommittedLabels(mounted)).toEqual(["note"]);
    expect(mounted.getMarkdown()).toBe("A[^note]\n\n[^note]: Detail\n");
  });

  it("keeps the label the definition was read with when another definition answers to the edit", async () => {
    const mounted = await mountEditor("A[^one] B[^two]\n\n[^one]: First\n\n[^two]: Second");

    typeLabel(mounted, "two");
    leaveLabel(mounted);

    expect(getCommittedLabels(mounted)).toEqual(["one", "two"]);
    expect(getReferenceLabels(mounted)).toEqual(["one", "two"]);
    expect(mounted.getMarkdown()).toBe("A[^one] B[^two]\n\n[^one]: First\n\n[^two]: Second\n");
  });

  it("reverses a rename and the references it moved with one undo", async () => {
    const mounted = await mountEditor("A[^note] B[^note]\n\n[^note]: Detail");

    typeLabel(mounted, "source");
    leaveLabel(mounted);

    expect(getReferenceLabels(mounted)).toEqual(["source", "source"]);

    await runEditorCommand(mounted.editor, "edit.undo");

    expect(getCommittedLabels(mounted)).toEqual(["note"]);
    expect(getReferenceLabels(mounted)).toEqual(["note", "note"]);
    expect(mounted.getMarkdown()).toBe("A[^note] B[^note]\n\n[^note]: Detail\n");
  });

  // `Undo` restores the selection the typing began from, which puts the caret back in the label and
  // reopens the edit. The rename it reverses therefore settles on the next leave, and a file written
  // before that still gets the label the caret is sitting on.
  it("reopens the edit when undo returns the caret to the label", async () => {
    const mounted = await mountEditor("A[^note] B[^note]\n\n[^note]: Detail");
    const { pos } = getDefinition(mounted);

    setTextSelection(mounted.view, pos + 2);
    typeLabel(mounted, "source");
    leaveLabel(mounted);

    expect(getReferenceLabels(mounted)).toEqual(["source", "source"]);

    await runEditorCommand(mounted.editor, "edit.undo");

    expect(getEditorDomElement(mounted, LABEL_SELECTOR)).toHaveTextContent(/^note$/u);
    expect(mounted.getMarkdown()).toBe("A[^note] B[^note]\n\n[^note]: Detail\n");

    leaveLabel(mounted);

    expect(getCommittedLabels(mounted)).toEqual(["note"]);
    expect(getReferenceLabels(mounted)).toEqual(["note", "note"]);
  });

  it("keeps the definition whole when Enter and Backspace reach the label's edges", async () => {
    const mounted = await mountEditor("A[^note]\n\n[^note]: Detail");
    const { node, pos } = getDefinition(mounted);
    const labelEnd = pos + 2 + (node.firstChild?.content.size ?? 0);

    setTextSelection(mounted.view, labelEnd);
    runKeyDownHandlers(mounted.view, "Enter");

    setTextSelection(mounted.view, pos + 2);
    runKeyDownHandlers(mounted.view, "Backspace");

    // The body opens after the label node, so its first position is one past that node's end.
    setTextSelection(mounted.view, labelEnd + 2);
    runKeyDownHandlers(mounted.view, "Backspace");

    expect(mounted.view.state.selection.from).toBe(labelEnd);

    leaveLabel(mounted);

    expect(getCommittedLabels(mounted)).toEqual(["note"]);
    expect(getEditorDomElement(mounted, LABEL_SELECTOR)).toHaveTextContent(/^note$/u);
    expect(mounted.getMarkdown()).toBe("A[^note]\n\n[^note]: Detail\n");
  });

  it("marks the document changed for the typing rather than for the rename it derives", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor("A[^note]\n\n[^note]: Detail", { onContentChanged });

    typeLabel(mounted, "source");

    const afterTyping = onContentChanged.mock.calls.length;

    expect(afterTyping).toBeGreaterThan(0);

    leaveLabel(mounted);

    expect(getCommittedLabels(mounted)).toEqual(["source"]);
    expect(onContentChanged).toHaveBeenCalledTimes(afterTyping);
  });

  it("carries the label through a copy of the definition", async () => {
    const mounted = await mountEditor("A[^note]\n\n[^note]: Detail");
    const clipboardData = createClipboardData();
    const definition = getEditorDomElement(mounted, DEFINITION_SELECTOR);

    setTextSelection(
      mounted.view,
      mounted.view.posAtDOM(definition, 0),
      mounted.view.state.doc.content.size,
    );
    dispatchClipboardEvent(mounted.view.dom, "copy", clipboardData);

    const fragment = parseClipboardHtml(clipboardData);

    expect(fragment.querySelector("dl[data-type='footnote_definition'] > dt")).toHaveTextContent(
      /^note$/u,
    );
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toContain("[^note]: Detail");
  });

  it("leaves a reference's own label edit out of the definition", async () => {
    const mounted = await mountEditor("A[^note]\n\n[^note]: Detail");
    const referencePos = getEditorNodePosition(mounted, "footnote_reference");

    mounted.view.dispatch(
      mounted.view.state.tr.setNodeMarkup(referencePos, undefined, { label: "other" }),
    );
    leaveLabel(mounted);

    expect(getCommittedLabels(mounted)).toEqual(["note"]);
    expect(getEditorDomElement(mounted, LABEL_SELECTOR)).toHaveTextContent(/^note$/u);
  });
});
