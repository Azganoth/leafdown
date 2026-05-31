import { imageSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection } from "@milkdown/kit/prose/state";
import type { NodeViewConstructor } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { resolveMarkdownImage, type MarkdownImageResolution } from "../utils/imageResolution";

export interface MarkdownImageContext {
  documentPath: string | null;
  folderContextPath: string | null;
}

interface ImageAttrs {
  alt: string;
  src: string;
  title: string;
}

type ImageResolutionState =
  | { status: "pending" }
  | { status: "resolved"; resolution: MarkdownImageResolution }
  | { status: "failed"; message: string };

const defaultImageContext: MarkdownImageContext = {
  documentPath: null,
  folderContextPath: null,
};

export const createLeafdownImageViewPlugin = (
  getImageContext: () => MarkdownImageContext = () => defaultImageContext,
) =>
  $view(imageSchema.node, (): NodeViewConstructor => {
    return (initialNode, view, getPos) => {
      let currentNode = initialNode;
      let selected = false;
      let explicitLoad = false;
      let resolutionVersion = 0;
      let resolutionState: ImageResolutionState = { status: "pending" };
      let rawMarkdownDraft: string | null = null;

      const dom = document.createElement("span");
      dom.className = "leafdown-image-view";
      dom.dataset.imageState = "pending";

      const getAttrs = () => imageAttrsFromNode(currentNode);
      const selectNode = () => {
        const position = getPos();

        if (typeof position !== "number") {
          return;
        }

        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)));
        view.focus();
      };
      const setAttrs = (attrs: Partial<ImageAttrs>) => {
        const position = getPos();

        if (typeof position !== "number" || !view.editable) {
          return;
        }

        const nextAttrs = {
          ...getAttrs(),
          ...attrs,
        };

        if (attrs.src !== undefined && attrs.src !== getAttrs().src) {
          explicitLoad = false;
        }

        const tr = view.state.tr.setNodeMarkup(position, undefined, nextAttrs);

        view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, position)).scrollIntoView());
      };
      const requestResolution = () => {
        const version = ++resolutionVersion;
        const attrs = getAttrs();
        const context = getImageContext();

        resolutionState = { status: "pending" };
        render();

        resolveMarkdownImage({
          documentPath: context.documentPath,
          folderContextPath: context.folderContextPath,
          target: attrs.src,
          explicitLoad,
        })
          .then((resolution) => {
            if (version !== resolutionVersion) {
              return;
            }

            resolutionState = { status: "resolved", resolution };
            render();
          })
          .catch((error: unknown) => {
            if (version !== resolutionVersion) {
              return;
            }

            resolutionState = {
              status: "failed",
              message: error instanceof Error ? error.message : "Image could not be resolved",
            };
            render();
          });
      };
      const render = () => {
        const attrs = getAttrs();

        dom.dataset.imageState = getImageState(resolutionState);
        dom.classList.toggle("leafdown-image-view--selected", selected);
        dom.replaceChildren();

        if (selected) {
          dom.append(
            createRawMarkdownInput(attrs, setAttrs, rawMarkdownDraft, (value) => {
              rawMarkdownDraft = value;
            }),
          );
        } else {
          rawMarkdownDraft = null;
        }

        if (
          resolutionState.status === "resolved" &&
          resolutionState.resolution.kind === "renderable"
        ) {
          dom.append(createImageElement(attrs, resolutionState.resolution.assetUrl));
          return;
        }

        dom.append(
          createPlaceholder(resolutionState, attrs.src, () => {
            explicitLoad = true;
            requestResolution();
          }),
        );
      };

      dom.addEventListener("mousedown", (event) => {
        if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) {
          return;
        }

        event.preventDefault();
        selectNode();
      });

      requestResolution();

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type !== currentNode.type) {
            return false;
          }

          const previousSrc = getAttrs().src;

          currentNode = updatedNode;

          if (getAttrs().src !== previousSrc) {
            explicitLoad = false;
          }

          requestResolution();
          return true;
        },
        stopEvent: (event) =>
          event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement,
        ignoreMutation: () => true,
        selectNode: () => {
          selected = true;
          render();
        },
        deselectNode: () => {
          selected = false;
          rawMarkdownDraft = null;
          render();
        },
        destroy: () => {
          resolutionVersion += 1;
          dom.remove();
        },
      };
    };
  });

const imageAttrsFromNode = (node: ProseMirrorNode): ImageAttrs => ({
  alt: String(node.attrs.alt ?? ""),
  src: String(node.attrs.src ?? ""),
  title: String(node.attrs.title ?? ""),
});

const createImageElement = (attrs: ImageAttrs, assetUrl: string) => {
  const image = document.createElement("img");

  image.className = "leafdown-markdown-image";
  image.src = assetUrl;
  image.alt = attrs.alt;

  if (attrs.title) {
    image.title = attrs.title;
  }

  return image;
};

const createRawMarkdownInput = (
  attrs: ImageAttrs,
  setAttrs: (attrs: Partial<ImageAttrs>) => void,
  draft: string | null,
  setDraft: (value: string) => void,
) => {
  const input = document.createElement("input");

  input.className = "leafdown-image-markdown-input";
  input.type = "text";
  input.setAttribute("aria-label", "Image Markdown");
  input.value = draft ?? serializeImageMarkdown(attrs);

  input.addEventListener("input", () => {
    setDraft(input.value);

    const parsed = parseImageMarkdown(input.value);

    if (parsed) {
      setAttrs(parsed);
    }
  });

  return input;
};

const createPlaceholder = (
  resolutionState: ImageResolutionState,
  target: string,
  onLoadOutsideImage: () => void,
) => {
  const placeholder = document.createElement("span");
  const message = document.createElement("span");
  const resolutionKind =
    resolutionState.status === "resolved"
      ? resolutionState.resolution.kind
      : resolutionState.status;

  placeholder.className = "leafdown-image-placeholder";
  placeholder.dataset.imageResolution = resolutionKind;
  message.className = "leafdown-image-placeholder__message";
  message.textContent = getPlaceholderText(resolutionState, target);
  placeholder.append(message);

  if (
    resolutionState.status === "resolved" &&
    resolutionState.resolution.kind === "outsideFolder"
  ) {
    const button = document.createElement("button");

    button.className = "leafdown-image-placeholder__action";
    button.type = "button";
    button.textContent = "Load image";
    button.addEventListener("click", onLoadOutsideImage);
    placeholder.append(button);
  }

  return placeholder;
};

const getImageState = (resolutionState: ImageResolutionState) => {
  if (resolutionState.status !== "resolved") {
    return resolutionState.status;
  }

  return resolutionState.resolution.kind;
};

const getPlaceholderText = (resolutionState: ImageResolutionState, target: string) => {
  if (resolutionState.status === "pending") {
    return "Resolving image...";
  }

  if (resolutionState.status === "failed") {
    return resolutionState.message;
  }

  switch (resolutionState.resolution.kind) {
    case "missing":
      return `Image not found: ${target}`;

    case "untitledRelative":
      return "Save the document to resolve this image.";

    case "outsideFolder":
      return "Image is outside the current folder.";

    case "remoteBlocked":
      return "Remote images are blocked.";

    case "unsupportedFormat":
      return "Unsupported image format.";

    case "unsupportedTarget":
      return "Unsupported image target.";

    case "invalidPath":
      return "Invalid image path.";

    case "permissionDenied":
      return "Image access denied.";

    case "metadataFailed":
      return "Image metadata unavailable.";

    case "renderable":
      return "";
  }
};

const serializeImageMarkdown = ({ alt, src, title }: ImageAttrs) =>
  title ? `![${alt}](${src} "${title.replaceAll('"', '\\"')}")` : `![${alt}](${src})`;

const parseImageMarkdown = (value: string): ImageAttrs | null => {
  const match = /^!\[(?<alt>.*)\]\((?<body>.*)\)$/u.exec(value.trim());
  const groups = match?.groups;

  if (!groups) {
    return null;
  }

  const body = groups.body.trim();
  const titleMatch = /^(?<src>.*)\s+"(?<title>[^"]*)"\s*$/u.exec(body);

  return {
    alt: groups.alt,
    src: titleMatch?.groups?.src.trim() ?? body,
    title: titleMatch?.groups?.title ?? "",
  };
};
