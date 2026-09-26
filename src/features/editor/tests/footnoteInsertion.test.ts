// @vitest-environment happy-dom

import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  getEditorTextPosition,
  setTextSelection,
} from "@/test/utils/prosemirror";
import { enterFootnoteReferenceProjection, enterProjection } from "@/test/utils/sourceProjection";

import { EDITOR_COMMANDS, runEditorCommand } from "../commands";
import {
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
} from "../plugins/blockSelection";
import { hasActiveSourceProjection } from "../plugins/sourceProjection";
import { getFootnoteDefinitionLabel } from "../utils/footnoteDefinitionLabel";
import { findFootnoteDefinitions } from "../utils/footnoteDefinitions";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const canInsert = (mounted: MountedMilkdownEditor) =>
  EDITOR_COMMANDS["insert.footnote"].canRun(mounted.view.state);

const insert = (mounted: MountedMilkdownEditor) =>
  runEditorCommand(mounted.editor, "insert.footnote");

const placeCaretAfter = (mounted: MountedMilkdownEditor, text: string) => {
  setTextSelection(mounted.view, getEditorTextPosition(mounted, text) + text.length);
};

const typeText = (mounted: MountedMilkdownEditor, text: string) => {
  mounted.view.dispatch(mounted.view.state.tr.insertText(text));
};

const readDefinitionLabels = (mounted: MountedMilkdownEditor) =>
  findFootnoteDefinitions(mounted.view.state.doc).map(({ node }) =>
    getFootnoteDefinitionLabel(node),
  );

const expectCaretInDefinitionBody = (mounted: MountedMilkdownEditor, label: string) => {
  const { $from, empty } = mounted.view.state.selection;
  const definition = $from.node($from.depth - 1);

  expect(empty).toBe(true);
  expect($from.parent.type.name).toBe("paragraph");
  expect($from.parent.content.size).toBe(0);
  expect(definition.type.name).toBe("footnote_definition");
  expect(getFootnoteDefinitionLabel(definition)).toBe(label);
  expect(mounted.view.state.doc.lastChild).toBe(definition);
};

describe("insert footnote command availability", () => {
  it("is available with a caret or a text selection in ordinary text", async () => {
    const mounted = await mountEditor("Alpha beta\n\nGamma");

    placeCaretAfter(mounted, "Alpha");
    expect(canInsert(mounted)).toBe(true);

    const from = getEditorTextPosition(mounted, "beta");

    setTextSelection(mounted.view, from, from + "beta".length);
    expect(canInsert(mounted)).toBe(true);
  });

  it("is unavailable for block, node, code block, and definition label selections", async () => {
    const mounted = await mountEditor("Alpha[^note]\n\n---\n\n```\ncode\n```\n\n[^note]: Detail");
    const [block] = getSelectableBlockTargets(mounted.view.state.doc);

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, block.pos),
      ),
    );
    expect(canInsert(mounted)).toBe(false);

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        NodeSelection.create(mounted.view.state.doc, getEditorNodePosition(mounted, "hr")),
      ),
    );
    expect(canInsert(mounted)).toBe(false);

    placeCaretAfter(mounted, "code");
    expect(canInsert(mounted)).toBe(false);

    setTextSelection(mounted.view, findFootnoteDefinitions(mounted.view.state.doc)[0].pos + 3);
    expect(mounted.view.state.selection.$from.parent.type.name).toBe("footnote_definition_label");
    expect(canInsert(mounted)).toBe(false);
    expect(await insert(mounted)).toBe(false);
  });
});

describe("insert footnote command", () => {
  it("creates a reference and a definition in an empty document", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor("", { onContentChanged });

    setTextSelection(mounted.view, 1);

    expect(await insert(mounted)).toBe(true);
    expect(mounted.getMarkdown()).toBe("[^fn1]\n\n[^fn1]: \n");
    expectCaretInDefinitionBody(mounted, "fn1");
    expect(onContentChanged).toHaveBeenCalled();
  });

  it("inserts the reference at the caret and appends the definition after existing footnotes", async () => {
    const mounted = await mountEditor("Alpha beta[^note]\n\n[^note]: Detail");

    placeCaretAfter(mounted, "Alpha");

    expect(await insert(mounted)).toBe(true);

    typeText(mounted, "Written");

    expect(mounted.getMarkdown()).toBe(
      "Alpha[^fn1] beta[^note]\n\n[^note]: Detail\n\n[^fn1]: Written\n",
    );
  });

  it("leaves a selection's text in place and references it from its end", async () => {
    const mounted = await mountEditor("Alpha **beta** gamma");
    const from = getEditorTextPosition(mounted, "Alpha");

    setTextSelection(mounted.view, from, getEditorTextPosition(mounted, "beta") + "beta".length);

    expect(await insert(mounted)).toBe(true);
    expect(mounted.getMarkdown()).toBe("Alpha **beta[^fn1]** gamma\n\n[^fn1]: \n");
  });

  it("keeps the reference out of a code span it is inserted beside", async () => {
    const mounted = await mountEditor("Alpha `code` beta");
    const from = getEditorTextPosition(mounted, "code");

    setTextSelection(mounted.view, from, from + "code".length);

    expect(await insert(mounted)).toBe(true);
    expect(mounted.getMarkdown()).toBe("Alpha `code`[^fn1] beta\n\n[^fn1]: \n");
  });

  it("skips labels that a definition, a reference, or another case already uses", async () => {
    const mounted = await mountEditor(
      "A[^fn1] B[^FN2] C[^fn4]\n\n[^fn1]: One\n\n[^FN2]: Two\n\n[^fn4]: Four",
    );

    placeCaretAfter(mounted, "C");
    await insert(mounted);

    placeCaretAfter(mounted, "B");
    await insert(mounted);

    expect(readDefinitionLabels(mounted)).toEqual(["fn1", "FN2", "fn4", "fn3", "fn5"]);
    expect(mounted.getMarkdown()).toBe(
      "A[^fn1] B[^fn5][^FN2] C[^fn3][^fn4]\n\n[^fn1]: One\n\n[^FN2]: Two\n\n[^fn4]: Four\n\n[^fn3]: \n\n[^fn5]: \n",
    );
  });

  it("does not adopt a reference that no definition answers to", async () => {
    const mounted = await mountEditor("A[^note]\n\n[^note]: Detail");
    const [definition] = findFootnoteDefinitions(mounted.view.state.doc);

    mounted.view.dispatch(
      mounted.view.state.tr.setNodeMarkup(
        getEditorNodePosition(mounted, "footnote_reference"),
        undefined,
        { label: "fn1" },
      ),
    );
    mounted.view.dispatch(
      mounted.view.state.tr.delete(definition.pos, definition.pos + definition.node.nodeSize),
    );
    placeCaretAfter(mounted, "A");

    expect(await insert(mounted)).toBe(true);
    expect(mounted.getMarkdown()).toContain("[^fn2]: ");
    expect(mounted.getMarkdown()).not.toContain("[^fn1]: ");
  });

  it("undoes and redoes the reference and definition as one step", async () => {
    const markdown = "Alpha beta";
    const mounted = await mountEditor(markdown);

    placeCaretAfter(mounted, "Alpha");
    const selectionBefore = mounted.view.state.selection;

    await insert(mounted);

    const inserted = mounted.getMarkdown();

    await runEditorCommand(mounted.editor, "edit.undo");

    expect(mounted.getMarkdown()).toBe(`${markdown}\n`);
    expect(mounted.view.state.selection.eq(selectionBefore)).toBe(true);

    await runEditorCommand(mounted.editor, "edit.redo");

    expect(mounted.getMarkdown()).toBe(inserted);
    expect(inserted).toBe("Alpha[^fn1] beta\n\n[^fn1]: \n");
  });

  it("settles an active projection before inserting", async () => {
    const mounted = await mountEditor("Alpha **beta** gamma[^note]\n\n[^note]: Detail");

    enterProjection(mounted, "strong");

    expect(await insert(mounted)).toBe(true);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.getMarkdown()).toBe(
      "Alpha **beta[^fn1]** gamma[^note]\n\n[^note]: Detail\n\n[^fn1]: \n",
    );
    expectCaretInDefinitionBody(mounted, "fn1");

    await runEditorCommand(mounted.editor, "edit.undo");

    expect(mounted.getMarkdown()).toBe("Alpha **beta** gamma[^note]\n\n[^note]: Detail\n");
  });

  it("commits an edited reference projection before choosing a label", async () => {
    const mounted = await mountEditor("A[^note]\n\n[^note]: Detail\n\n[^fn1]: Other");

    enterFootnoteReferenceProjection(mounted);
    typeText(mounted, "fn1");

    expect(await insert(mounted)).toBe(true);
    expect(mounted.getMarkdown()).toBe(
      "A[^fn1][^fn2]\n\n[^note]: Detail\n\n[^fn1]: Other\n\n[^fn2]: \n",
    );
  });

  it("reopens the written document with the reference and its definition", async () => {
    const mounted = await mountEditor("Alpha");

    placeCaretAfter(mounted, "Alpha");
    await insert(mounted);

    const reopened = await mountEditor(mounted.getMarkdown());

    expect(getEditorNodePosition(reopened, "footnote_reference")).toBeGreaterThan(0);
    expect(readDefinitionLabels(reopened)).toEqual(["fn1"]);
    expect(reopened.getMarkdown()).toBe(mounted.getMarkdown());
  });

  it("follows a reference whose projected label is selected", async () => {
    const mounted = await mountEditor("A[^note] B\n\n[^note]: Detail");

    enterFootnoteReferenceProjection(mounted);

    expect(canInsert(mounted)).toBe(true);
    expect(await insert(mounted)).toBe(true);
    expect(mounted.getMarkdown()).toBe("A[^note][^fn1] B\n\n[^note]: Detail\n\n[^fn1]: \n");
    expectCaretInDefinitionBody(mounted, "fn1");
  });
});
