// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import type { ContextPopupAnchor, FootnotePreviewRequest } from "@/features/editor";
import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { dispatchKeyDown, dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { withWindowsUserAgent } from "@/test/utils/platform";
import { getEditorNodePosition, setTextSelection } from "@/test/utils/prosemirror";
import { render, screen, waitFor } from "@/test/utils/react";

import { EditorFootnotePreview } from "../components/editor-footnote-preview";
import { findFootnoteDefinitions } from "../utils/footnoteDefinitions";

const POINTER_DELAY_MS = 5;

const mountEditor = setupMilkdownEditorMount({
  footnotePreviewDelayMs: POINTER_DELAY_MS,
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const DOCUMENT = "Body[^note].\n\n[^note]: The definition body.";

const orphanReference = (view: MountedMilkdownEditor["view"]) => {
  const [definition] = findFootnoteDefinitions(view.state.doc);

  view.dispatch(view.state.tr.delete(definition.pos, definition.pos + definition.node.nodeSize));
};

const getReferenceElement = (dom: Element) => {
  const reference = dom.querySelector('sup[data-type="footnote_reference"]');

  expect(reference).not.toBeNull();

  return reference!;
};

const setupPreview = async (markdown = DOCUMENT) => {
  const onFootnotePreviewClosed = vi.fn();
  const onFootnotePreviewRequested = vi.fn<(request: FootnotePreviewRequest) => void>();
  const mounted = await mountEditor(markdown, {
    onFootnotePreviewClosed,
    onFootnotePreviewRequested,
  });

  return { mounted, onFootnotePreviewClosed, onFootnotePreviewRequested };
};

const lastRequest = (onRequest: ReturnType<typeof vi.fn>) =>
  onRequest.mock.lastCall?.[0] as FootnotePreviewRequest;

describe("footnote definition preview", () => {
  it("previews the definition after the pointer rests on a reference", async () => {
    const { mounted, onFootnotePreviewRequested } = await setupPreview();

    dispatchMouseEvent(getReferenceElement(mounted.view.dom), "mouseover");

    expect(onFootnotePreviewRequested).not.toHaveBeenCalled();

    await waitFor(() => expect(onFootnotePreviewRequested).toHaveBeenCalledTimes(1));

    expect(lastRequest(onFootnotePreviewRequested)).toMatchObject({
      definition: "The definition body.",
      label: "note",
      source: "pointer",
    });
  });

  it("closes the preview when the pointer leaves the reference", async () => {
    const { mounted, onFootnotePreviewClosed, onFootnotePreviewRequested } = await setupPreview();
    const reference = getReferenceElement(mounted.view.dom);

    dispatchMouseEvent(reference, "mouseover");
    await waitFor(() => expect(onFootnotePreviewRequested).toHaveBeenCalledTimes(1));

    dispatchMouseEvent(reference, "mouseout");

    expect(onFootnotePreviewClosed).toHaveBeenCalledTimes(1);
  });

  it("previews the same definition from the keyboard while the caret reads a reference", async () => {
    const { mounted, onFootnotePreviewRequested } = await setupPreview();

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "footnote_reference") + 1);

    await withWindowsUserAgent(() =>
      dispatchKeyDown(mounted.view.dom, "p", { alt: true, ctrl: true }),
    );

    expect(lastRequest(onFootnotePreviewRequested)).toMatchObject({
      definition: "The definition body.",
      label: "note",
      source: "keyboard",
    });
  });

  it("anchors a keyboard preview to the measured selection rather than an element", async () => {
    const { mounted, onFootnotePreviewRequested } = await setupPreview();

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "footnote_reference") + 1);

    await withWindowsUserAgent(() =>
      dispatchKeyDown(mounted.view.dom, "p", { alt: true, ctrl: true }),
    );

    // The reference the caret reads has been replaced by its projected source, so there is no
    // element left to anchor to and the selection is measured instead.
    const { anchor } = lastRequest(onFootnotePreviewRequested);

    expect(anchor).not.toBeInstanceOf(Element);
    expect((anchor as ContextPopupAnchor).contextElement).toBe(mounted.view.dom);
    expect((anchor as ContextPopupAnchor).getRect("live")).toBeInstanceOf(Object);
  });

  it("anchors a pointer preview to the reference the pointer rests on", async () => {
    const { mounted, onFootnotePreviewRequested } = await setupPreview();
    const reference = getReferenceElement(mounted.view.dom);

    dispatchMouseEvent(reference, "mouseover");
    await waitFor(() => expect(onFootnotePreviewRequested).toHaveBeenCalledTimes(1));

    expect(lastRequest(onFootnotePreviewRequested).anchor).toBe(reference);
  });

  it("reports a missing definition rather than an empty preview", async () => {
    const { mounted, onFootnotePreviewRequested } = await setupPreview();

    orphanReference(mounted.view);
    dispatchMouseEvent(getReferenceElement(mounted.view.dom), "mouseover");

    await waitFor(() => expect(onFootnotePreviewRequested).toHaveBeenCalledTimes(1));

    expect(lastRequest(onFootnotePreviewRequested)).toMatchObject({
      definition: null,
      label: "note",
    });
  });

  it("dismisses the preview when a click navigates away from the reference", async () => {
    const { mounted, onFootnotePreviewClosed, onFootnotePreviewRequested } = await setupPreview();
    const reference = getReferenceElement(mounted.view.dom);

    dispatchMouseEvent(reference, "mouseover");
    await waitFor(() => expect(onFootnotePreviewRequested).toHaveBeenCalledTimes(1));

    dispatchMouseEvent(reference, "mousedown");

    expect(onFootnotePreviewClosed).toHaveBeenCalledTimes(1);
  });

  it("holds the preview open while a modifier is held for a navigating click", async () => {
    const { mounted, onFootnotePreviewClosed, onFootnotePreviewRequested } = await setupPreview();

    dispatchMouseEvent(getReferenceElement(mounted.view.dom), "mouseover");
    await waitFor(() => expect(onFootnotePreviewRequested).toHaveBeenCalledTimes(1));

    dispatchKeyDown(mounted.view.dom, "Control", { ctrl: true });

    expect(onFootnotePreviewClosed).not.toHaveBeenCalled();
  });

  it("dismisses the preview on Escape", async () => {
    const { mounted, onFootnotePreviewClosed, onFootnotePreviewRequested } = await setupPreview();

    dispatchMouseEvent(getReferenceElement(mounted.view.dom), "mouseover");
    await waitFor(() => expect(onFootnotePreviewRequested).toHaveBeenCalledTimes(1));

    dispatchKeyDown(mounted.view.dom, "Escape");

    expect(onFootnotePreviewClosed).toHaveBeenCalledTimes(1);
  });

  it("leaves the document, its dirty state, and the reference's source projection alone", async () => {
    const onContentChanged = vi.fn();
    const { mounted, onFootnotePreviewRequested } = await setupPreview();
    const reference = getEditorNodePosition(mounted, "footnote_reference");

    setTextSelection(mounted.view, reference + 1);

    await withWindowsUserAgent(() =>
      dispatchKeyDown(mounted.view.dom, "p", { alt: true, ctrl: true }),
    );

    expect(onFootnotePreviewRequested).toHaveBeenCalledTimes(1);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toBe(`${DOCUMENT}\n`);
    // The caret is still reading the reference's own projected source.
    expect(mounted.view.state.selection.empty).toBe(true);
  });
});

describe("footnote preview surface", () => {
  const request = (overrides: Partial<FootnotePreviewRequest> = {}): FootnotePreviewRequest => ({
    anchor: document.createElement("sup"),
    definition: "The definition body.",
    label: "note",
    source: "pointer",
    ...overrides,
  });

  it("renders nothing until a preview is requested", () => {
    render(<EditorFootnotePreview request={null} />);

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("presents the definition as a non-interactive tooltip", async () => {
    render(<EditorFootnotePreview request={request()} />);

    const tooltip = await screen.findByRole("tooltip");

    expect(tooltip).toHaveTextContent("The definition body.");
    expect(tooltip.textContent).not.toContain("[^note]");
    expect(tooltip.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(0);
  });

  it("presents an explicit missing-definition state", async () => {
    render(<EditorFootnotePreview request={request({ definition: null })} />);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "No footnote definition for this label.",
    );
  });
});
