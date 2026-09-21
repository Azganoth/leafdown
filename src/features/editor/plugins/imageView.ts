import { imageSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { CancellationTokenSource, isCancellationError } from "@/lib/cancellation";
import { getErrorDescription, handleUnexpectedError } from "@/lib/errors";
import { MutableDisposable } from "@/lib/lifecycle";
import { isSameNullablePath } from "@/lib/path";

import { writeImageNodeAttrsToDom } from "../utils/characterReferenceMarkdown";
import {
  resolveMarkdownImage,
  type MarkdownImageResolution,
  type ResolveMarkdownImageOptions,
} from "../utils/imageResolution";
import {
  EMPTY_MARKDOWN_REFERENCE_CONTEXT,
  type MarkdownReferenceContext,
} from "../utils/markdownReferences";
import { SOURCE_PROJECTION_IMAGE_POINTER_ENTRY_META } from "./sourceProjection";

type ImageResolutionState =
  | { status: "pending" }
  | { status: "resolved"; resolution: MarkdownImageResolution }
  | { status: "failed"; message: string };

type ImageResolutionInput = ResolveMarkdownImageOptions & { allowOutsideFolder: boolean };

interface ImageAttrs {
  alt: string;
  src: string;
  title: string;
}

export const createLeafdownImageViewPlugin = (
  getMarkdownReferenceContext: () => MarkdownReferenceContext = () =>
    EMPTY_MARKDOWN_REFERENCE_CONTEXT,
) =>
  $view(
    imageSchema.node,
    () => (initialNode, view, getPos) =>
      new LeafdownImageNodeView(initialNode, view, getPos, getMarkdownReferenceContext),
  );

class LeafdownImageNodeView implements NodeView {
  readonly dom = document.createElement("span");

  private node: ProseMirrorNode;
  private isSelected = false;
  private allowOutsideFolder = false;
  private readonly currentResolutionCancellation = new MutableDisposable<CancellationTokenSource>();
  private currentResolutionInput: ImageResolutionInput | null = null;
  private resolutionState: ImageResolutionState = { status: "pending" };

  constructor(
    initialNode: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly getMarkdownReferenceContext: () => MarkdownReferenceContext,
  ) {
    this.node = initialNode;
    this.dom.className = "leafdown-image-view";
    this.dom.dataset.imageState = "pending";
    this.dom.addEventListener("mousedown", this.handleMouseDown);
    this.requestImageResolution();
  }

  update(updatedNode: ProseMirrorNode) {
    if (updatedNode.type !== this.node.type) {
      return false;
    }

    const previousAttrs = this.getImageAttrs();
    const nextAttrs = imageAttrsFromNode(updatedNode);

    this.node = updatedNode;

    if (nextAttrs.src !== previousAttrs.src) {
      this.allowOutsideFolder = false;
    }

    this.requestImageResolution();
    return true;
  }

  stopEvent(event: Event) {
    return event.target instanceof HTMLButtonElement;
  }

  ignoreMutation() {
    return true;
  }

  selectNode() {
    this.isSelected = true;
    this.updateSelectionPresentation();
  }

  deselectNode() {
    this.isSelected = false;
    this.updateSelectionPresentation();
  }

  destroy() {
    this.cancelCurrentResolution();
    this.dom.removeEventListener("mousedown", this.handleMouseDown);
    this.dom.remove();
  }

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (event.target instanceof HTMLButtonElement) {
      return;
    }

    event.preventDefault();
    this.selectImageNode();
  };

  private getImageAttrs() {
    return imageAttrsFromNode(this.node);
  }

  private selectImageNode() {
    const position = this.getPos();

    if (typeof position !== "number") {
      return;
    }

    const isLinked = this.node.marks.some((mark) => mark.type.name === "link");
    const selection = isLinked
      ? TextSelection.create(this.view.state.doc, position + this.node.nodeSize)
      : NodeSelection.create(this.view.state.doc, position);

    this.view.dispatch(
      this.view.state.tr
        .setSelection(selection)
        .setMeta(SOURCE_PROJECTION_IMAGE_POINTER_ENTRY_META, true),
    );
    this.view.focus();
  }

  private createResolutionInput(): ImageResolutionInput {
    const attrs = this.getImageAttrs();
    const context = this.getMarkdownReferenceContext();

    return {
      documentPath: context.documentPath,
      allowOutsideFolder: this.allowOutsideFolder,
      folderContextPath: context.folderContextPath,
      target: attrs.src,
    };
  }

  private requestImageResolution() {
    const input = this.createResolutionInput();

    if (
      this.currentResolutionInput &&
      isSameImageResolutionInput(this.currentResolutionInput, input)
    ) {
      this.render();
      return;
    }

    void this.resolveImageResolution(input);
  }

  private async resolveImageResolution(input: ImageResolutionInput) {
    const nextResolutionCancellation = new CancellationTokenSource();

    this.cancelCurrentResolution();
    this.currentResolutionCancellation.value = nextResolutionCancellation;
    this.currentResolutionInput = input;
    this.resolutionState = { status: "pending" };
    this.render();

    try {
      const resolution = await resolveMarkdownImage(input, nextResolutionCancellation.token);
      if (this.currentResolutionCancellation.value !== nextResolutionCancellation) {
        return;
      }

      this.resolutionState = { status: "resolved", resolution };
      this.render();
    } catch (error) {
      if (
        isCancellationError(error) ||
        this.currentResolutionCancellation.value !== nextResolutionCancellation
      ) {
        return;
      }

      this.resolutionState = {
        status: "failed",
        message: getErrorDescription(error) ?? "Image could not be resolved",
      };
      handleUnexpectedError(error, "resolveMarkdownImage");
      this.currentResolutionInput = null;
      this.render();
    }
  }

  private cancelCurrentResolution() {
    this.currentResolutionCancellation.clear();
  }

  private render() {
    const attrs = this.getImageAttrs();

    this.dom.dataset.imageState = getImageStateValue(this.resolutionState);
    this.updateSelectionPresentation();

    if (
      this.resolutionState.status === "resolved" &&
      this.resolutionState.resolution.kind === "renderable"
    ) {
      const existingImage = this.dom.querySelector<HTMLImageElement>(".leafdown-markdown-image");
      const image =
        existingImage?.src === this.resolutionState.resolution.assetUrl
          ? existingImage
          : createImageElement(attrs, this.node.attrs, this.resolutionState.resolution.assetUrl);

      updateImageElement(image, attrs, this.node.attrs);

      if (image !== existingImage) {
        this.dom.replaceChildren(image);
      }

      return;
    }

    this.dom.replaceChildren(
      createImagePlaceholder(this.resolutionState, () => {
        this.allowOutsideFolder = true;
        this.requestImageResolution();
      }),
    );
  }

  private updateSelectionPresentation() {
    this.dom.classList.toggle("leafdown-image-view--selected", this.isSelected);
  }
}

const readNodeString = (node: ProseMirrorNode, key: string) => {
  const value = node.attrs[key];

  return typeof value === "string" ? value : "";
};

const imageAttrsFromNode = (node: ProseMirrorNode): ImageAttrs => ({
  alt: readNodeString(node, "alt"),
  src: readNodeString(node, "src"),
  title: readNodeString(node, "title"),
});

const isSameImageResolutionInput = (
  currentInput: ImageResolutionInput,
  nextInput: ImageResolutionInput,
) =>
  isSameNullablePath(currentInput.documentPath, nextInput.documentPath) &&
  currentInput.allowOutsideFolder === nextInput.allowOutsideFolder &&
  isSameNullablePath(currentInput.folderContextPath, nextInput.folderContextPath) &&
  currentInput.target === nextInput.target;

const createImageElement = (
  attrs: ImageAttrs,
  nodeAttrs: Record<string, unknown>,
  assetUrl: string,
) => {
  const image = document.createElement("img");

  image.className = "leafdown-markdown-image";
  image.src = assetUrl;

  updateImageElement(image, attrs, nodeAttrs);

  return image;
};

const updateImageElement = (
  image: HTMLImageElement,
  attrs: ImageAttrs,
  nodeAttrs: Record<string, unknown>,
) => {
  image.alt = attrs.alt;

  if (attrs.title) {
    image.title = attrs.title;
  } else {
    image.removeAttribute("title");
  }

  writeImageNodeAttrsToDom(image, nodeAttrs);
};

const createImagePlaceholder = (
  resolutionState: ImageResolutionState,
  allowOutsideFolderAccess: () => void,
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
  message.textContent = getPlaceholderText(resolutionState);
  placeholder.append(message);

  if (
    resolutionState.status === "resolved" &&
    resolutionState.resolution.kind === "outsideFolder"
  ) {
    const button = document.createElement("button");

    button.className = "leafdown-image-placeholder__action";
    button.type = "button";
    button.textContent = "Load image";
    button.addEventListener("click", allowOutsideFolderAccess);
    placeholder.append(button);
  }

  return placeholder;
};

const getImageStateValue = (resolutionState: ImageResolutionState) =>
  resolutionState.status === "resolved" ? resolutionState.resolution.kind : resolutionState.status;

const getPlaceholderText = (resolutionState: ImageResolutionState) => {
  if (resolutionState.status === "pending") {
    return "Resolving image...";
  }

  if (resolutionState.status === "failed") {
    return "Image unavailable.";
  }

  switch (resolutionState.resolution.kind) {
    case "missing":
      return "Image not found.";

    case "untitledRelative":
      return "Save the document to resolve this image.";

    case "outsideFolder":
      return "Image outside the current folder.";

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
