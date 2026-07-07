import { imageSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { CancellationTokenSource, isCancellationError } from "@/lib/cancellation";
import { getErrorDescription, handleUnexpectedError } from "@/lib/errors";
import { MutableDisposable } from "@/lib/lifecycle";
import { isSameNullablePath } from "@/lib/path";

import {
  parseImageMarkdown,
  serializeImageMarkdown,
  type ImageMarkdownAttrs,
} from "../utils/imageMarkdown";
import {
  resolveMarkdownImage,
  type MarkdownImageResolution,
  type ResolveMarkdownImageOptions,
} from "../utils/imageResolution";
import {
  EMPTY_MARKDOWN_REFERENCE_CONTEXT,
  type MarkdownReferenceContext,
} from "../utils/markdownReferences";

type ImageResolutionState =
  | { status: "pending" }
  | { status: "resolved"; resolution: MarkdownImageResolution }
  | { status: "failed"; message: string };

type ImageResolutionInput = ResolveMarkdownImageOptions & { allowOutsideFolder: boolean };

interface RawMarkdownFocusState {
  selectionDirection: "backward" | "forward" | "none" | null;
  selectionEnd: number | null;
  selectionStart: number | null;
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
  private rawMarkdownDraft: string | null = null;
  private rawMarkdownInputElement: HTMLInputElement | null = null;

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
    return event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement;
  }

  ignoreMutation() {
    return true;
  }

  selectNode() {
    this.isSelected = true;
    this.render();
  }

  deselectNode() {
    this.isSelected = false;
    this.rawMarkdownDraft = null;
    this.render();
  }

  destroy() {
    this.cancelCurrentResolution();
    this.dom.removeEventListener("mousedown", this.handleMouseDown);
    this.dom.remove();
  }

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) {
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

    this.view.dispatch(
      this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, position)),
    );
    this.view.focus();
  }

  private readonly updateImageAttrs = (attrs: Partial<ImageMarkdownAttrs>) => {
    const position = this.getPos();

    if (typeof position !== "number" || !this.view.editable) {
      return;
    }

    const currentAttrs = this.getImageAttrs();
    const nextAttrs = {
      ...currentAttrs,
      ...attrs,
    };

    if (attrs.src !== undefined && attrs.src !== currentAttrs.src) {
      this.allowOutsideFolder = false;
    }

    const tr = this.view.state.tr.setNodeMarkup(position, undefined, nextAttrs);

    this.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, position)).scrollIntoView());
  };

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
    const rawMarkdownFocusState = getRawMarkdownFocusState(this.rawMarkdownInputElement);

    this.dom.dataset.imageState = getImageStateValue(this.resolutionState);
    this.dom.classList.toggle("leafdown-image-view--selected", this.isSelected);
    this.dom.replaceChildren();
    this.rawMarkdownInputElement = null;

    if (this.isSelected) {
      this.rawMarkdownInputElement = createRawMarkdownInput(
        attrs,
        this.updateImageAttrs,
        this.rawMarkdownDraft,
        (value) => {
          this.rawMarkdownDraft = value;
        },
      );
      this.dom.append(this.rawMarkdownInputElement);
      restoreRawMarkdownFocus(this.rawMarkdownInputElement, rawMarkdownFocusState);
    } else {
      this.rawMarkdownDraft = null;
    }

    if (
      this.resolutionState.status === "resolved" &&
      this.resolutionState.resolution.kind === "renderable"
    ) {
      this.dom.append(createImageElement(attrs, this.resolutionState.resolution.assetUrl));
      return;
    }

    this.dom.append(
      createImagePlaceholder(this.resolutionState, attrs.src, () => {
        this.allowOutsideFolder = true;
        this.requestImageResolution();
      }),
    );
  }
}

const imageAttrsFromNode = (node: ProseMirrorNode): ImageMarkdownAttrs => ({
  alt: String(node.attrs.alt ?? ""),
  src: String(node.attrs.src ?? ""),
  title: String(node.attrs.title ?? ""),
});

const isSameImageResolutionInput = (
  currentInput: ImageResolutionInput,
  nextInput: ImageResolutionInput,
) =>
  isSameNullablePath(currentInput.documentPath, nextInput.documentPath) &&
  currentInput.allowOutsideFolder === nextInput.allowOutsideFolder &&
  isSameNullablePath(currentInput.folderContextPath, nextInput.folderContextPath) &&
  currentInput.target === nextInput.target;

const createImageElement = (attrs: ImageMarkdownAttrs, assetUrl: string) => {
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
  attrs: ImageMarkdownAttrs,
  updateAttrs: (attrs: Partial<ImageMarkdownAttrs>) => void,
  draft: string | null,
  updateDraft: (value: string) => void,
) => {
  const input = document.createElement("input");

  input.className = "leafdown-image-markdown-input";
  input.type = "text";
  input.setAttribute("aria-label", "Image Markdown");
  input.value = draft ?? serializeImageMarkdown(attrs);

  input.addEventListener("input", () => {
    updateDraft(input.value);

    const parsed = parseImageMarkdown(input.value);

    if (parsed) {
      updateAttrs(parsed);
    }
  });

  return input;
};

const getRawMarkdownFocusState = (input: HTMLInputElement | null): RawMarkdownFocusState | null => {
  if (!input || document.activeElement !== input) {
    return null;
  }

  return {
    selectionDirection: input.selectionDirection,
    selectionEnd: input.selectionEnd,
    selectionStart: input.selectionStart,
  };
};

const restoreRawMarkdownFocus = (
  input: HTMLInputElement,
  focusState: RawMarkdownFocusState | null,
) => {
  if (!focusState) {
    return;
  }

  input.focus();

  if (focusState.selectionStart !== null && focusState.selectionEnd !== null) {
    input.setSelectionRange(
      focusState.selectionStart,
      focusState.selectionEnd,
      focusState.selectionDirection ?? "none",
    );
  }
};

const createImagePlaceholder = (
  resolutionState: ImageResolutionState,
  target: string,
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
    button.addEventListener("click", allowOutsideFolderAccess);
    placeholder.append(button);
  }

  return placeholder;
};

const getImageStateValue = (resolutionState: ImageResolutionState) =>
  resolutionState.status === "resolved" ? resolutionState.resolution.kind : resolutionState.status;

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
      return resolutionState.resolution.message || "Image access denied.";

    case "metadataFailed":
      return resolutionState.resolution.message || "Image metadata unavailable.";

    case "renderable":
      return "";
  }
};
