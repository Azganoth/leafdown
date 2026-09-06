import { useMemo } from "react";

import { Tooltip, TooltipContent } from "@/components/ui/tooltip";

import type { FootnotePreviewRequest } from "../plugins/footnotePreview";

export interface EditorFootnotePreviewProps {
  request: FootnotePreviewRequest | null;
}

interface VirtualAnchor {
  contextElement: Element | undefined;
  getBoundingClientRect: () => DOMRect;
}

const isElementAnchor = (anchor: FootnotePreviewRequest["anchor"]): anchor is Element =>
  anchor instanceof Element;

export function EditorFootnotePreview({ request }: EditorFootnotePreviewProps) {
  // Held against the render rather than created during one: the positioner registers the anchor
  // once per identity, so a fresh identity is what moves the preview onto the reference it is now
  // describing.
  const anchor = useMemo<Element | VirtualAnchor | undefined>(() => {
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

  return (
    <Tooltip open={request !== null}>
      <TooltipContent
        anchor={anchor}
        // Base UI names the popup through a trigger's `aria-describedby`, which an anchored,
        // caret-driven preview has none of. The role carries the semantic instead, and the live
        // region is what announces a preview that opens without taking focus.
        aria-live="polite"
        className="max-w-sm flex-col items-start gap-1 px-3 py-2 text-left"
        role="tooltip"
        side="top"
      >
        <span className="font-mono text-[0.9em] opacity-70">{`[^${request?.label ?? ""}]`}</span>
        {request?.definition === null ? (
          <span className="italic">No footnote definition for this label.</span>
        ) : (
          <span className="whitespace-pre-wrap">{request?.definition}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
