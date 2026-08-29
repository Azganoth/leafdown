import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";

import { findTitleMarker } from "../utils/markdownTitle";
import {
  DEFINITION_MARKDOWN_TYPE,
  DEFINITION_NODE_NAME,
  definitionNodeSchema,
  IMAGE_REFERENCE_MARKDOWN_TYPE,
  LINK_REFERENCE_MARKDOWN_TYPE,
  normalizeReferenceLabel,
} from "../utils/referenceLinkMarkdown";

export const leafdownDefinitionSchema = $nodeSchema(
  DEFINITION_NODE_NAME,
  () => definitionNodeSchema,
);

interface ResolvedDefinition {
  title: string | null;
  url: string;
}

const readIdentifier = (node: MarkdownNode) => {
  const identifier = (node as { identifier?: unknown }).identifier;
  const label = (node as { label?: unknown }).label;

  if (typeof identifier === "string") {
    return identifier;
  }

  return typeof label === "string" ? normalizeReferenceLabel(label) : null;
};

// A definition ends at its title rather than at a `)`, so the marker is the last character of the
// slice it was built from. A definition whose title continues on the following line is one node
// covering both, and that slice still ends at the marker.
const readDefinitions = (tree: MarkdownNode, source: string) => {
  const definitions = new Map<string, ResolvedDefinition>();
  const visit = (node: MarkdownNode) => {
    if (node.type === DEFINITION_MARKDOWN_TYPE) {
      const identifier = readIdentifier(node);
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;

      if (node.title && start !== undefined && end !== undefined) {
        (node as { titleMarker?: string }).titleMarker = findTitleMarker(
          source.slice(start, end),
          "",
        );
      }

      // CommonMark resolves a label against the first definition that claims it.
      if (identifier !== null && !definitions.has(identifier)) {
        definitions.set(identifier, {
          title: typeof node.title === "string" ? node.title : null,
          url: typeof node.url === "string" ? node.url : "",
        });
      }
    }

    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  visit(tree);

  return definitions;
};

// A reference names a destination instead of holding one, so the node the editor builds from it
// carries the destination its definition gives. The reference form and the label as it was written
// stay on the node, and are what the file is written back with.
const resolveReferences = (
  node: MarkdownNode,
  definitions: ReadonlyMap<string, ResolvedDefinition>,
) => {
  if (node.type === LINK_REFERENCE_MARKDOWN_TYPE || node.type === IMAGE_REFERENCE_MARKDOWN_TYPE) {
    const identifier = readIdentifier(node);
    const definition = identifier === null ? undefined : definitions.get(identifier);

    if (definition) {
      (node as { url?: string }).url = definition.url;
      (node as { title?: string | null }).title = definition.title;
    }
  }

  for (const child of node.children ?? []) {
    resolveReferences(child, definitions);
  }
};

export const createLeafdownReferenceLinkPlugin = () =>
  $remark("leafdownReferenceLink", () => () => (tree, file) => {
    const root = tree as MarkdownNode;

    resolveReferences(root, readDefinitions(root, String(file)));
  });
