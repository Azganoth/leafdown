import {
  Fragment,
  Mark,
  type Node as ProseMirrorNode,
  type ResolvedPos,
} from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { Serializer } from "@milkdown/kit/transformer";
import type { ConstructName } from "mdast-util-to-markdown";

import { writeInsideConstructs } from "./linkLabelMarkdown";
import { readReferenceType } from "./referenceLinkMarkdown";
import { FOOTNOTE_REFERENCE_NODE_NAME } from "./sourceProjectionFootnoteReferenceSyntax";

interface LogicalLinkReplacement {
  source: string;
  token: string;
}

interface TransformLogicalLinksResult {
  content: Fragment;
  replacements: LogicalLinkReplacement[];
}

// A token is written from private-use characters, which escaping reads as it reads a letter. It opens
// with its own mark, spells its index in digits that are neither mark nor filler, and closes with at
// least one filler, so no token is the start of another.
const LOGICAL_LINK_TOKEN_START = 0xe000;
const LOGICAL_LINK_TOKEN_FILLER = 0xe001;
const LOGICAL_LINK_TOKEN_DIGIT_START = 0xe002;
const LOGICAL_LINK_TOKEN_DIGIT_COUNT = 0xf8ff - LOGICAL_LINK_TOKEN_DIGIT_START + 1;
const LOGICAL_LINK_OUTER_MARK_NAMES = new Set(["emphasis", "strike_through", "strong"]);
const HARD_BREAK_NODE_NAME = "hardbreak";
const TABLE_CELL_NODE_NAMES = new Set(["table_cell", "table_header"]);
const LINK_LABEL_CONSTRUCT = "label" satisfies ConstructName;
const TABLE_CELL_CONSTRUCT = "tableCell" satisfies ConstructName;
const LEADING_WHITESPACE_PATTERN = /^[\t ]*/u;
const TRAILING_WHITESPACE_PATTERN = /[\t ]*$/u;

const getLinkMark = (node: ProseMirrorNode) =>
  node.marks.find((mark) => mark.type.name === "link") ?? null;

const getMarksWithout = (marks: readonly Mark[], removedMarks: readonly Mark[]) =>
  marks.filter((mark) => !removedMarks.some((removedMark) => removedMark.eq(mark)));

const getInnerLinkMarks = (node: ProseMirrorNode, linkMark: Mark) =>
  getMarksWithout(node.marks, [linkMark]);

const isHardBreak = (node: ProseMirrorNode | null) =>
  node?.type.name === HARD_BREAK_NODE_NAME && node.attrs.isInline !== true;

const isSerializableLinkNode = (node: ProseMirrorNode) =>
  node.isText ||
  node.type.name === HARD_BREAK_NODE_NAME ||
  node.type.name === "html" ||
  node.type.name === "image" ||
  node.type.name === FOOTNOTE_REFERENCE_NODE_NAME;

const isMixedLinkRun = (nodes: readonly ProseMirrorNode[], linkMark: Mark) => {
  if (!nodes.every(isSerializableLinkNode)) {
    return false;
  }

  const firstMarks = getInnerLinkMarks(nodes[0], linkMark);

  return nodes.some((node) => !Mark.sameSet(firstMarks, getInnerLinkMarks(node, linkMark)));
};

const getCommonOuterMarks = (nodes: readonly ProseMirrorNode[], linkMark: Mark) => {
  const firstMarks = getInnerLinkMarks(nodes[0], linkMark);

  return firstMarks.filter(
    (mark) =>
      LOGICAL_LINK_OUTER_MARK_NAMES.has(mark.type.name) &&
      nodes.every((node) => mark.isInSet(node.marks)),
  );
};

const serializeInlineContent = (
  serializer: Serializer,
  document: ProseMirrorNode,
  content: Fragment,
) => {
  const paragraph = document.type.schema.nodes.paragraph.create(null, content);
  const temporaryDocument = document.type.create(null, paragraph);

  return serializer(temporaryDocument).replace(/\n$/u, "");
};

// A paragraph writes no hard break it ends on, while a label's is followed by the rest of the link,
// so a label ending on one is written with the token standing after it and cut back to the token.
const serializeLabelContent = (
  serializer: Serializer,
  document: ProseMirrorNode,
  content: Fragment,
  token: string,
  constructs: readonly ConstructName[],
) => {
  if (!isHardBreak(content.lastChild)) {
    return writeInsideConstructs(constructs, () =>
      serializeInlineContent(serializer, document, content),
    );
  }

  const source = writeInsideConstructs(constructs, () =>
    serializeInlineContent(
      serializer,
      document,
      content.append(Fragment.from(document.type.schema.text(token))),
    ),
  );

  return source.slice(0, source.lastIndexOf(token));
};

// Whitespace a delimiter mark holds is written outside its delimiters anyway, while a code span or a
// character reference writes whitespace as source of its own, so the edge ends at either of those.
const isPlainWhitespaceEdge = (node: ProseMirrorNode) =>
  node.isText && node.marks.every((mark) => LOGICAL_LINK_OUTER_MARK_NAMES.has(mark.type.name));

// The nodes are read from the edge inward, so each run is the whitespace that edge of the node holds.
const readEdgeWhitespaceRuns = (nodes: readonly ProseMirrorNode[], pattern: RegExp) => {
  const runs: string[] = [];

  for (const node of nodes) {
    const text = node.text ?? "";
    const run = isPlainWhitespaceEdge(node) ? (pattern.exec(text)?.[0] ?? "") : "";

    runs.push(run);

    if (!run || run.length < text.length) {
      break;
    }
  }

  return runs;
};

// A label is written as a paragraph of its own, which drops the whitespace opening and closing it,
// so that whitespace is written inside the link's brackets around the label instead.
const splitLabelEdgeWhitespace = (content: Fragment) => {
  const nodes: ProseMirrorNode[] = [];

  content.forEach((node) => nodes.push(node));

  const leading = readEdgeWhitespaceRuns(nodes, LEADING_WHITESPACE_PATTERN).join("");
  const trailing =
    leading.length === content.size
      ? ""
      : readEdgeWhitespaceRuns(nodes.toReversed(), TRAILING_WHITESPACE_PATTERN)
          .toReversed()
          .join("");

  return {
    content: content.cut(leading.length, content.size - trailing.length),
    leading,
    trailing,
  };
};

const spellTokenIndex = (index: number): string =>
  (index >= LOGICAL_LINK_TOKEN_DIGIT_COUNT
    ? spellTokenIndex(Math.floor(index / LOGICAL_LINK_TOKEN_DIGIT_COUNT))
    : "") +
  String.fromCharCode(LOGICAL_LINK_TOKEN_DIGIT_START + (index % LOGICAL_LINK_TOKEN_DIGIT_COUNT));

// A token is as wide as the source it stands for wherever it can be, because a table pads its
// columns and a setext heading sizes its underline from what they write, before the source replaces
// the token.
const createLogicalLinkToken = (
  serializedDocument: string,
  width: number,
  usedOpenings: Set<string>,
) => {
  for (let index = usedOpenings.size; ; index += 1) {
    const opening = String.fromCharCode(LOGICAL_LINK_TOKEN_START) + spellTokenIndex(index);
    const token = opening.padEnd(
      Math.max(width, opening.length + 1),
      String.fromCharCode(LOGICAL_LINK_TOKEN_FILLER),
    );

    if (!serializedDocument.includes(opening) && !usedOpenings.has(opening)) {
      usedOpenings.add(opening);

      return token;
    }
  }
};

// `mdast-util-to-markdown` writes a shortcut or collapsed reference only where the label it wrote
// spells the reference, which a token never does, so the link is written with the full reference
// and its authored form is chosen once the label's own source stands in for the token.
const writeLinkSource = (
  tokenSource: string,
  token: string,
  labelSource: string,
  linkMark: Mark,
) => {
  const source = tokenSource.replace(token, () => labelSource);
  const referenceType = readReferenceType(linkMark.attrs);

  if (referenceType !== "collapsed" && referenceType !== "shortcut") {
    return source;
  }

  // Only the whitespace at the label's edges stands beside the token, so the first `][` after it
  // closes the label.
  const labelEnd = tokenSource.indexOf("][", tokenSource.indexOf(token) + token.length);
  const label = tokenSource.slice(1, labelEnd).replace(token, () => labelSource);

  if (label !== tokenSource.slice(labelEnd + 2, -1)) {
    return source;
  }

  return referenceType === "shortcut" ? `[${label}]` : `[${label}][]`;
};

const createLogicalLinkReplacement = (
  serializer: Serializer,
  document: ProseMirrorNode,
  nodes: readonly ProseMirrorNode[],
  linkMark: Mark,
  serializedDocument: string,
  usedOpenings: Set<string>,
  constructs: readonly ConstructName[],
) => {
  const commonOuterMarks = getCommonOuterMarks(nodes, linkMark);
  const token = createLogicalLinkToken(serializedDocument, 0, usedOpenings);
  const removedMarks = [linkMark, ...commonOuterMarks];
  const {
    content: labelContent,
    leading,
    trailing,
  } = splitLabelEdgeWhitespace(
    Fragment.fromArray(nodes.map((node) => node.mark(getMarksWithout(node.marks, removedMarks)))),
  );
  const { schema } = document.type;
  const labelSource = serializeLabelContent(serializer, document, labelContent, token, [
    LINK_LABEL_CONSTRUCT,
    ...constructs,
  ]);
  const linkedToken = schema.text(`${leading}${token}${trailing}`, [linkMark]);
  const linkSource = writeLinkSource(
    writeInsideConstructs(constructs, () =>
      serializeInlineContent(serializer, document, Fragment.from(linkedToken)),
    ),
    token,
    labelSource,
    linkMark,
  ).split("\n");
  // The placeholder spans the lines the link is written across, one token to a line, so the block
  // holding it writes each line under its own prefix and chooses its form knowing the lines break.
  const tokens = linkSource.map((lineSource) =>
    createLogicalLinkToken(serializedDocument, lineSource.length, usedOpenings),
  );
  const placeholder = tokens.flatMap((lineToken, line) => [
    ...(line === 0
      ? []
      : [schema.nodes.hardbreak.create({ isInline: true }, null, commonOuterMarks)]),
    schema.text(lineToken, commonOuterMarks),
  ]);

  return {
    placeholder,
    replacements: tokens.map((lineToken, line): LogicalLinkReplacement => ({
      source: linkSource[line],
      token: lineToken,
    })),
  };
};

const transformTextBlockContent = (
  serializer: Serializer,
  document: ProseMirrorNode,
  textBlock: ProseMirrorNode,
  serializedDocument: string,
  usedOpenings: Set<string>,
  constructs: readonly ConstructName[],
): TransformLogicalLinksResult => {
  const nodes: ProseMirrorNode[] = [];
  const replacements: LogicalLinkReplacement[] = [];

  textBlock.forEach((node) => nodes.push(node));

  const transformedNodes: ProseMirrorNode[] = [];

  for (let index = 0; index < nodes.length;) {
    const node = nodes[index];
    const linkMark = getLinkMark(node);

    if (!linkMark) {
      transformedNodes.push(node);
      index += 1;
      continue;
    }

    let runEnd = index + 1;

    while (runEnd < nodes.length && getLinkMark(nodes[runEnd])?.eq(linkMark)) {
      runEnd += 1;
    }

    const linkNodes = nodes.slice(index, runEnd);

    if (!isMixedLinkRun(linkNodes, linkMark)) {
      transformedNodes.push(...linkNodes);
      index = runEnd;
      continue;
    }

    const { placeholder, replacements: linkReplacements } = createLogicalLinkReplacement(
      serializer,
      document,
      linkNodes,
      linkMark,
      serializedDocument,
      usedOpenings,
      constructs,
    );

    transformedNodes.push(...placeholder);
    replacements.push(...linkReplacements);
    index = runEnd;
  }

  return {
    content: Fragment.fromArray(transformedNodes),
    replacements,
  };
};

const transformLogicalLinks = (
  serializer: Serializer,
  document: ProseMirrorNode,
  node: ProseMirrorNode,
  serializedDocument: string,
  usedOpenings = new Set<string>(),
  constructs: readonly ConstructName[] = [],
): TransformLogicalLinksResult => {
  if (node.isTextblock) {
    return transformTextBlockContent(
      serializer,
      document,
      node,
      serializedDocument,
      usedOpenings,
      constructs,
    );
  }

  if (node.isLeaf) {
    return { content: node.content, replacements: [] };
  }

  const children: ProseMirrorNode[] = [];
  const replacements: LogicalLinkReplacement[] = [];

  node.forEach((child) => {
    const result = transformLogicalLinks(
      serializer,
      document,
      child,
      serializedDocument,
      usedOpenings,
      TABLE_CELL_NODE_NAMES.has(child.type.name)
        ? [...constructs, TABLE_CELL_CONSTRUCT]
        : constructs,
    );

    children.push(child.copy(result.content));
    replacements.push(...result.replacements);
  });

  return {
    content: Fragment.fromArray(children),
    replacements,
  };
};

export const createLogicalLinkMarkdownSerializer =
  (serializer: Serializer, constructs: readonly ConstructName[] = []): Serializer =>
  (document) => {
    const serializedDocument = serializer(document);
    const { content, replacements } = transformLogicalLinks(
      serializer,
      document,
      document,
      serializedDocument,
      new Set(),
      constructs,
    );

    if (!replacements.length) {
      return serializedDocument;
    }

    const transformedDocument = document.copy(content);

    return replacements.reduce(
      // A replacement string spells patterns such as `$&`, which a label may hold as text.
      (markdown, { source, token }) => markdown.replace(token, () => source),
      serializer(transformedDocument),
    );
  };

// The constructs a fragment at this position is written inside, beyond the block holding it.
export const readEnclosingInlineConstructs = (position: ResolvedPos): ConstructName[] => {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    if (TABLE_CELL_NODE_NAMES.has(position.node(depth).type.name)) {
      return [TABLE_CELL_CONSTRUCT];
    }
  }

  return [];
};

export const serializeLinkRunSource = (
  state: EditorState,
  serializer: Serializer,
  nodes: readonly ProseMirrorNode[],
  constructs: readonly ConstructName[] = [],
) => {
  const paragraph = state.schema.nodes.paragraph.create(null, Fragment.fromArray([...nodes]));
  const document = state.schema.nodes.doc.create(null, paragraph);

  return writeInsideConstructs(constructs, () =>
    createLogicalLinkMarkdownSerializer(serializer, constructs)(document),
  ).replace(/\n$/u, "");
};
