import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { NodeSchema } from "@milkdown/kit/transformer";

export const FOOTNOTE_DEFINITION_NODE_NAME = "footnote_definition";
export const FOOTNOTE_DEFINITION_LABEL_NODE_NAME = "footnote_definition_label";

// The label is the only part of the definition an author types into, so it is the node's first
// child rather than a decoration. `[^` and `]:` stay chrome: they are drawn as generated content
// around this node, which keeps them out of every position the document holds.
export const footnoteDefinitionLabelNodeSchema: NodeSchema = {
  content: "text*",
  marks: "",
  isolating: true,
  parseDOM: [{ tag: "dt" }],
  toDOM: () => ["dt", { "data-type": FOOTNOTE_DEFINITION_LABEL_NODE_NAME }, 0],
  parseMarkdown: {
    match: () => false,
    runner: () => {},
  },
  toMarkdown: {
    match: () => false,
    runner: () => {},
  },
};

export const isFootnoteDefinitionLabel = (node: ProseMirrorNode) =>
  node.type.name === FOOTNOTE_DEFINITION_LABEL_NODE_NAME;

export const getFootnoteDefinitionLabelNode = (definition: ProseMirrorNode) => {
  const first = definition.firstChild;

  return first && isFootnoteDefinitionLabel(first) ? first : null;
};

// The committed label, which every reader that resolves a reference against a definition uses. The
// label node holds the text being typed, which runs ahead of this until the edit commits.
export const getFootnoteDefinitionLabel = (definition: ProseMirrorNode) =>
  String(definition.attrs.label ?? "");

export const getFootnoteDefinitionLabelText = (definition: ProseMirrorNode) =>
  getFootnoteDefinitionLabelNode(definition)?.textContent ?? "";

// A label is what `[^` and `]:` can be written around and read back unchanged. Stating validity as
// that round trip covers an empty label, a label that is only whitespace, and one holding a
// bracket or a line ending, without a separate rule for each.
export const isWritableFootnoteDefinitionLabel = (label: string) =>
  label.length > 0 && label === label.trim() && !/[[\]\r\n]/u.test(label);

export const withFootnoteDefinitionLabelContent = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  content: `${FOOTNOTE_DEFINITION_LABEL_NODE_NAME} block+`,
  parseDOM: [
    {
      tag: `dl[data-type="${FOOTNOTE_DEFINITION_NODE_NAME}"]`,
      getAttrs: (dom) => ({ label: dom.getAttribute("data-label") ?? "" }),
    },
  ],
  toDOM: (node) => [
    "dl",
    {
      "data-type": FOOTNOTE_DEFINITION_NODE_NAME,
      "data-label": getFootnoteDefinitionLabel(node),
    },
    0,
  ],
});
