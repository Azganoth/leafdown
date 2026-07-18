import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorNodePosition,
  getEditorTextPosition,
  setSelectionAtElementTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { getSourceProjectionClipboardSlice, hasActiveSourceProjection } from "./sourceProjection";

const mountEditor = setupMilkdownEditorMount();

const enterProjection = (
  mounted: MountedMilkdownEditor,
  selector: "a" | "code" | "del" | "em" | "strong",
) => {
  setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, selector));
  expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
};

const selectFootnoteReference = (
  mounted: MountedMilkdownEditor,
  predicate: (node: ProseMirrorNode) => boolean = () => true,
) => {
  const position = getEditorNodePosition(mounted, "footnote_reference", predicate);

  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, position)),
  );
  expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
};

const getClipboardHtml = (mounted: MountedMilkdownEditor) => {
  const slice = getSourceProjectionClipboardSlice(mounted.view.state);

  expect(slice).not.toBeNull();

  return mounted.view.serializeForClipboard(slice!).dom.innerHTML;
};

const parseClipboardHtml = (html: string) => {
  const template = document.createElement("template");
  template.innerHTML = html;

  return template.content;
};

describe("source projection clipboard slices", () => {
  it("resolves a clean complete projection without changing editor state", async () => {
    const mounted = await mountEditor("__Strong text__");

    enterProjection(mounted, "strong");

    const sourceStart = getEditorTextPosition(mounted, "__Strong text__");
    setTextSelection(mounted.view, sourceStart, sourceStart + "__Strong text__".length);

    const stateBefore = mounted.view.state;
    const html = getClipboardHtml(mounted);

    expect(mounted.view.state).toBe(stateBefore);
    expect(parseClipboardHtml(html).querySelector("strong")).toHaveTextContent("Strong text");
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.getMarkdown()).toBe("__Strong text__\n");
  });

  it("maps marked content semantically and declines delimiter-only selections", async () => {
    const mounted = await mountEditor("**Bold**");

    enterProjection(mounted, "strong");

    const sourceStart = getEditorTextPosition(mounted, "**Bold**");
    setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);

    const html = getClipboardHtml(mounted);
    expect(parseClipboardHtml(html).querySelector("strong")).toHaveTextContent("Bold");

    setTextSelection(mounted.view, sourceStart, sourceStart + 2);
    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();
  });

  it("uses edited valid source and preserves invalid source literally", async () => {
    const mounted = await mountEditor("**Bold**");

    enterProjection(mounted, "strong");

    let sourceStart = getEditorTextPosition(mounted, "**Bold**");
    setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);
    typeText(mounted.view, "Edited");

    sourceStart = getEditorTextPosition(mounted, "**Edited**");
    setTextSelection(mounted.view, sourceStart, sourceStart + "**Edited**".length);

    const validHtml = getClipboardHtml(mounted);
    expect(parseClipboardHtml(validHtml).querySelector("strong")).toHaveTextContent("Edited");

    setTextSelection(
      mounted.view,
      sourceStart + "**Edited*".length,
      sourceStart + "**Edited**".length,
    );
    typeText(mounted.view, "_");

    const invalidSource = "**Edited*_";
    setTextSelection(mounted.view, sourceStart, sourceStart + invalidSource.length);

    const invalidHtml = getClipboardHtml(mounted);
    const invalidFragment = parseClipboardHtml(invalidHtml);

    expect(invalidFragment.querySelector("strong, em")).not.toBeInTheDocument();
    expect(invalidFragment.textContent).toBe(invalidSource);
  });

  it("maps link labels but declines link destination-only selections", async () => {
    const source = "[Label](https://example.com)";
    const mounted = await mountEditor(source);

    enterProjection(mounted, "a");

    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart + 1, sourceStart + "[Label".length);

    const labelHtml = getClipboardHtml(mounted);
    const link = parseClipboardHtml(labelHtml).querySelector("a");

    expect(link).toHaveTextContent("Label");
    expect(link).toHaveAttribute("href", "https://example.com");

    const destinationFrom = source.indexOf("https://");
    const destinationTo = destinationFrom + "https://example.com".length;
    setTextSelection(mounted.view, sourceStart + destinationFrom, sourceStart + destinationTo);

    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();
  });

  it("maps complete atomic references but declines partial labels", async () => {
    const source = "[^note]";
    const mounted = await mountEditor(`Before${source} after\n\n[^note]: Detail`);

    selectFootnoteReference(mounted);

    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart, sourceStart + source.length);

    const slice = getSourceProjectionClipboardSlice(mounted.view.state);
    let hasFootnoteReference = false;
    slice?.content.descendants((node) => {
      hasFootnoteReference ||= node.type.name === "footnote_reference";
    });
    expect(hasFootnoteReference).toBe(true);

    setTextSelection(mounted.view, sourceStart + 2, sourceStart + source.length - 1);
    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();
  });
});
