import type { MarkdownNode, NodeSchema } from "@milkdown/kit/transformer";

export const WIKI_LINK_NODE_NAME = "wiki_link";
export const WIKI_LINK_MARKDOWN_TYPE = "wikiLink";

export interface WikiLink {
  source: string;
  path: string;
  heading: string | null;
  alias: string | null;
  label: string;
}

const CANDIDATE = /\[\[([^\r\n]+?)\]\]/gu;

export const parseWikiLink = (source: string): WikiLink | null => {
  if (!source.startsWith("[[") || !source.endsWith("]]")) return null;
  const content = source.slice(2, -2);
  if (!content || content.includes("[") || content.includes("]") || /[\r\n]/u.test(content))
    return null;
  const separator = content.indexOf("|");
  const target = separator < 0 ? content : content.slice(0, separator);
  const alias = separator < 0 ? null : content.slice(separator + 1);
  const hash = target.indexOf("#");
  const path = hash < 0 ? target : target.slice(0, hash);
  const heading = hash < 0 ? null : target.slice(hash + 1);
  if (
    (!path && !heading) ||
    (hash >= 0 && !heading) ||
    alias === "" ||
    (content.includes("|", separator + 1) && separator >= 0)
  )
    return null;
  if (
    /^[\s/]|[\s/]$/u.test(path) ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes(":") ||
    path.startsWith("//")
  )
    return null;
  return { source, path, heading, alias, label: alias ?? (heading && !path ? heading : path) };
};

export const splitWikiLinks = (node: MarkdownNode, source: string): MarkdownNode[] | null => {
  if (node.type !== "text" || typeof node.value !== "string") return null;
  const from = node.position?.start.offset;
  const to = node.position?.end.offset;
  if (from === undefined || to === undefined || source.slice(from, to) !== node.value) return null;
  const value = node.value;
  const result: MarkdownNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(CANDIDATE)) {
    const parsed = parseWikiLink(match[0]);
    const before = match.index > 0 ? value[match.index - 1] : source[from - 1];
    const after = value[match.index + match[0].length] ?? source[to];
    if (!parsed || before === "!" || before === "[" || after === "]") continue;
    if (match.index > cursor)
      result.push({ type: "text", value: value.slice(cursor, match.index) });
    result.push({ type: WIKI_LINK_MARKDOWN_TYPE, ...parsed });
    cursor = match.index + match[0].length;
  }
  if (!result.length) return null;
  if (cursor < value.length) result.push({ type: "text", value: value.slice(cursor) });
  return result;
};

export const transformWikiLinks = (node: MarkdownNode, source: string): void => {
  if (
    !node.children ||
    node.type === "link" ||
    node.type === "linkReference" ||
    node.type === "image"
  )
    return;
  const children: MarkdownNode[] = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const child: MarkdownNode = node.children[index];
    const reference: MarkdownNode | undefined = node.children[index + 1];
    const closing: MarkdownNode | undefined = node.children[index + 2];
    if (
      child.type === "text" &&
      typeof child.value === "string" &&
      child.value.endsWith("[") &&
      reference?.type === "linkReference" &&
      reference.referenceType === "shortcut" &&
      closing?.type === "text" &&
      typeof closing.value === "string" &&
      closing.value.startsWith("]")
    ) {
      const from = reference.position?.start.offset;
      const to = reference.position?.end.offset;
      if (
        from !== undefined &&
        to !== undefined &&
        source[from - 2] !== "!" &&
        source[from - 2] !== "[" &&
        source[to + 1] !== "]"
      ) {
        const parsed = parseWikiLink(source.slice(from - 1, to + 1));
        if (parsed) {
          const prefix = child.value.slice(0, -1);
          const suffix = closing.value.slice(1);
          if (prefix) children.push({ type: "text", value: prefix });
          children.push({ type: WIKI_LINK_MARKDOWN_TYPE, ...parsed });
          if (suffix) children.push({ type: "text", value: suffix });
          index += 2;
          continue;
        }
      }
    }
    const from = child.position?.start.offset;
    const to = child.position?.end.offset;
    if (
      (child.type === "linkReference" || child.type === "link") &&
      from !== undefined &&
      to !== undefined &&
      source[from - 1] !== "!" &&
      source[from - 1] !== "[" &&
      source[to] !== "]"
    ) {
      const parsed = parseWikiLink(source.slice(from, to));
      if (parsed) {
        children.push({ type: WIKI_LINK_MARKDOWN_TYPE, ...parsed });
        continue;
      }
    }
    const split = splitWikiLinks(child, source);
    if (split) {
      children.push(...split);
      continue;
    }
    transformWikiLinks(child, source);
    children.push(child);
  }
  node.children = children;
};

export const wikiLinkNodeSchema: NodeSchema = {
  group: "inline",
  inline: true,
  atom: true,
  leafText: (node) => node.attrs.source as string,
  selectable: true,
  attrs: { source: { default: "" } },
  parseDOM: [
    {
      tag: 'span[data-type="wiki-link"]',
      getAttrs: (element) => ({ source: element.getAttribute("data-source") ?? "" }),
    },
  ],
  toDOM: (node) => {
    const parsed = parseWikiLink(node.attrs.source as string);
    return [
      "span",
      { class: "leafdown-wiki-link", "data-type": "wiki-link", "data-source": node.attrs.source },
      parsed?.label ?? (node.attrs.source as string),
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === WIKI_LINK_MARKDOWN_TYPE,
    runner: (state, node, type) => state.addNode(type, { source: node.source }),
  },
  toMarkdown: {
    match: (node) => node.type.name === WIKI_LINK_NODE_NAME,
    runner: (state, node) =>
      state.addNode(WIKI_LINK_MARKDOWN_TYPE, undefined, undefined, { source: node.attrs.source }),
  },
};

export const serializeWikiLink = (node: MarkdownNode) =>
  typeof node.source === "string" ? node.source : "";
