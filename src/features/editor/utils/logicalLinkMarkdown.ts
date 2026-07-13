import { Fragment, Mark, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { Serializer } from "@milkdown/kit/transformer";

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

const getLinkMark = (node: ProseMirrorNode) =>
  node.marks.find((mark) => mark.type.name === "link") ?? null;

const getMarksWithout = (marks: readonly Mark[], removedMarks: readonly Mark[]) =>
  marks.filter((mark) => !removedMarks.some((removedMark) => removedMark.eq(mark)));

const getInnerLinkMarks = (node: ProseMirrorNode, linkMark: Mark) =>
  getMarksWithout(node.marks, [linkMark]);

const isMixedLinkRun = (nodes: readonly ProseMirrorNode[], linkMark: Mark) => {
  if (!nodes.every((node) => node.isText)) {
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
  const labelContent = Fragment.fromArray(
    nodes.map((node) => node.mark(getMarksWithout(node.marks, removedMarks))),
  );
  const labelSource = serializeInlineContent(serializer, document, labelContent);
  const linkedToken = document.type.schema.text(token, [linkMark]);
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

    if (!isMixedLinkRun(linkNodes, linkMark)) {
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
