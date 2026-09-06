// @vitest-environment happy-dom

import { EditorState, NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorNodePosition, setTextSelection } from "@/test/utils/prosemirror";

import { getActiveSourceProjectionRange } from "../plugins/sourceProjection";
import { getFootnoteDefinitionLabel } from "./footnoteDefinitionLabel";
import {
  FOOTNOTE_PREVIEW_CHARACTER_LIMIT,
  findFootnoteDefinitionByLabel,
  findFootnoteDefinitions,
  findFootnoteReferenceAtSelection,
  getFootnoteDefinitionPreviewText,
} from "./footnoteDefinitions";

const mountEditor = setupMilkdownEditorMount();

const DOCUMENT = "Body[^note].\n\n[^note]: The definition body.";

const resolveReferenceAtSelection = (state: EditorState) =>
  findFootnoteReferenceAtSelection(state, getActiveSourceProjectionRange(state));

describe("footnote definition resolution", () => {
  it("resolves a reference label against the definition the document holds", async () => {
    const mounted = await mountEditor(DOCUMENT);
    const definition = findFootnoteDefinitionByLabel(mounted.view.state.doc, "note");

    expect(definition).not.toBeNull();
    expect(getFootnoteDefinitionLabel(definition!.node)).toBe("note");
    expect(getFootnoteDefinitionPreviewText(definition!.node)).toBe("The definition body.");
  });

  it("reports no definition for a label the document does not define", async () => {
    const mounted = await mountEditor("Body[^missing].\n\n[^note]: The definition body.");

    expect(findFootnoteDefinitionByLabel(mounted.view.state.doc, "missing")).toBeNull();
  });

  it("resolves every reference sharing a label to the same definition", async () => {
    const mounted = await mountEditor("One[^note] and two[^note].\n\n[^note]: Shared body.");
    const definitions = findFootnoteDefinitions(mounted.view.state.doc);

    expect(definitions).toHaveLength(1);
    expect(findFootnoteDefinitionByLabel(mounted.view.state.doc, "note")?.pos).toBe(
      definitions[0].pos,
    );
  });

  it("leaves the label out of the preview and flattens a multi-block definition", async () => {
    const mounted = await mountEditor(
      "Body[^note].\n\n[^note]: First paragraph.\n\n    Second paragraph.",
    );
    const definition = findFootnoteDefinitionByLabel(mounted.view.state.doc, "note");

    expect(getFootnoteDefinitionPreviewText(definition!.node)).toBe(
      "First paragraph. Second paragraph.",
    );
  });

  it("cuts a definition longer than the preview limit short", async () => {
    const body = "word ".repeat(200).trim();
    const mounted = await mountEditor(`Body[^note].\n\n[^note]: ${body}`);
    const definition = findFootnoteDefinitionByLabel(mounted.view.state.doc, "note");
    const preview = getFootnoteDefinitionPreviewText(definition!.node);

    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(FOOTNOTE_PREVIEW_CHARACTER_LIMIT + 1);
  });
});

describe("footnote reference resolution at the selection", () => {
  it("reads the label of the reference the caret projects", async () => {
    const mounted = await mountEditor(DOCUMENT);
    const reference = getEditorNodePosition(mounted, "footnote_reference");

    setTextSelection(mounted.view, reference + 1);

    expect(getActiveSourceProjectionRange(mounted.view.state)).not.toBeNull();
    expect(resolveReferenceAtSelection(mounted.view.state)).toEqual({ label: "note" });
  });

  it("reads the label being typed rather than the one the projection opened on", async () => {
    const mounted = await mountEditor(DOCUMENT);
    const reference = getEditorNodePosition(mounted, "footnote_reference");

    setTextSelection(mounted.view, reference + 1);

    const projection = getActiveSourceProjectionRange(mounted.view.state)!;

    mounted.view.dispatch(mounted.view.state.tr.insertText("x", projection.to - 1));

    expect(resolveReferenceAtSelection(mounted.view.state)).toEqual({ label: "notex" });
  });

  it("reads the reference node where no projection stands in its place", async () => {
    const mounted = await mountEditor(DOCUMENT);
    const reference = getEditorNodePosition(mounted, "footnote_reference");
    // Without the projection plugin the reference stays the node the document holds, which is the
    // state this branch answers for: a selection that reaches one before a session opens over it.
    const { doc } = mounted.view.state;
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, reference) });

    expect(findFootnoteReferenceAtSelection(state, null)).toEqual({ label: "note" });
  });

  it("reports no reference where the caret is on ordinary text", async () => {
    const mounted = await mountEditor(DOCUMENT);

    setTextSelection(mounted.view, 2);

    expect(resolveReferenceAtSelection(mounted.view.state)).toBeNull();
  });
});
