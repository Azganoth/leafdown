import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { Parser } from "@milkdown/kit/transformer";

import { getAugmentedParagraph, withProjectionDefinitions } from "./sourceProjectionDefinitions";

export const IMAGE_NODE_NAME = "image";

export const isStandaloneImage = (
  node: ProseMirrorNode | null | undefined,
): node is ProseMirrorNode => node?.type.name === IMAGE_NODE_NAME && node.marks.length === 0;

export const parseStandaloneImageSource = (
  parser: Parser,
  source: string,
  definitions: readonly string[],
): ProseMirrorNode | null => {
  let document: ProseMirrorNode;

  try {
    document = parser(withProjectionDefinitions(source, definitions));
  } catch {
    return null;
  }

  const paragraph = getAugmentedParagraph(document);
  const image = paragraph?.childCount === 1 ? paragraph.firstChild : null;

  return isStandaloneImage(image) ? image : null;
};
