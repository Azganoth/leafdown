// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getEditorNodePosition, setTextSelection } from "@/test/utils/prosemirror";
import { enterFootnoteReferenceProjection } from "@/test/utils/sourceProjection";

import { EDITOR_COMMANDS, runEditorCommand } from "../commands";
import { hasActiveSourceProjection } from "../plugins/sourceProjection";
import { findFootnoteDefinitions } from "../utils/footnoteDefinitions";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const DOCUMENT = "A[^note] B[^note]\n\n[^note]: Detail";

const canRename = (mounted: MountedMilkdownEditor) =>
  EDITOR_COMMANDS["edit.renameFootnote"].canRun(mounted.view.state);

const rename = (mounted: MountedMilkdownEditor) =>
  runEditorCommand(mounted.editor, "edit.renameFootnote");

const getLabelContentStart = (mounted: MountedMilkdownEditor, index = 0) => {
  const definition = findFootnoteDefinitions(mounted.view.state.doc)[index];

  if (!definition) {
    throw new Error(`Could not find footnote definition ${index}.`);
  }

  return definition.pos + 2;
};

const expectLabelSelected = (mounted: MountedMilkdownEditor, label: string, index = 0) => {
  const from = getLabelContentStart(mounted, index);
  const { selection } = mounted.view.state;

  expect(selection.from).toBe(from);
  expect(selection.to).toBe(from + label.length);
  expect(selection.$from.parent.type.name).toBe("footnote_definition_label");
};

const placeCaretAfterReference = (mounted: MountedMilkdownEditor) => {
  setTextSelection(mounted.view, getEditorNodePosition(mounted, "footnote_reference") + 1);
};

// Typing over the selected label, the way a keystroke replaces a selection.
const typeReplacement = (mounted: MountedMilkdownEditor, text: string) => {
  mounted.view.dispatch(mounted.view.state.tr.insertText(text));
};

const leaveLabel = (mounted: MountedMilkdownEditor) => {
  setTextSelection(mounted.view, 1);
};

describe("rename footnote command availability", () => {
  it("is available while the caret or a selection is in a definition label", async () => {
    const mounted = await mountEditor(DOCUMENT);
    const from = getLabelContentStart(mounted);

    setTextSelection(mounted.view, from + 2);
    expect(canRename(mounted)).toBe(true);

    setTextSelection(mounted.view, from, from + 2);
    expect(canRename(mounted)).toBe(true);
  });

  it("is available on a reference exactly one definition answers to", async () => {
    const mounted = await mountEditor(DOCUMENT);

    placeCaretAfterReference(mounted);

    expect(canRename(mounted)).toBe(true);
  });

  it("is unavailable in the definition body and in ordinary text", async () => {
    const mounted = await mountEditor(DOCUMENT);
    const from = getLabelContentStart(mounted);

    setTextSelection(mounted.view, from + "note".length + 3);
    expect(mounted.view.state.selection.$from.parent.textContent).toBe("Detail");
    expect(canRename(mounted)).toBe(false);

    setTextSelection(mounted.view, 1);
    expect(canRename(mounted)).toBe(false);
  });

  it("is unavailable for a reference whose definition is gone", async () => {
    const mounted = await mountEditor(DOCUMENT);
    const [definition] = findFootnoteDefinitions(mounted.view.state.doc);

    mounted.view.dispatch(
      mounted.view.state.tr.delete(definition.pos, definition.pos + definition.node.nodeSize),
    );
    placeCaretAfterReference(mounted);

    expect(canRename(mounted)).toBe(false);
    expect(await rename(mounted)).toBe(false);
  });

  it("does not choose between definitions that answer to the same label", async () => {
    const mounted = await mountEditor(DOCUMENT);
    const [definition] = findFootnoteDefinitions(mounted.view.state.doc);

    mounted.view.dispatch(
      mounted.view.state.tr.insert(
        definition.pos + definition.node.nodeSize,
        definition.node.copy(definition.node.content),
      ),
    );

    expect(findFootnoteDefinitions(mounted.view.state.doc)).toHaveLength(2);

    placeCaretAfterReference(mounted);
    const selectionBefore = mounted.view.state.selection;

    expect(canRename(mounted)).toBe(false);
    expect(await rename(mounted)).toBe(false);
    expect(mounted.view.state.selection.eq(selectionBefore)).toBe(true);
  });
});

describe("rename footnote command", () => {
  it("selects the complete label in place from the definition", async () => {
    const mounted = await mountEditor(DOCUMENT);

    setTextSelection(mounted.view, getLabelContentStart(mounted) + 1);

    expect(await rename(mounted)).toBe(true);
    expectLabelSelected(mounted, "note");
  });

  it("selects the matching definition's label from a reference without changing the document", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(DOCUMENT, { onContentChanged });

    placeCaretAfterReference(mounted);

    expect(await rename(mounted)).toBe(true);
    expectLabelSelected(mounted, "note");
    expect(mounted.getMarkdown()).toBe(`${DOCUMENT}\n`);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(EDITOR_COMMANDS["edit.undo"].canRun(mounted.view.state)).toBe(false);
  });

  // The projected source is longer than the reference node it settles back into, so a definition
  // after the reference moves when the projection ends and one before it does not.
  it.each([
    ["after", DOCUMENT],
    ["before", "[^note]: Detail\n\nA[^note] B[^note]"],
  ])(
    "settles a reference's source projection with the definition %s it",
    async (_order, markdown) => {
      const onContentChanged = vi.fn();
      const mounted = await mountEditor(markdown, { onContentChanged });

      enterFootnoteReferenceProjection(mounted);

      expect(await rename(mounted)).toBe(true);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expectLabelSelected(mounted, "note");
      expect(mounted.getMarkdown()).toBe(`${markdown}\n`);
      expect(onContentChanged).not.toHaveBeenCalled();
      expect(EDITOR_COMMANDS["edit.undo"].canRun(mounted.view.state)).toBe(false);
    },
  );

  it("commits an edited reference projection and follows the label it now names", async () => {
    const mounted = await mountEditor("A[^note]\n\n[^note]: Detail\n\n[^other]: More");

    enterFootnoteReferenceProjection(mounted);
    typeReplacement(mounted, "other");

    expect(await rename(mounted)).toBe(true);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expectLabelSelected(mounted, "other", 1);
    expect(mounted.getMarkdown()).toBe("A[^other]\n\n[^note]: Detail\n\n[^other]: More\n");
  });

  it("renames the definition and every reference once the caret leaves the label", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(DOCUMENT, { onContentChanged });

    enterFootnoteReferenceProjection(mounted);
    await rename(mounted);
    typeReplacement(mounted, "source");

    expect(onContentChanged).toHaveBeenCalled();

    leaveLabel(mounted);

    expect(mounted.getMarkdown()).toBe("A[^source] B[^source]\n\n[^source]: Detail\n");
  });

  it("writes the typed label when the document is written before the caret leaves", async () => {
    const mounted = await mountEditor(DOCUMENT);

    placeCaretAfterReference(mounted);
    await rename(mounted);
    typeReplacement(mounted, "source");

    expect(mounted.getMarkdown()).toBe("A[^source] B[^source]\n\n[^source]: Detail\n");
  });

  it.each([
    ["an empty label", ""],
    ["a label holding a bracket", "no]te"],
    ["a label another definition answers to", "other"],
  ])("keeps the label the definition was read with for %s", async (_case, replacement) => {
    const markdown = "A[^note] B[^other]\n\n[^note]: Detail\n\n[^other]: More\n";
    const mounted = await mountEditor(markdown);

    placeCaretAfterReference(mounted);
    await rename(mounted);
    typeReplacement(mounted, replacement);
    leaveLabel(mounted);

    expect(mounted.getMarkdown()).toBe(markdown);
  });

  it("reverses the rename and the references it moved with undo", async () => {
    const mounted = await mountEditor(DOCUMENT);

    placeCaretAfterReference(mounted);
    await rename(mounted);
    typeReplacement(mounted, "source");
    leaveLabel(mounted);

    expect(mounted.getMarkdown()).toBe("A[^source] B[^source]\n\n[^source]: Detail\n");

    await runEditorCommand(mounted.editor, "edit.undo");

    expect(mounted.getMarkdown()).toBe(`${DOCUMENT}\n`);
    expect(mounted.view.state.selection.$from.parent.type.name).toBe("footnote_definition_label");
  });
});
