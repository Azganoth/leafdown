import { Fragment, Mark, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { Serializer } from "@milkdown/kit/transformer";

import { FOOTNOTE_REFERENCE_NODE_NAME } from "./sourceProjectionFootnoteReferenceSyntax";

interface LogicalLinkReplacement {
  source: string;
  token: string;
}

interface TransformLogicalLinksResult {
  content: Fragment;
  replacements: LogicalLinkReplacement[];
}

const LOGICAL_LINK_TOKEN_PREFIX = "LEAFDOWNLOGICALLINK";
const LOGICAL_LINK_TOKEN_SUFFIX = "PLACEHOLDER";
const LOGICAL_LINK_OUTER_MARK_NAMES = new Set(["emphasis", "strike_through", "strong"]);
const HARD_BREAK_NODE_NAME = "hardbreak";
const HEADING_NODE_NAME = "heading";
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
) => {
  if (!isHardBreak(content.lastChild)) {
    return serializeInlineContent(serializer, document, content);
  }

  const source = serializeInlineContent(
    serializer,
    document,
    content.append(Fragment.from(document.type.schema.text(token))),
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

const createLogicalLinkToken = (
  serializedDocument: string,
  tokenIndex: number,
  usedTokens: Set<string>,
) => {
  let index = tokenIndex;
  let token = `${LOGICAL_LINK_TOKEN_PREFIX}${index}${LOGICAL_LINK_TOKEN_SUFFIX}`;

  while (serializedDocument.includes(token) || usedTokens.has(token)) {
    index += 1;
    token = `${LOGICAL_LINK_TOKEN_PREFIX}${index}${LOGICAL_LINK_TOKEN_SUFFIX}`;
  }

  usedTokens.add(token);

  return token;
};

const createLogicalLinkReplacement = (
  serializer: Serializer,
  document: ProseMirrorNode,
  nodes: readonly ProseMirrorNode[],
  linkMark: Mark,
  serializedDocument: string,
  tokenIndex: number,
  usedTokens: Set<string>,
) => {
  const commonOuterMarks = getCommonOuterMarks(nodes, linkMark);
  const token = createLogicalLinkToken(serializedDocument, tokenIndex, usedTokens);
  const removedMarks = [linkMark, ...commonOuterMarks];
  const {
    content: labelContent,
    leading,
    trailing,
  } = splitLabelEdgeWhitespace(
    Fragment.fromArray(nodes.map((node) => node.mark(getMarksWithout(node.marks, removedMarks)))),
  );
  const labelSource = serializeLabelContent(serializer, document, labelContent, token);
  const linkedToken = document.type.schema.text(`${leading}${token}${trailing}`, [linkMark]);
  const linkSource = serializeInlineContent(
    serializer,
    document,
    Fragment.from(linkedToken),
  ).replace(token, labelSource);
  const placeholder = document.type.schema.text(token, commonOuterMarks);

  return {
    placeholder,
    replacement: { source: linkSource, token } satisfies LogicalLinkReplacement,
  };
};

const transformTextBlockContent = (
  serializer: Serializer,
  document: ProseMirrorNode,
  textBlock: ProseMirrorNode,
  serializedDocument: string,
  replacementOffset: number,
  usedTokens: Set<string>,
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

    // A heading chooses between its forms by whether its content holds a break, which a placeholder
    // standing in for the label would hide, so there a label holding a hard break is left in place.
    if (
      !isMixedLinkRun(linkNodes, linkMark) ||
      (textBlock.type.name === HEADING_NODE_NAME && linkNodes.some(isHardBreak))
    ) {
      transformedNodes.push(...linkNodes);
      index = runEnd;
      continue;
    }

    const { placeholder, replacement } = createLogicalLinkReplacement(
      serializer,
      document,
      linkNodes,
      linkMark,
      serializedDocument,
      replacementOffset + replacements.length,
      usedTokens,
    );

    transformedNodes.push(placeholder);
    replacements.push(replacement);
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
  replacementOffset = 0,
  usedTokens = new Set<string>(),
): TransformLogicalLinksResult => {
  if (node.isTextblock) {
    return transformTextBlockContent(
      serializer,
      document,
      node,
      serializedDocument,
      replacementOffset,
      usedTokens,
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
      replacementOffset + replacements.length,
      usedTokens,
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
  (serializer: Serializer): Serializer =>
  (document) => {
    const serializedDocument = serializer(document);
    const { content, replacements } = transformLogicalLinks(
      serializer,
      document,
      document,
      serializedDocument,
    );

    if (!replacements.length) {
      return serializedDocument;
    }

    const transformedDocument = document.copy(content);

    return replacements.reduce(
      (markdown, { source, token }) => markdown.replace(token, source),
      serializer(transformedDocument),
    );
  };

export const serializeLinkRunSource = (
  state: EditorState,
  serializer: Serializer,
  nodes: readonly ProseMirrorNode[],
) => {
  const paragraph = state.schema.nodes.paragraph.create(null, Fragment.fromArray([...nodes]));
  const document = state.schema.nodes.doc.create(null, paragraph);

  return createLogicalLinkMarkdownSerializer(serializer)(document).replace(/\n$/u, "");
};
