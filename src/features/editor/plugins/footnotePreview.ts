import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { isPrimaryModifierEvent, normalizeKeyboardKey } from "@/lib/input";

import { createContextPopupAnchor, type ContextPopupAnchor } from "../utils/contextPopupAnchor";
import {
  findFootnoteDefinitionByLabel,
  findFootnoteReferenceAtSelection,
  getFootnoteDefinitionPreviewText,
} from "../utils/footnoteDefinitions";
import {
  getFootnoteReferenceElementAtTarget,
  getFootnoteReferenceLabelAtTarget,
} from "../utils/footnoteReferenceElements";
import { getActiveSourceProjectionRange } from "./sourceProjection";

export const leafdownFootnotePreviewPluginKey = new PluginKey("leafdownFootnotePreview");

/** How long a pointer rests on a reference before its definition is previewed. */
export const FOOTNOTE_PREVIEW_POINTER_DELAY_MS = 500;

const PREVIEW_KEY = "p";

export type FootnotePreviewSource = "keyboard" | "pointer";

export interface FootnotePreviewRequest {
  anchor: Element | ContextPopupAnchor;
  /** `null` where the label names no definition the document holds. */
  definition: string | null;
  label: string;
  source: FootnotePreviewSource;
}

export interface LeafdownFootnotePreviewPluginOptions {
  onClose?: () => void;
  onRequest?: (request: FootnotePreviewRequest) => void;
  pointerDelayMs?: number;
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

const isPreviewKey = (event: KeyboardEvent) =>
  isPrimaryModifierEvent(event) && event.altKey && normalizeKeyboardKey(event.key) === PREVIEW_KEY;

const describeDefinition = (view: EditorView, label: string) => {
  const definition = findFootnoteDefinitionByLabel(view.state.doc, label);

  return definition ? getFootnoteDefinitionPreviewText(definition.node) : null;
};

export const createLeafdownFootnotePreviewPlugin = (
  options: LeafdownFootnotePreviewPluginOptions = {},
) =>
  $prose(() => {
    const pointerDelayMs = options.pointerDelayMs ?? FOOTNOTE_PREVIEW_POINTER_DELAY_MS;
    // The anchor measures the live selection, so one per editor serves every keyboard request.
    let anchor: ContextPopupAnchor | null = null;
    let hoveredReference: Element | null = null;
    let pointerTimer: ReturnType<typeof setTimeout> | null = null;
    let isOpen = false;

    const cancelPointerTimer = () => {
      if (pointerTimer !== null) {
        clearTimeout(pointerTimer);
        pointerTimer = null;
      }
    };

    const close = () => {
      cancelPointerTimer();
      hoveredReference = null;

      if (!isOpen) {
        return false;
      }

      isOpen = false;
      options.onClose?.();

      return true;
    };

    const open = (request: FootnotePreviewRequest) => {
      isOpen = true;
      options.onRequest?.(request);
    };

    const openForPointer = (view: EditorView, reference: Element, label: string) => {
      pointerTimer = null;

      if (hoveredReference !== reference || view.isDestroyed) {
        return;
      }

      open({
        anchor: reference,
        definition: describeDefinition(view, label),
        label,
        source: "pointer",
      });
    };

    const handlePointerOver = (view: EditorView, event: MouseEvent) => {
      const reference = getFootnoteReferenceElementAtTarget(view.dom, event.target);

      if (reference === hoveredReference) {
        return;
      }

      close();

      if (!reference) {
        return;
      }

      const label = getFootnoteReferenceLabelAtTarget(view.dom, reference);

      if (label === null) {
        return;
      }

      hoveredReference = reference;
      pointerTimer = setTimeout(() => openForPointer(view, reference, label), pointerDelayMs);
    };

    const handlePreviewKey = (view: EditorView) => {
      const reference = findFootnoteReferenceAtSelection(
        view.state,
        getActiveSourceProjectionRange(view.state),
      );

      if (!reference) {
        return false;
      }

      // Replaced rather than closed and reopened, so a second request does not flash the preview
      // away between the two.
      cancelPointerTimer();
      hoveredReference = null;
      anchor ??= createContextPopupAnchor(view);
      open({
        anchor,
        definition: describeDefinition(view, reference.label),
        label: reference.label,
        source: "keyboard",
      });

      return true;
    };

    return new Plugin({
      key: leafdownFootnotePreviewPluginKey,
      view: () => ({ destroy: cancelPointerTimer }),
      props: {
        handleDOMEvents: {
          mouseover: (view, event) => {
            handlePointerOver(view, event);

            return false;
          },
          // The pointer stays on the reference through a click, so nothing else would take the
          // preview away from over the caret's new home once a modifier click has navigated.
          mousedown: () => {
            close();

            return false;
          },
          mouseout: (view, event) => {
            if (getFootnoteReferenceElementAtTarget(view.dom, event.relatedTarget) === null) {
              close();
            }

            return false;
          },
        },
        handleKeyDown: (view, event) => {
          if (isPreviewKey(event)) {
            event.preventDefault();

            return handlePreviewKey(view);
          }

          if (event.key === "Escape") {
            return close();
          }

          // A preview reports what the document says, so an edit or a move leaves it behind rather
          // than describing a reference the caret has left. A modifier on its own is neither, and
          // holding one is how a pointer navigates from the preview it is reading.
          if (!MODIFIER_KEYS.has(event.key)) {
            close();
          }

          return false;
        },
      },
    });
  });
