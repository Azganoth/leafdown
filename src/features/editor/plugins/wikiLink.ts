import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";

import {
  WIKI_LINK_NODE_NAME,
  transformWikiLinks,
  wikiLinkNodeSchema,
} from "../utils/wikiLinkMarkdown";

export const leafdownWikiLinkSchema = $nodeSchema(WIKI_LINK_NODE_NAME, () => wikiLinkNodeSchema);

export const createLeafdownWikiLinkPlugin = () =>
  $remark("leafdownWikiLink", () => () => (tree, file) => {
    transformWikiLinks(tree as MarkdownNode, String(file));
  });
