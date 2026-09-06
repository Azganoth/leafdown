import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection, type EditorState } from "@milkdown/kit/prose/state";

import {
  FOOTNOTE_DEFINITION_NODE_NAME,
  getFootnoteDefinitionLabel,
  isFootnoteDefinitionLabel,
} from "./footnoteDefinitionLabel";
import { decodeSourceProjectionEscapes } from "./sourceProjectionAdapters";
import {
  FOOTNOTE_REFERENCE_NODE_NAME,
  findFootnoteReferenceSourceRunAt,
} from "./sourceProjectionFootnoteReferenceSyntax";
import { getRangeText, type TextRange } from "./textRanges";

/** How much of a definition a preview shows before it is cut short. */
export const FOOTNOTE_PREVIEW_CHARACTER_LIMIT = 280;

const FOOTNOTE_PREVIEW_ELLIPSIS = "…";
const WHITESPACE_RUN_PATTERN = /\s+/gu;

export interface FootnoteDefinitionMatch {
  node: ProseMirrorNode;
  pos: number;
}

export interface FootnoteReferenceMatch {
  label: string;
}

export const findFootnoteDefinitions = (doc: ProseMirrorNode) => {
  const definitions: FootnoteDefinitionMatch[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== FOOTNOTE_DEFINITION_NODE_NAME) {
      return node.isBlock;
    }

    definitions.push({ node, pos });

    return false;
  });

  return definitions;
};

// Resolution reads the committed label rather than the text the label node holds, so a definition
// whose rename is still in flight answers to the label its references were read with.
export const findFootnoteDefinitionByLabel = (doc: ProseMirrorNode, label: string) =>
  findFootnoteDefinitions(doc).find(({ node }) => getFootnoteDefinitionLabel(node) === label) ??
  null;

/**
 * The definition's body as one line of plain text, cut to {@link FOOTNOTE_PREVIEW_CHARACTER_LIMIT}.
 * The label is left out because the reference already names it, and the body is flattened because a
 * preview reports what the definition says rather than reproducing the blocks it says it in.
 */
export const getFootnoteDefinitionPreviewText = (definition: ProseMirrorNode) => {
  const blocks: string[] = [];

  definition.forEach((child) => {
    if (isFootnoteDefinitionLabel(child)) {
      return;
    }

    blocks.push(child.textContent);
  });

  const text = blocks.join(" ").replace(WHITESPACE_RUN_PATTERN, " ").trim();

  return text.length > FOOTNOTE_PREVIEW_CHARACTER_LIMIT
    ? `${text.slice(0, FOOTNOTE_PREVIEW_CHARACTER_LIMIT).trimEnd()}${FOOTNOTE_PREVIEW_ELLIPSIS}`
    : text;
};

export const isFootnoteDefinitionPreviewTruncated = (definition: ProseMirrorNode) =>
  getFootnoteDefinitionPreviewText(definition).endsWith(FOOTNOTE_PREVIEW_ELLIPSIS);

const getReferenceLabel = (node: ProseMirrorNode | null | undefined) =>
  node?.type.name === FOOTNOTE_REFERENCE_NODE_NAME ? String(node.attrs.label ?? "") : null;

const findReferenceNodeLabelAtSelection = (state: EditorState) => {
  const { selection } = state;

  if (selection instanceof NodeSelection) {
    return getReferenceLabel(selection.node);
  }

  const $from = selection.$from;

  // A caret standing between two references belongs to neither, so the one it reads is the one it
  // would move onto next, which is the same object entry from the left already projects.
  return getReferenceLabel($from.nodeAfter) ?? getReferenceLabel($from.nodeBefore);
};

const findProjectedReferenceLabelAtSelection = (state: EditorState, projection: TextRange) => {
  const { selection } = state;

  if (selection.from < projection.from || selection.to > projection.to) {
    return null;
  }

  const source = getRangeText(state.doc, projection);
  const run = findFootnoteReferenceSourceRunAt(source, selection.from - projection.from);

  return run === null ? null : decodeSourceProjectionEscapes(run);
};

/**
 * The label the caret reads, whether the reference is the node the document holds or the source an
 * active projection has put in its place. Reading the projected text rather than the node the
 * session opened on keeps the answer on the label the author can see, so a label being edited
 * resolves as it is typed.
 */
export const findFootnoteReferenceAtSelection = (
  state: EditorState,
  projection: TextRange | null,
): FootnoteReferenceMatch | null => {
  const label =
    (projection ? findProjectedReferenceLabelAtSelection(state, projection) : null) ??
    findReferenceNodeLabelAtSelection(state);

  return label === null ? null : { label };
};
