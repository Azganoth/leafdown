import { imageSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import {
  CancellationTokenSource,
  isCancellationError,
  raceWithCancellation,
} from "@/lib/cancellation";
import { getErrorDescription, handleUnexpectedError } from "@/lib/errors";
import { MutableDisposable, toDisposable } from "@/lib/lifecycle";
import { isSameNullablePath } from "@/lib/path";

import { fetchRemoteImage } from "../services/markdownImageApi";
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
import { getRemoteImageErrorMessage, isFetchRemoteImageError } from "../utils/remoteImageErrors";
import { SOURCE_PROJECTION_IMAGE_POINTER_ENTRY_META } from "./sourceProjection";

type ImageResolutionState =
  | { status: "pending" }
  | { status: "resolved"; resolution: MarkdownImageResolution }
  | { status: "failed"; message: string };

type ImageResolutionInput = ResolveMarkdownImageOptions & { allowOutsideFolder: boolean };

type RemoteImageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; objectUrl: string }
  | { status: "failed"; message: string };

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
  private remoteImageState: RemoteImageState = { status: "idle" };
  private readonly remoteImageLoadCancellation = new MutableDisposable<CancellationTokenSource>();
  private readonly remoteImageObjectUrl = new MutableDisposable();

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
      this.resetRemoteImage();
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
    this.resetRemoteImage();
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

  // Approval covers this view and its current target only: nothing about it
  // survives a target edit or the view's destruction.
  private resetRemoteImage() {
    this.remoteImageLoadCancellation.clear();
    this.remoteImageObjectUrl.clear();
    this.remoteImageState = { status: "idle" };
  }

  private async loadRemoteImage() {
    if (this.remoteImageState.status === "loading" || this.remoteImageState.status === "loaded") {
      return;
    }

    const target = this.getImageAttrs().src;
    const loadCancellation = new CancellationTokenSource();

    this.remoteImageLoadCancellation.value = loadCancellation;
    this.remoteImageState = { status: "loading" };
    this.render();

    try {
      const bytes = await raceWithCancellation(loadCancellation.token, () =>
        fetchRemoteImage({ target }),
      );

      if (this.remoteImageLoadCancellation.value !== loadCancellation) {
        return;
      }

      const objectUrl = URL.createObjectURL(new Blob([bytes]));

      this.remoteImageObjectUrl.value = toDisposable(() => URL.revokeObjectURL(objectUrl));
      this.remoteImageState = { status: "loaded", objectUrl };
    } catch (error) {
      if (
        isCancellationError(error) ||
        this.remoteImageLoadCancellation.value !== loadCancellation
      ) {
        return;
      }

      if (!isFetchRemoteImageError(error)) {
        handleUnexpectedError(error, "fetchRemoteImage");
      }

      this.remoteImageState = { status: "failed", message: getRemoteImageErrorMessage(error) };
    }

    this.render();
  }

  private render() {
    const attrs = this.getImageAttrs();

    this.dom.dataset.imageState =
      this.remoteImageState.status === "loaded"
        ? "remoteLoaded"
        : getImageStateValue(this.resolutionState);
    this.updateSelectionPresentation();

    if (this.remoteImageState.status === "loaded") {
      this.renderImage(attrs, this.remoteImageState.objectUrl);
      return;
    }

    if (this.resolutionState.status === "resolved") {
      const { resolution } = this.resolutionState;

      if (resolution.kind === "renderable") {
        this.renderImage(attrs, resolution.assetUrl);
        return;
      }

      if (resolution.kind === "remoteBlocked" && resolution.host) {
        this.renderRemoteImagePlaceholder(resolution.host);
        return;
      }
    }

    this.dom.replaceChildren(
      createImagePlaceholder(this.resolutionState, () => {
        this.allowOutsideFolder = true;
        this.requestImageResolution();
      }),
    );
  }

  private renderImage(attrs: ImageAttrs, url: string) {
    const existingImage = this.dom.querySelector<HTMLImageElement>(".leafdown-markdown-image");
    const image =
      existingImage?.src === url ? existingImage : createImageElement(attrs, this.node.attrs, url);

    updateImageElement(image, attrs, this.node.attrs);

    if (image !== existingImage) {
      this.dom.replaceChildren(image);
    }
  }

  // Updated in place so the action keeps focus while a load moves through its states.
  private renderRemoteImagePlaceholder(host: string) {
    const existingPlaceholder = this.dom.querySelector<HTMLElement>(
      REMOTE_IMAGE_PLACEHOLDER_SELECTOR,
    );
    const placeholder =
      existingPlaceholder ??
      createRemoteImagePlaceholder(() => {
        void this.loadRemoteImage();
      });
    const message = placeholder.querySelector(".leafdown-image-placeholder__message");
    const action = placeholder.querySelector("button");
    const state = this.remoteImageState;

    placeholder.dataset.remoteImageState = state.status;

    if (message) {
      message.textContent = getRemoteImagePlaceholderText(state, host);
    }

    if (action) {
      action.textContent = state.status === "failed" ? "Retry" : "Load image";
      action.setAttribute("aria-disabled", String(state.status === "loading"));
    }

    if (placeholder !== existingPlaceholder) {
      this.dom.replaceChildren(placeholder);
    }
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

const REMOTE_IMAGE_PLACEHOLDER_SELECTOR =
  '.leafdown-image-placeholder[data-image-resolution="remoteBlocked"]';

const createRemoteImagePlaceholder = (loadImage: () => void) => {
  const placeholder = document.createElement("span");
  const message = document.createElement("span");
  const button = document.createElement("button");

  placeholder.className = "leafdown-image-placeholder";
  placeholder.dataset.imageResolution = "remoteBlocked";
  message.className = "leafdown-image-placeholder__message";
  message.setAttribute("aria-live", "polite");
  button.className = "leafdown-image-placeholder__action";
  button.type = "button";
  button.addEventListener("click", loadImage);
  placeholder.append(message, button);

  return placeholder;
};

const getRemoteImagePlaceholderText = (state: RemoteImageState, host: string) => {
  switch (state.status) {
    case "idle":
    case "loaded":
      return `Remote image from ${host}.`;

    case "loading":
      return `Loading image from ${host}...`;

    case "failed":
      return state.message;
  }
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
