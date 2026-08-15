import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { Parser, Serializer } from "@milkdown/kit/transformer";

export const FOOTNOTE_REFERENCE_NODE_NAME = "footnote_reference";
export const FOOTNOTE_REFERENCE_OPENING = "[^";
export const FOOTNOTE_REFERENCE_CLOSING = "]";

const FOOTNOTE_DEFINITION_NODE_NAME = "footnote_definition";
const FOOTNOTE_REFERENCE_CANDIDATE_PATTERN = /\[\^(?:\\.|[^[\]\\\r\n])+\]/gu;
const PARAGRAPH_NODE_NAME = "paragraph";
const VALIDATION_DEFINITION_CONTENT = "Leafdown";

export interface FootnoteReferenceSourceBounds {
  labelFrom: number;
  labelTo: number;
}

export const getFootnoteReferenceSourceBounds = (
  source: string,
): FootnoteReferenceSourceBounds | null => {
  if (
    !source.startsWith(FOOTNOTE_REFERENCE_OPENING) ||
    !source.endsWith(FOOTNOTE_REFERENCE_CLOSING) ||
    /[\r\n]/u.test(source) ||
    source.length <= FOOTNOTE_REFERENCE_OPENING.length + FOOTNOTE_REFERENCE_CLOSING.length
  ) {
    return null;
  }

  return {
    labelFrom: FOOTNOTE_REFERENCE_OPENING.length,
    labelTo: source.length - FOOTNOTE_REFERENCE_CLOSING.length,
  };
};

export const hasCompleteFootnoteReferenceWrapper = (source: string) =>
  getFootnoteReferenceSourceBounds(source) !== null;

export const withFootnoteDefinitions = (source: string) => {
  const definitions = new Set(
    Array.from(
      source.matchAll(FOOTNOTE_REFERENCE_CANDIDATE_PATTERN),
      ([reference]) => `${reference}: ${VALIDATION_DEFINITION_CONTENT}`,
    ),
  );

  return definitions.size ? `${source}\n\n${[...definitions].join("\n\n")}` : source;
};

export const getFootnoteAugmentedParagraph = (document: ProseMirrorNode) => {
  const paragraph = document.firstChild;
  let isValid = paragraph?.type.name === PARAGRAPH_NODE_NAME;

  document.forEach((node, _offset, index) => {
    isValid &&= index === 0 || node.type.name === FOOTNOTE_DEFINITION_NODE_NAME;
  });

  return isValid ? paragraph : null;
};

export const serializeFootnoteReference = (
  state: EditorState,
  serializer: Serializer,
  node: ProseMirrorNode,
) => {
  const paragraph = state.schema.nodes.paragraph.create(null, node.mark([]));
  const document = state.schema.nodes.doc.create(null, paragraph);

  return serializer(document).replace(/\n$/u, "");
};

export const parseFootnoteReferenceSource = (
  parser: Parser,
  source: string,
): ProseMirrorNode | null => {
  if (!hasCompleteFootnoteReferenceWrapper(source)) {
    return null;
  }

  let document: ProseMirrorNode;

  try {
    document = parser(`${source}\n\n${source}: ${VALIDATION_DEFINITION_CONTENT}`);
  } catch {
    return null;
  }

  if (document.childCount !== 2) {
    return null;
  }

  const paragraph = document.firstChild;
  const definition = document.lastChild;
  const reference = paragraph?.childCount === 1 ? paragraph.firstChild : null;

  if (
    paragraph?.type.name !== PARAGRAPH_NODE_NAME ||
    reference?.type.name !== FOOTNOTE_REFERENCE_NODE_NAME ||
    definition?.type.name !== FOOTNOTE_DEFINITION_NODE_NAME ||
    reference.attrs.label !== definition.attrs.label
  ) {
    return null;
  }

  return reference;
};

export const mapFootnoteReferenceDocumentOffsetToSource = (
  offset: number,
  bounds: FootnoteReferenceSourceBounds,
) => (offset <= 0 ? bounds.labelFrom : bounds.labelTo);

export const mapFootnoteReferenceSourceOffsetToDocument = (
  offset: number,
  bounds: FootnoteReferenceSourceBounds,
) => {
  if (offset <= bounds.labelFrom) {
    return 0;
  }

  if (offset >= bounds.labelTo) {
    return 1;
  }

  return offset - bounds.labelFrom < bounds.labelTo - offset ? 0 : 1;
};
