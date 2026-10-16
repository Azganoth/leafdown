import type { EditorView } from "@milkdown/kit/prose/view";

export const EDITOR_OVERLAY_ATTRIBUTE = "data-leafdown-editor-overlay";

const overlayOwners = new WeakMap<Element, EditorView>();

export const markEditorOverlay = (view: EditorView, overlay: Element) => {
  overlay.setAttribute(EDITOR_OVERLAY_ATTRIBUTE, "");
  overlayOwners.set(overlay, view);
};

// An overlay is appended outside the editor, so whether a control in one belongs to a given
// editor is recorded rather than read from the tree.
export const isEditorChromeElement = (view: EditorView, element: Element) => {
  const overlay = element.closest(`[${EDITOR_OVERLAY_ATTRIBUTE}]`);

  return overlay ? overlayOwners.get(overlay) === view : view.dom.contains(element);
};

// Editor overlays lie over the document from outside it, so the element beneath them decides
// whether the pointer is over the document or over something covering it, such as a menu.
export const getEditorSurfaceElementAt = (view: EditorView, x: number, y: number) =>
  view.dom.ownerDocument
    .elementsFromPoint?.(x, y)
    .find((element) => !element.closest(`[${EDITOR_OVERLAY_ATTRIBUTE}]`));

export const isEditorSurfaceElement = (view: EditorView, element: Element | undefined) =>
  !element || element.contains(view.dom) || view.dom.contains(element);
