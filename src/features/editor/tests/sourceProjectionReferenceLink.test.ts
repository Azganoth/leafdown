// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  getEditorTextPosition,
  getMarkNames,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  ...createMarkdownReferenceContext(),
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const DEFINITION = '[garden report]: /garden "Report"';
const FULL_REFERENCE = "[Full reference][garden report]";

const mountReference = (reference: string) =>
  mountProjectionEditor(`${DEFINITION}\n\n${reference}\n`);

const getLabelPresentation = (mounted: MountedMilkdownEditor) =>
  Array.from(
    mounted.view.dom.querySelectorAll(".leafdown-source-projection__content--link-label"),
    (fragment) => fragment.textContent,
  ).join("");

// A projection shows what the file will be written with, so a reference shows its own tail rather
// than the destination its definition names.
describe("reference link source projection", () => {
  it.each([
    { label: "Full reference", reference: FULL_REFERENCE },
    { label: "garden report", reference: "[garden report][]" },
    { label: "garden report", reference: "[garden report]" },
  ])("projects the source of $reference", async ({ label, reference }) => {
    const mounted = await mountReference(reference);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, label) + 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(reference);
    expect(getLabelPresentation(mounted)).toBe(label);
  });

  it("projects a reference inside a wrapping mark as one outer source", async () => {
    const wrapped = `**${FULL_REFERENCE}**`;
    const mounted = await mountReference(wrapped);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Full reference") + 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(wrapped);
  });

  it("restores a reference left unchanged", async () => {
    const mounted = await mountReference(FULL_REFERENCE);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Full reference") + 1);
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${DEFINITION}\n\n${FULL_REFERENCE}\n`);
  });

  it("keeps the reference when its label is edited", async () => {
    const mounted = await mountReference(FULL_REFERENCE);

    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "Full reference") + "Full reference".length,
    );
    typeText(mounted.view, "!");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${DEFINITION}\n\n[Full reference!][garden report]\n`);
  });

  it("becomes the literal text its source spells when the tail is broken", async () => {
    const mounted = await mountReference(FULL_REFERENCE);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Full reference") + 1);

    const { view } = mounted;
    const tailStart = getEditorTextPosition(mounted, "[garden report]");

    view.dispatch(view.state.tr.delete(tailStart, tailStart + 1));
    setSelectionAtDocumentEnd(view);

    expect(getMarkNames(view.state.doc)).not.toContain("link");
    expect(mounted.getMarkdown()).toBe(`${DEFINITION}\n\n[Full reference]garden report]\n`);
  });

  // A reference written as text this session is the literal text it spells until the file is read
  // back, which is the rule an escaped construct already follows.
  it("leaves a reference typed into the document as literal text", async () => {
    const mounted = await mountProjectionEditor(`${DEFINITION}\n\ntail\n`);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "tail"));
    typeText(mounted.view, "[a][garden report] ");
    setSelectionAtDocumentEnd(mounted.view);

    expect(getMarkNames(mounted.view.state.doc)).not.toContain("link");
  });
});
