import { Fragment, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { ConstructName } from "mdast-util-to-markdown";

import { isInsideTableCell, readCellCodeSpanValue } from "./codeMarkdown";
import {
  DEFINITION_NODE_NAME,
  readDefinitionAttrs,
  serializeDefinitionMarkdown,
} from "./referenceLinkMarkdown";
import { withFootnoteDefinitions } from "./sourceProjectionFootnoteReferenceSyntax";

const FOOTNOTE_DEFINITION_NODE_NAME = "footnote_definition";
const PARAGRAPH_NODE_NAME = "paragraph";
const INLINE_CODE_MARK_NAME = "inlineCode";

// A reference resolves against the whole document, while projected source is parsed on its own, so
// the definitions the document holds travel with it. Without them a reference in the source reads
// as the literal text it spells, which is what the file would mean if the definition were gone.
export const getDocumentDefinitionSources = (document: ProseMirrorNode) => {
  const definitions: string[] = [];

  document.descendants((node) => {
    if (node.type.name !== DEFINITION_NODE_NAME) {
      // A definition is a block, so inline content holds none and is not walked.
      return node.isBlock;
    }

    definitions.push(serializeDefinitionMarkdown(readDefinitionAttrs(node.attrs)));

    return false;
  });

  return definitions;
};

// The definitions are appended, so every reader that locates the projected construct by position
// still finds it first and can tell the appended blocks apart by where they start.
export const withProjectionDefinitions = (source: string, definitions: readonly string[] = []) => {
  const augmented = withFootnoteDefinitions(source);

  return definitions.length > 0 ? `${augmented}\n\n${definitions.join("\n\n")}` : augmented;
};

// Projected source is parsed as a paragraph, which reads a code span's content as it stands, while
// the cell the source is written in reads its escaped pipes back out.
const readCellCodeSpans = (paragraph: ProseMirrorNode) => {
  const nodes: ProseMirrorNode[] = [];

  paragraph.forEach((node) => {
    const isCodeSpan =
      node.isText && node.marks.some((mark) => mark.type.name === INLINE_CODE_MARK_NAME);

    nodes.push(
      isCodeSpan ? node.type.schema.text(readCellCodeSpanValue(node.text ?? ""), node.marks) : node,
    );
  });

  return paragraph.copy(Fragment.fromArray(nodes));
};

// The paragraph the projected source parsed into, once the definitions appended to resolve its
// references are set aside.
export const getAugmentedParagraph = (
  document: ProseMirrorNode,
  constructs: readonly ConstructName[] = [],
) => {
  const paragraph = document.firstChild;
  let isValid = paragraph?.type.name === PARAGRAPH_NODE_NAME;

  document.forEach((node, _offset, index) => {
    isValid &&=
      index === 0 ||
      node.type.name === FOOTNOTE_DEFINITION_NODE_NAME ||
      node.type.name === DEFINITION_NODE_NAME;
  });

  if (!isValid || !paragraph) {
    return null;
  }

  return isInsideTableCell(constructs) ? readCellCodeSpans(paragraph) : paragraph;
};
