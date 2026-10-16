import { parserCtx } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { isPrimaryModifierEvent, normalizeKeyboardKey } from "@/lib/input";
import { getPathParts, isSamePath } from "@/lib/path";

import {
  resolveMarkdownLinkTarget,
  resolveWikiLinkTarget,
  type ResolveMarkdownLinkTargetResult,
} from "../services/markdownLinkApi";
import { createContextPopupAnchor, type ContextPopupAnchor } from "../utils/contextPopupAnchor";
import { getFootnoteReferenceElementAtTarget } from "../utils/footnoteReferenceElements";
import type { MarkdownLinkContext } from "../utils/linkActivation";
import {
  findFragmentPreviewHeading,
  findLinkPreviewTargetAtSelection,
  getDocumentPreviewText,
  getHeadingContentStart,
  getLinkPreviewDestination,
  getLinkPreviewTargetAtElement,
  type LinkPreviewTarget,
} from "../utils/linkPreview";
import { findWikiHeading } from "../utils/wikiHeadings";
import { getSourceProjectionCanonicalState } from "./sourceProjection";

export const leafdownLinkPreviewPluginKey = new PluginKey("leafdownLinkPreview");

/** How long a pointer rests on a link before its document is previewed. */
export const LINK_PREVIEW_POINTER_DELAY_MS = 500;

const PREVIEW_KEY = "p";

export type LinkPreviewSource = "keyboard" | "pointer";

export type LinkPreviewContent =
  | { kind: "excerpt"; text: string }
  | { kind: "missingDocument" }
  | { kind: "missingHeading" }
  | { kind: "unavailable" }
  | { kind: "unsavedDocument" };

export interface LinkPreviewDescription {
  content: LinkPreviewContent;
  /** The linked file's name, or `null` where the link names a heading in its own document. */
  documentName: string | null;
  heading: string | null;
}

export interface LinkPreviewRequest extends LinkPreviewDescription {
  anchor: Element | ContextPopupAnchor;
  source: LinkPreviewSource;
}

export interface LeafdownLinkPreviewPluginOptions {
  onClose?: () => void;
  onRequest?: (request: LinkPreviewRequest) => void;
  pointerDelayMs?: number;
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

const isPreviewKey = (event: KeyboardEvent) =>
  isPrimaryModifierEvent(event) && event.altKey && normalizeKeyboardKey(event.key) === PREVIEW_KEY;

const getFileName = (path: string) => getPathParts(path).name || path;

const getLiveDocument = (view: EditorView) =>
  getSourceProjectionCanonicalState(view.state)?.doc ?? view.state.doc;

const describeDocument = (
  doc: ProseMirrorNode,
  target: LinkPreviewTarget,
  documentName: string | null,
  heading: string | null,
): LinkPreviewDescription => {
  if (heading === null) {
    return {
      content: { kind: "excerpt", text: getDocumentPreviewText(doc) },
      documentName,
      heading,
    };
  }

  const match =
    target.kind === "wiki"
      ? findWikiHeading(doc, heading)
      : findFragmentPreviewHeading(doc, heading);

  if (!match) {
    return { content: { kind: "missingHeading" }, documentName, heading };
  }

  // A fragment can spell the heading's anchor rather than its text, which is what a reader knows.
  return {
    content: {
      kind: "excerpt",
      text: getDocumentPreviewText(doc, getHeadingContentStart(doc, match)),
    },
    documentName,
    heading: match.text,
  };
};

// Outside-folder Markdown is read like any other, as wiki link status already does, because a
// preview opens nothing that would need the confirmation following the link asks for.
const resolveTarget = async (
  context: MarkdownLinkContext,
  target: LinkPreviewTarget,
  allowOutsideFolder = false,
): Promise<ResolveMarkdownLinkTargetResult> => {
  const args = {
    allowOutsideFolder,
    documentPath: context.documentPath,
    folderContextPath: context.folderContextPath,
    target: target.kind === "wiki" ? target.link.path : target.target,
  };
  const result = await (target.kind === "wiki"
    ? resolveWikiLinkTarget(args)
    : resolveMarkdownLinkTarget(args));

  return result.kind === "outsideFolder" && !allowOutsideFolder
    ? resolveTarget(context, target, true)
    : result;
};

export const createLeafdownLinkPreviewPlugin = (
  getContext: () => MarkdownLinkContext,
  options: LeafdownLinkPreviewPluginOptions = {},
) =>
  $prose((ctx) => {
    const pointerDelayMs = options.pointerDelayMs ?? LINK_PREVIEW_POINTER_DELAY_MS;
    let anchor: ContextPopupAnchor | null = null;
    let hoveredLink: Element | null = null;
    let pointerTimer: ReturnType<typeof setTimeout> | null = null;
    // Bumped by every close and request, so a description that arrives after either is dropped.
    let generation = 0;
    let isOpen = false;

    const readDocument = async (path: string) => {
      const { onReadMarkdownPath } = getContext();

      if (!onReadMarkdownPath) {
        return null;
      }

      try {
        const content = await onReadMarkdownPath(path);

        return ctx.get(parserCtx)(content);
      } catch {
        return null;
      }
    };

    /** `null` for a link Leafdown does not open as a document, which has nothing to preview. */
    const describe = async (
      view: EditorView,
      target: LinkPreviewTarget,
    ): Promise<LinkPreviewDescription | null> => {
      const { path, heading } = getLinkPreviewDestination(target);

      if (!path) {
        return describeDocument(getLiveDocument(view), target, null, heading);
      }

      const unavailable = (name: string, kind: LinkPreviewContent["kind"] = "unavailable") =>
        ({ content: { kind }, documentName: name, heading }) as LinkPreviewDescription;
      let result: ResolveMarkdownLinkTargetResult;

      try {
        result = await resolveTarget(getContext(), target);
      } catch {
        return unavailable(getFileName(path));
      }

      switch (result.kind) {
        case "externalWeb":
        case "localFile":
        case "unsupportedTarget":
          return null;

        case "missing":
          return unavailable(getFileName(result.path), "missingDocument");

        case "untitledRelative":
          return unavailable(getFileName(path), "unsavedDocument");

        case "invalidPath":
        case "outsideFolder":
        case "permissionDenied":
        case "metadataFailed":
          return unavailable(getFileName(result.path || path));

        case "localMarkdown": {
          const name = getFileName(result.path);
          const { documentPath } = getContext();

          if (documentPath && isSamePath(result.path, documentPath)) {
            return describeDocument(getLiveDocument(view), target, name, heading);
          }

          const doc = await readDocument(result.path);

          return doc ? describeDocument(doc, target, name, heading) : unavailable(name);
        }
      }
    };

    const cancelPointerTimer = () => {
      if (pointerTimer !== null) {
        clearTimeout(pointerTimer);
        pointerTimer = null;
      }
    };

    const close = () => {
      cancelPointerTimer();
      hoveredLink = null;
      generation += 1;

      if (!isOpen) {
        return false;
      }

      isOpen = false;
      options.onClose?.();

      return true;
    };

    const request = async (
      view: EditorView,
      target: LinkPreviewTarget,
      requestAnchor: Element | ContextPopupAnchor,
      source: LinkPreviewSource,
      isCurrent: () => boolean,
    ) => {
      const requestGeneration = ++generation;
      const description = await describe(view, target);

      if (requestGeneration !== generation || view.isDestroyed || !isCurrent()) {
        return;
      }

      if (!description) {
        close();
        return;
      }

      isOpen = true;
      options.onRequest?.({ ...description, anchor: requestAnchor, source });
    };

    const handlePointerOver = (view: EditorView, event: MouseEvent) => {
      // A footnote reference in a link's label previews its own definition instead.
      const found = getFootnoteReferenceElementAtTarget(view.dom, event.target)
        ? null
        : getLinkPreviewTargetAtElement(view.dom, event.target);

      if (found && found.element === hoveredLink) {
        return;
      }

      close();

      if (!found) {
        return;
      }

      const { element, target } = found;

      hoveredLink = element;
      pointerTimer = setTimeout(() => {
        pointerTimer = null;

        if (hoveredLink === element) {
          void request(view, target, element, "pointer", () => hoveredLink === element);
        }
      }, pointerDelayMs);
    };

    const handlePreviewKey = (view: EditorView) => {
      const target = findLinkPreviewTargetAtSelection(view.state);

      if (!target) {
        return false;
      }

      cancelPointerTimer();
      hoveredLink = null;
      anchor ??= createContextPopupAnchor(view);
      void request(view, target, anchor, "keyboard", () => true);

      return true;
    };

    return new Plugin({
      key: leafdownLinkPreviewPluginKey,
      view: () => ({
        destroy: () => {
          cancelPointerTimer();
          generation += 1;
        },
      }),
      props: {
        handleDOMEvents: {
          mouseover: (view, event) => {
            handlePointerOver(view, event);

            return false;
          },
          mousedown: () => {
            close();

            return false;
          },
          mouseout: (view, event) => {
            if (
              hoveredLink !== null &&
              !(event.relatedTarget instanceof Node && hoveredLink.contains(event.relatedTarget))
            ) {
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

          if (!MODIFIER_KEYS.has(event.key)) {
            close();
          }

          return false;
        },
      },
    });
  });
