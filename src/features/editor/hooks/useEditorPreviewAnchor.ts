import { useMemo } from "react";

import type { ContextPopupAnchor } from "../utils/contextPopupAnchor";

interface VirtualAnchor {
  contextElement: Element | undefined;
  getBoundingClientRect: () => DOMRect;
}

const isElementAnchor = (anchor: Element | ContextPopupAnchor): anchor is Element =>
  anchor instanceof Element;

/** The positioner anchor for a preview standing over an element or the measured selection. */
export const useEditorPreviewAnchor = (request: { anchor: Element | ContextPopupAnchor } | null) =>
  // Held against the render rather than created during one: the positioner registers the anchor
  // once per identity, so a fresh identity is what moves the preview onto the object it is now
  // describing.
  useMemo<Element | VirtualAnchor | undefined>(() => {
    if (!request) {
      return undefined;
    }

    if (isElementAnchor(request.anchor)) {
      return request.anchor;
    }

    const measured = request.anchor;

    return {
      contextElement: measured.contextElement,
      getBoundingClientRect: () => measured.getRect("live"),
    };
  }, [request]);
