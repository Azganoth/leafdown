import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { getDocumentLinkTarget } from "@/lib/path";

import { BlockSelection, getSelectedBlockTargets } from "../../plugins/blockSelection";
import {
  finalizeSourceProjection,
  getActiveSourceProjectionAdapterId,
  getActiveSourceProjectionRange,
} from "../../plugins/sourceProjection";
import { selectImageFilePath } from "../../services/imagePicker";
import {
  AUTHORED_URL_ATTRIBUTE_NAME,
  IMAGE_DESTINATION_MARKER_ATTRIBUTE_NAME,
} from "../../utils/characterReferenceMarkdown";
import { markdownReferenceContextCtx } from "../../utils/markdownReferences";
import { readReferenceType } from "../../utils/referenceLinkMarkdown";
import { IMAGE_ADAPTER_ID } from "../../utils/sourceProjectionImageAdapter";
import { isStandaloneImage } from "../../utils/sourceProjectionImageSyntax";

// A reference image takes its target from a definition other references may share, so it is not
// one this image can change on its own.
const isReplaceableImage = (node: ProseMirrorNode | null | undefined): node is ProseMirrorNode =>
  isStandaloneImage(node) && readReferenceType(node.attrs) === null;

const findBlockImagePosition = (selection: BlockSelection) => {
  const targets = getSelectedBlockTargets(selection);
  const [target] = targets;
  const image = target?.node.childCount === 1 ? target.node.firstChild : null;

  return targets.length === 1 && target.node.type.name === "paragraph" && isReplaceableImage(image)
    ? target.pos + 1
    : null;
};

const findSelectedImagePosition = (state: EditorState) => {
  const { selection } = state;

  if (selection instanceof BlockSelection) {
    return findBlockImagePosition(selection);
  }

  if (selection instanceof NodeSelection) {
    return isReplaceableImage(selection.node) ? selection.from : null;
  }

  const node = selection.empty ? null : state.doc.nodeAt(selection.from);

  return isReplaceableImage(node) && selection.to - selection.from === node.nodeSize
    ? selection.from
    : null;
};

const findProjectedImagePosition = (state: EditorState) => {
  if (getActiveSourceProjectionAdapterId(state) !== IMAGE_ADAPTER_ID) {
    return null;
  }

  const range = getActiveSourceProjectionRange(state);

  return range && isReplaceableImage(state.doc.nodeAt(range.to)) ? range.from : null;
};

export const canReplaceImage = (state: EditorState) =>
  findSelectedImagePosition(state) !== null || findProjectedImagePosition(state) !== null;

/**
 * Points the image at `target`, which the serializer writes in whatever form the file needs. With
 * `selectImage`, the replaced image is left selected, which is a selection no projection opens on.
 */
const setImageTarget = (
  view: EditorView,
  position: number,
  target: string,
  selectImage = false,
) => {
  const node = view.state.doc.nodeAt(position);

  if (!isReplaceableImage(node)) {
    return false;
  }

  const transaction =
    node.attrs.src === target
      ? view.state.tr
      : view.state.tr.setNodeMarkup(position, undefined, {
          ...node.attrs,
          src: target,
          [AUTHORED_URL_ATTRIBUTE_NAME]: null,
          [IMAGE_DESTINATION_MARKER_ATTRIBUTE_NAME]: "",
        });

  if (selectImage) {
    transaction.setSelection(
      TextSelection.create(transaction.doc, position, position + node.nodeSize),
    );
  }

  if (transaction.docChanged || transaction.selectionSet) {
    view.dispatch(transaction);
  }

  return true;
};

// A projected image keeps its source open until a file is chosen, so a cancelled picker leaves the
// document as it was. The picker is modal, so a document that changed meanwhile was changed by
// something else, and the image the choice was made for may no longer be there.
export const replaceImage = async (editor: Editor) => {
  const view = editor.ctx.get(editorViewCtx);
  const { documentPath } = editor.ctx.get(markdownReferenceContextCtx.key)();
  const selectedPosition = findSelectedImagePosition(view.state);
  const projectedPosition =
    selectedPosition === null ? findProjectedImagePosition(view.state) : null;
  const document = view.state.doc;

  if (selectedPosition === null && projectedPosition === null) {
    return false;
  }

  const path = await selectImageFilePath(documentPath);

  if (path === null || view.isDestroyed || view.state.doc !== document) {
    return false;
  }

  if (projectedPosition !== null) {
    finalizeSourceProjection(view);
  }

  // Once the source line is gone, the caret stands against the image, where any later transaction
  // would open the source again.
  const replaced = setImageTarget(
    view,
    selectedPosition ?? projectedPosition ?? 0,
    getDocumentLinkTarget(documentPath, path),
    projectedPosition !== null,
  );

  view.focus();

  return replaced;
};
