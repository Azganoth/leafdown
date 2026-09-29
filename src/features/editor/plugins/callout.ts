import type { MarkdownNode, NodeSchema } from "@milkdown/kit/transformer";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";

export const CALLOUT_NODE_NAME = "callout";
export const CALLOUT_MARKDOWN_TYPE = "leafdownCallout";

export type CalloutDialect = "github" | "mkdocs" | "docusaurus" | "vitepress";

interface CalloutForm {
  dialect: CalloutDialect;
  token: string;
  title: string | null;
  marker: string;
  gap: number;
  closingGap: number;
}

interface SourceLine {
  start: number;
  end: number;
  text: string;
}

const GITHUB_TYPES = new Set(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]);
const MKDOCS_TYPES = new Set([
  "note",
  "abstract",
  "info",
  "tip",
  "success",
  "question",
  "warning",
  "failure",
  "danger",
  "bug",
  "example",
  "quote",
]);
const DOCUSAURUS_TYPES = new Set(["note", "tip", "info", "warning", "danger"]);
const VITEPRESS_TYPES = new Set(["info", "tip", "warning", "danger", "details"]);

const sourceLines = (source: string): SourceLine[] => {
  const lines: SourceLine[] = [];
  let start = 0;

  while (start < source.length) {
    const newline = source.indexOf("\n", start);
    const end = newline < 0 ? source.length : newline;
    lines.push({ start, end, text: source.slice(start, end).replace(/\r$/u, "") });
    start = end + 1;
  }

  return lines;
};

const lineAt = (lines: readonly SourceLine[], offset: number) => {
  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (offset < lines[middle].start) high = middle - 1;
    else if (offset > lines[middle].end) low = middle + 1;
    else return middle;
  }

  return -1;
};

const sourcePositionAt = (lines: readonly SourceLine[], offset: number) => {
  const index = lineAt(lines, offset);
  return { offset, line: index + 1, column: offset - lines[index].start + 1 };
};

export const readGitHubForm = (line: string): CalloutForm | null => {
  const marker = /^ {0,3}>[ \t]?\[!([A-Z]+)\][ \t]*$/u.exec(line);
  return marker && GITHUB_TYPES.has(marker[1])
    ? { dialect: "github", token: marker[1], title: null, marker: ">", gap: 0, closingGap: 0 }
    : null;
};

const readMkDocsForm = (line: string): CalloutForm | null => {
  const marker = /^ {0,3}(!{3}|\?{3}\+?)[ \t]+([a-z]+)(?:[ \t]+"(.*)")?[ \t]*$/u.exec(line);
  return marker && MKDOCS_TYPES.has(marker[2]) && !(marker[1] !== "!!!" && marker[3] === "")
    ? {
        dialect: "mkdocs",
        token: marker[2],
        title: marker[3] ?? null,
        marker: marker[1],
        gap: 0,
        closingGap: 0,
      }
    : null;
};

const readColonForm = (line: string): CalloutForm | null => {
  const docusaurus = /^ {0,3}(:{3,})([a-z]+)(?:\[(.*)\])?[ \t]*$/u.exec(line);
  if (docusaurus && DOCUSAURUS_TYPES.has(docusaurus[2])) {
    return {
      dialect: "docusaurus",
      token: docusaurus[2],
      title: docusaurus[3] ?? null,
      marker: docusaurus[1],
      gap: 0,
      closingGap: 0,
    };
  }

  const vitepress = /^ {0,3}(:{3,})[ \t]+([a-z]+)(?:[ \t]+(.+?))?[ \t]*$/u.exec(line);
  return vitepress &&
    VITEPRESS_TYPES.has(vitepress[2]) &&
    !/(?:^|[ \t])\{(?:open|no-title|[.#][^}]*)\}$/u.test(vitepress[3] ?? "")
    ? {
        dialect: "vitepress",
        token: vitepress[2],
        title: vitepress[3] ?? null,
        marker: vitepress[1],
        gap: 0,
        closingGap: 0,
      }
    : null;
};

export const readCalloutForm = (line: string) => readMkDocsForm(line) ?? readColonForm(line);

const isBlank = (line: SourceLine) => line.text.trim() === "";

const findMkDocsEnd = (lines: readonly SourceLine[], opening: number) => {
  let lastContent = opening;
  for (let index = opening + 1; index < lines.length; index += 1) {
    if (isBlank(lines[index])) continue;
    if (!/^ {4}/u.test(lines[index].text)) break;
    lastContent = index;
  }
  return lastContent;
};

const findColonEnd = (lines: readonly SourceLine[], opening: number, marker: string) => {
  let codeFence: { character: string; length: number } | null = null;

  for (let index = opening + 1; index < lines.length; index += 1) {
    const line = lines[index].text;
    const fence = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (fence) {
      if (!codeFence) codeFence = { character: fence[0], length: fence.length };
      else if (fence[0] === codeFence.character && fence.length >= codeFence.length)
        codeFence = null;
      continue;
    }

    if (!codeFence && /^ {0,3}:{3,}[ \t]*$/u.test(line)) {
      const count = line.trim().match(/^:+/u)?.[0].length ?? 0;
      if (count >= marker.length) return index;
    }
  }

  return -1;
};

interface BodyLine {
  line: SourceLine;
  prefix: number;
}

const parseBody = (
  bodyLines: readonly BodyLine[],
  lines: readonly SourceLine[],
  parse: (value: string) => MarkdownNode,
): MarkdownNode[] => {
  const mapped: number[] = [];
  let value = "";

  for (const [index, { line, prefix }] of bodyLines.entries()) {
    if (index > 0) {
      mapped.push(bodyLines[index - 1].line.end);
      value += "\n";
    }
    const text = line.text.slice(prefix);
    for (let character = 0; character < text.length; character += 1) {
      mapped.push(line.start + prefix + character);
    }
    value += text;
  }

  if (!value.trim()) return [{ type: "paragraph", children: [] }];
  mapped.push(
    bodyLines.at(-1)!.line.start +
      bodyLines.at(-1)!.prefix +
      bodyLines.at(-1)!.line.text.slice(bodyLines.at(-1)!.prefix).length,
  );

  const mappedPositionAt = (offset: number) => {
    const originalOffset = mapped[Math.min(offset, mapped.length - 1)];
    return sourcePositionAt(lines, originalOffset);
  };

  const remap = (node: MarkdownNode) => {
    if (node.position?.start.offset !== undefined && node.position.end.offset !== undefined) {
      node.position = {
        start: mappedPositionAt(node.position.start.offset),
        end: mappedPositionAt(node.position.end.offset),
      };
    }
    for (const child of node.children ?? []) remap(child);
  };

  const parsed = parse(value);
  for (const child of parsed.children ?? []) remap(child);
  return parsed.children ?? [];
};

const calloutNode = (
  form: CalloutForm,
  children: MarkdownNode[],
  start: MarkdownNode["position"],
  end: MarkdownNode["position"],
): MarkdownNode => ({
  type: CALLOUT_MARKDOWN_TYPE,
  ...form,
  children,
  position: start && end ? { start: start.start, end: end.end } : undefined,
});

const replaceCallouts = (
  tree: MarkdownNode,
  lines: readonly SourceLine[],
  parse: (value: string) => MarkdownNode,
) => {
  const children = tree.children ?? [];

  for (let index = 0; index < children.length; index += 1) {
    const first = children[index];
    const start = first.position?.start.offset;
    if (start === undefined) continue;
    const opening = lineAt(lines, start);
    if (opening < 0) continue;

    if (first.type === "blockquote") {
      const form = readGitHubForm(lines[opening].text);
      const endOffset = first.position?.end.offset;
      if (!form || endOffset === undefined) continue;
      const closing = lineAt(lines, Math.max(start, endOffset - 1));
      const bodyLines = lines.slice(opening + 1, closing + 1).map((line) => ({
        line,
        prefix: /^ {0,3}>[ \t]?/u.exec(line.text)?.[0].length ?? 0,
      }));
      children[index] = calloutNode(
        form,
        parseBody(bodyLines, lines, parse),
        first.position,
        first.position,
      );
      continue;
    }

    if (first.type !== "paragraph") continue;
    const form = readCalloutForm(lines[opening].text);
    if (!form) continue;
    const closing =
      form.dialect === "mkdocs"
        ? findMkDocsEnd(lines, opening)
        : findColonEnd(lines, opening, form.marker);
    if (closing < 0) continue;
    const endOffset = lines[closing].end;
    let next = index;
    let overhang: MarkdownNode | null = null;
    while (
      next < children.length &&
      (children[next].position?.start.offset ?? Infinity) < endOffset
    ) {
      if ((children[next].position?.end.offset ?? Infinity) > endOffset) {
        overhang = children[next];
        next += 1;
        break;
      }
      next += 1;
    }
    if (next === index) continue;

    const rawBody = lines.slice(opening + 1, form.dialect === "mkdocs" ? closing + 1 : closing);
    let bodyStart = 0;
    while (bodyStart < rawBody.length && isBlank(rawBody[bodyStart])) bodyStart += 1;
    let bodyEnd = rawBody.length;
    while (bodyEnd > bodyStart && isBlank(rawBody[bodyEnd - 1])) bodyEnd -= 1;
    form.gap = bodyStart;
    form.closingGap = form.dialect === "mkdocs" ? 0 : rawBody.length - bodyEnd;
    const bodyLines = rawBody.slice(bodyStart, bodyEnd).map((line) => ({
      line,
      prefix: form.dialect === "mkdocs" ? 4 : 0,
    }));
    const body = parseBody(bodyLines, lines, parse);
    if (form.dialect === "docusaurus" || form.dialect === "vitepress") {
      replaceCallouts({ type: "root", children: body }, lines, parse);
    }
    const trailingEnd = overhang?.position?.end.offset;
    const trailingLine = trailingEnd === undefined ? -1 : lineAt(lines, trailingEnd - 1);
    const trailing =
      trailingLine > closing
        ? parseBody(
            lines.slice(closing + 1, trailingLine + 1).map((line) => ({ line, prefix: 0 })),
            lines,
            parse,
          )
        : [];
    children.splice(
      index,
      next - index,
      calloutNode(form, body, first.position, {
        start: first.position!.start,
        end: sourcePositionAt(lines, endOffset),
      }),
      ...trailing,
    );
  }
};

export const createLeafdownCalloutPlugin = () =>
  $remark(
    "leafdownCallout",
    () =>
      function () {
        return (tree, file) => {
          const source = String(file);
          replaceCallouts(
            tree as MarkdownNode,
            sourceLines(source),
            (body) => this.parse(body) as MarkdownNode,
          );
        };
      },
  );

export const calloutSchema = $nodeSchema(
  CALLOUT_NODE_NAME,
  () =>
    ({
      group: "block",
      content: "block+",
      defining: true,
      attrs: {
        dialect: { default: "github", validate: "string" },
        token: { default: "NOTE", validate: "string" },
        title: { default: null },
        marker: { default: ">", validate: "string" },
        gap: { default: 0, validate: "number" },
        closingGap: { default: 0, validate: "number" },
      },
      parseDOM: [
        {
          tag: "aside[data-leafdown-callout]",
          getAttrs: (element) => ({
            dialect: element.dataset.dialect,
            token: element.dataset.token,
            title: element.dataset.title ?? null,
            marker: element.dataset.marker,
            gap: Number(element.dataset.gap ?? 0),
            closingGap: Number(element.dataset.closingGap ?? 0),
          }),
        },
      ],
      toDOM: (node) => [
        "aside",
        {
          "data-leafdown-callout": "",
          "data-dialect": node.attrs.dialect,
          "data-token": node.attrs.token,
          "data-title": node.attrs.title ?? undefined,
          "data-marker": node.attrs.marker,
          "data-gap": node.attrs.gap,
          "data-closing-gap": node.attrs.closingGap,
        },
        ["div", 0],
      ],
      parseMarkdown: {
        match: (node) => node.type === CALLOUT_MARKDOWN_TYPE,
        runner: (state, node, type) => {
          state
            .openNode(type, {
              dialect: node.dialect,
              token: node.token,
              title: node.title,
              marker: node.marker,
              gap: node.gap,
              closingGap: node.closingGap,
            })
            .next(node.children)
            .closeNode();
        },
      },
      toMarkdown: {
        match: (node) => node.type.name === CALLOUT_NODE_NAME,
        runner: (state, node) => {
          state
            .openNode(CALLOUT_MARKDOWN_TYPE, undefined, {
              dialect: node.attrs.dialect,
              token: node.attrs.token,
              title: node.attrs.title,
              marker: node.attrs.marker,
              gap: node.attrs.gap,
              closingGap: node.attrs.closingGap,
            })
            .next(node.content)
            .closeNode();
        },
      },
    }) satisfies NodeSchema,
);
