import type { EditorView } from "@milkdown/kit/prose/view";

export const EDITOR_OVERLAY_ATTRIBUTE = "data-leafdown-editor-overlay";

// Editor overlays lie over the document from outside it, so the element beneath them decides
// whether the pointer is over the document or over something covering it, such as a menu.
export const getEditorSurfaceElementAt = (view: EditorView, x: number, y: number) =>
  view.dom.ownerDocument
    .elementsFromPoint?.(x, y)
    .find((element) => !element.closest(`[${EDITOR_OVERLAY_ATTRIBUTE}]`));

export const isEditorSurfaceElement = (view: EditorView, element: Element | undefined) =>
  !element || element.contains(view.dom) || view.dom.contains(element);
