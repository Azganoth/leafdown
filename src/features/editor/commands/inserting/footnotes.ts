import { Fragment, type Mark, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { finalizeSourceProjection } from "../../plugins/sourceProjection";
import {
  FOOTNOTE_DEFINITION_LABEL_NODE_NAME,
  FOOTNOTE_DEFINITION_NODE_NAME,
  getFootnoteDefinitionLabel,
  getFootnoteDefinitionLabelText,
} from "../../utils/footnoteDefinitionLabel";
import {
  findFootnoteDefinitions,
  getFootnoteDefinitionBodyPosition,
} from "../../utils/footnoteDefinitions";
import { getNodeType } from "../../utils/milkdown";
import { FOOTNOTE_REFERENCE_NODE_NAME } from "../../utils/sourceProjectionFootnoteReferenceSyntax";

const GENERATED_FOOTNOTE_LABEL_PREFIX = "fn";

// A code span holds its text literally, so a reference cannot be written inside one.
const getReferenceMarks = (state: EditorState) =>
  state.selection.$to.marks().filter((mark) => !mark.type.spec.code);

const findReferenceInsertion = (state: EditorState) => {
  const { selection } = state;
  const referenceType = getNodeType(state, FOOTNOTE_REFERENCE_NODE_NAME);

  if (!(selection instanceof TextSelection) || !referenceType) {
    return null;
  }

  const { $to } = selection;
  const marks = getReferenceMarks(state);

  if (!$to.parent.canReplaceWith($to.index(), $to.index(), referenceType, marks)) {
    return null;
  }

  return { position: $to.pos, marks };
};

// GFM folds case when it matches a reference to a definition, so a label differing from another
// only by case would resolve to it once the file is read back. A reference no definition answers
// to, and a label still being typed, would each take the new definition as theirs.
const collectUsedFootnoteLabels = (doc: ProseMirrorNode) => {
  const labels = new Set<string>();

  for (const { node } of findFootnoteDefinitions(doc)) {
    labels.add(getFootnoteDefinitionLabel(node).toLowerCase());
    labels.add(getFootnoteDefinitionLabelText(node).toLowerCase());
  }

  doc.descendants((node) => {
    if (node.type.name === FOOTNOTE_REFERENCE_NODE_NAME) {
      labels.add(String(node.attrs.label ?? "").toLowerCase());
    }
  });

  return labels;
};

export const generateFootnoteLabel = (doc: ProseMirrorNode) => {
  const used = collectUsedFootnoteLabels(doc);

  for (let index = 1; ; index += 1) {
    const label = `${GENERATED_FOOTNOTE_LABEL_PREFIX}${index}`;

    if (!used.has(label)) {
      return label;
    }
  }
};

const createFootnoteDefinition = (state: EditorState, label: string) => {
  const definitionType = getNodeType(state, FOOTNOTE_DEFINITION_NODE_NAME);
  const labelType = getNodeType(state, FOOTNOTE_DEFINITION_LABEL_NODE_NAME);
  const body = getNodeType(state, "paragraph")?.createAndFill();

  if (!definitionType || !labelType || !body) {
    return null;
  }

  return definitionType.createAndFill({ label }, [
    labelType.create(null, state.schema.text(label)),
    body,
  ]);
};

const createFootnoteReference = (state: EditorState, label: string, marks: readonly Mark[]) =>
  getNodeType(state, FOOTNOTE_REFERENCE_NODE_NAME)?.create({ label }, null, marks) ?? null;

export const canInsertFootnote = (state: EditorState) => findReferenceInsertion(state) !== null;

export const insertFootnote = (view: EditorView) => {
  if (!canInsertFootnote(view.state)) {
    return false;
  }

  finalizeSourceProjection(view);

  const { state } = view;
  const insertion = findReferenceInsertion(state);

  if (!insertion) {
    return false;
  }

  const label = generateFootnoteLabel(state.doc);
  const reference = createFootnoteReference(state, label, insertion.marks);
  const definition = createFootnoteDefinition(state, label);

  if (!reference || !definition) {
    return false;
  }

  const tr = state.tr.insert(insertion.position, reference);
  const definitionPosition = tr.doc.content.size;

  if (!tr.doc.canReplace(tr.doc.childCount, tr.doc.childCount, Fragment.from(definition))) {
    return false;
  }

  tr.insert(definitionPosition, definition);
  tr.setSelection(
    TextSelection.create(
      tr.doc,
      getFootnoteDefinitionBodyPosition({ node: definition, pos: definitionPosition }) + 1,
    ),
  );

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};
