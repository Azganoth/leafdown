import type { MarkdownNode, NodeSchema } from "@milkdown/kit/transformer";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import { remarkDefinitionList } from "remark-definition-list";

import {
  BLOCK_ADJACENT_ATTRIBUTE_NAME,
  DEFAULT_BLOCK_ADJACENT,
} from "../utils/blockSeparatorMarkdown";

const LIST_TYPE = "defList";
const TERM_TYPE = "defListTerm";
const DESCRIPTION_TYPE = "defListDescription";
const MARKER_PREFIX = /([:~])([\t ]+)$/u;
const TILDE_MARKER_LINE = /^([ >]*)~(?=[\t ]+\S)/gmu;

interface DefinitionNode extends MarkdownNode {
  marker?: string;
  spacing?: string;
  indent?: string;
  spread?: boolean;
  leadingBlank?: boolean;
}

const visit = (node: MarkdownNode, callback: (node: MarkdownNode) => void) => {
  callback(node);
  node.children?.forEach((child) => visit(child, callback));
};

const markerOffset = (source: string, description: MarkdownNode) => {
  const contentOffset = description.position?.start.offset;
  if (contentOffset === undefined) return null;
  const lineStart = source.lastIndexOf("\n", contentOffset - 1) + 1;
  const match = MARKER_PREFIX.exec(source.slice(lineStart, contentOffset));
  return match ? contentOffset - match[2].length - 1 : null;
};

const protectSharedDefinitions = (source: string, tree: MarkdownNode) => {
  const excluded: number[] = [];
  visit(tree, (node) => {
    if (node.type !== LIST_TYPE) return;
    let terms = 0;
    let sharedDefinitions = false;
    for (const child of node.children ?? []) {
      if (child.type === TERM_TYPE) {
        terms += 1;
        sharedDefinitions = false;
      } else if (child.type === DESCRIPTION_TYPE) {
        sharedDefinitions ||= terms > 1;
        if (sharedDefinitions) {
          const offset = markerOffset(source, child);
          if (offset !== null) excluded.push(offset);
        }
        terms = 0;
      }
    }
  });
  return excluded;
};

const chooseSentinel = (source: string, excluded = "") => {
  for (let code = 0xe000; code <= 0xf8ff; code += 1) {
    const char = String.fromCharCode(code);
    if (!source.includes(char) && char !== excluded) return char;
  }
  throw new Error("No spare definition-list sentinel is available");
};

const prepareDefinitionSource = (
  source: string,
  parse: (source: string) => MarkdownNode,
): MarkdownNode => {
  const tildeOffsets: number[] = [];
  const withColonMarkers = source.replace(
    TILDE_MARKER_LINE,
    (_matched, prefix: string, offset: number) => {
      tildeOffsets.push(offset + prefix.length);
      return `${prefix}:`;
    },
  );
  const first = parse(withColonMarkers);
  const excluded = protectSharedDefinitions(source, first);
  const recognized = new Set<number>();
  visit(first, (node) => {
    if (node.type !== DESCRIPTION_TYPE) return;
    const offset = markerOffset(source, node);
    if (offset !== null) recognized.add(offset);
  });
  const unmatchedTildes = tildeOffsets.filter((offset) => !recognized.has(offset));
  if (excluded.length === 0 && unmatchedTildes.length === 0) return first;

  const colonSentinel = chooseSentinel(source);
  const tildeSentinel = chooseSentinel(source, colonSentinel);
  const chars = withColonMarkers.split("");
  for (const offset of unmatchedTildes) chars[offset] = "~";
  for (const offset of excluded)
    chars[offset] = source[offset] === "~" ? tildeSentinel : colonSentinel;
  const tree = parse(chars.join(""));
  visit(tree, (node) => {
    const value = (node as { value?: unknown }).value;
    if (typeof value === "string") {
      (node as unknown as { value: string }).value = value
        .replaceAll(colonSentinel, ":")
        .replaceAll(tildeSentinel, "~");
    }
  });
  return tree;
};

const splitTermGroups = (node: MarkdownNode) => {
  if (!node.children) return;
  const children: MarkdownNode[] = [];
  for (const child of node.children) {
    if (child.type !== LIST_TYPE) {
      splitTermGroups(child);
      children.push(child);
      continue;
    }
    const groups: MarkdownNode[][] = [];
    for (const member of child.children ?? []) {
      if (member.type === TERM_TYPE || groups.length === 0) groups.push([]);
      groups.at(-1)?.push(member);
      splitTermGroups(member);
    }
    children.push(...groups.map((group) => ({ ...child, children: group })));
  }
  node.children = children;
};

const markForms = (node: MarkdownNode, source: string, contentColumn = 0) => {
  const term = node.type === LIST_TYPE ? node.children?.[0] : undefined;
  for (const child of node.children ?? []) {
    let childColumn =
      child.type === LIST_TYPE
        ? (child.children?.[0]?.position?.start.column ?? 1) - 1
        : contentColumn;
    if (node.type === LIST_TYPE && child.type === DESCRIPTION_TYPE) {
      const offset = markerOffset(source, child);
      if (offset !== null) {
        const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
        const prefix = source.slice(lineStart, offset);
        const spacing = MARKER_PREFIX.exec(source.slice(lineStart, child.position?.start.offset));
        if (spacing) {
          const authored = child as DefinitionNode;
          authored.indent = prefix.slice(contentColumn);
          authored.marker = spacing[1];
          authored.spacing = spacing[2];
          authored.leadingBlank =
            child === node.children?.[1] &&
            term?.position?.end.offset !== undefined &&
            source.slice(term.position.end.offset, offset).includes("\n");
          childColumn = (child.position?.start.column ?? 1) - 1;
        }
      }
    }
    markForms(child, source, childColumn);
  }
};

export const createLeafdownDefinitionListPlugin = () =>
  $remark(
    "leafdownDefinitionList",
    () =>
      function (this: ThisParameterType<typeof remarkDefinitionList>) {
        remarkDefinitionList.call(this);
        const originalParser = this.parser as ((source: string) => MarkdownNode) | undefined;
        if (!originalParser) throw new Error("The Markdown parser must be registered first");
        this.parser = (document) => prepareDefinitionSource(document, originalParser);

        return (tree, file) => {
          splitTermGroups(tree as MarkdownNode);
          markForms(tree as MarkdownNode, String(file));
        };
      },
  );

const listSchema: NodeSchema = {
  group: "block",
  content: "definition_term definition_description+",
  defining: true,
  attrs: {
    [BLOCK_ADJACENT_ATTRIBUTE_NAME]: { default: DEFAULT_BLOCK_ADJACENT, validate: "boolean" },
  },
  parseDOM: [{ tag: "dl[data-type=definition-list]" }],
  toDOM: () => ["dl", { "data-type": "definition-list" }, 0],
  parseMarkdown: {
    match: (node) => node.type === LIST_TYPE,
    runner: (state, node, type) => {
      state.openNode(type, {
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: (node as DefinitionNode).adjacent === true,
      });
      state.next(node.children ?? []);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "definition_list",
    runner: (state, node) => {
      state.openNode(LIST_TYPE, undefined, {
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: node.attrs.adjacent,
      });
      state.next(node.content);
      state.closeNode();
    },
  },
};

const termSchema: NodeSchema = {
  content: "inline*",
  defining: true,
  parseDOM: [{ tag: "dt" }],
  toDOM: () => ["dt", 0],
  parseMarkdown: {
    match: (node) => node.type === TERM_TYPE,
    runner: (state, node, type) => {
      state.openNode(type);
      state.next(node.children ?? []);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "definition_term",
    runner: (state, node) => {
      state.openNode(TERM_TYPE);
      state.next(node.content);
      state.closeNode();
    },
  },
};

const descriptionSchema: NodeSchema = {
  content: "block+",
  defining: true,
  attrs: {
    marker: { default: ":", validate: "string" },
    spacing: { default: " ", validate: "string" },
    indent: { default: "", validate: "string" },
    spread: { default: false, validate: "boolean" },
    leadingBlank: { default: false, validate: "boolean" },
  },
  parseDOM: [
    {
      tag: "dd",
      getAttrs: (element) => ({
        marker: element.getAttribute("data-marker") ?? ":",
        spacing: element.getAttribute("data-spacing") ?? " ",
        indent: element.getAttribute("data-indent") ?? "",
        spread: element.getAttribute("data-spread") === "true",
        leadingBlank: element.getAttribute("data-leading-blank") === "true",
      }),
    },
  ],
  toDOM: (node) => [
    "dd",
    {
      "data-marker": node.attrs.marker,
      "data-spacing": node.attrs.spacing,
      "data-indent": node.attrs.indent,
      "data-spread": String(node.attrs.spread),
      "data-leading-blank": String(node.attrs.leadingBlank),
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === DESCRIPTION_TYPE,
    runner: (state, node, type) => {
      const definition = node as DefinitionNode;
      state.openNode(type, {
        marker: definition.marker ?? ":",
        spacing: definition.spacing ?? " ",
        indent: definition.indent ?? "",
        spread: definition.spread === true,
        leadingBlank: definition.leadingBlank === true,
      });
      state.next(node.children ?? []);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "definition_description",
    runner: (state, node) => {
      state.openNode(DESCRIPTION_TYPE, undefined, {
        marker: node.attrs.marker,
        spacing: node.attrs.spacing,
        indent: node.attrs.indent,
        spread: node.attrs.spread,
        leadingBlank: node.attrs.leadingBlank,
      });
      state.next(node.content);
      state.closeNode();
    },
  },
};

export const leafdownDefinitionListSchema = $nodeSchema("definition_list", () => listSchema);
export const leafdownDefinitionTermSchema = $nodeSchema("definition_term", () => termSchema);
export const leafdownDefinitionDescriptionSchema = $nodeSchema(
  "definition_description",
  () => descriptionSchema,
);
