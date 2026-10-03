import { parserCtx, serializerCtx } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import type { NodeView } from "@milkdown/kit/prose/view";
import type { MarkdownNode, NodeSchema } from "@milkdown/kit/transformer";
import { $nodeSchema, $prose, $remark, $view } from "@milkdown/kit/utils";
import remarkFrontmatter from "remark-frontmatter";
import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";

export type FrontmatterFormat = "yaml" | "toml" | "json";

export const FRONTMATTER_NODE_NAME = "frontmatter";

export const leafdownDocumentSchema = $nodeSchema("doc", () => ({
  content: "block+ | frontmatter block*",
  parseMarkdown: {
    match: (node) => node.type === "root",
    runner: (state, node, type) => state.injectRoot(node, type),
  },
  toMarkdown: {
    match: (node) => node.type.name === "doc",
    runner: (state, node) => {
      state.openNode("root");
      state.next(node.content);
    },
  },
}));

const DELIMITERS: Record<FrontmatterFormat, string> = {
  yaml: "---",
  toml: "+++",
  json: ";;;",
};

interface FrontmatterMarkdownNode extends MarkdownNode {
  type: FrontmatterFormat;
  value: string;
  source?: string;
  body?: string;
}

export const validateFrontmatter = (format: FrontmatterFormat, body: string) => {
  if (!body.trim()) return { value: null, error: null };

  try {
    if (format === "yaml") {
      const parsed = parseDocument(body);
      if (parsed.errors.length) return { value: null, error: parsed.errors[0].message };
      return { value: parsed.toJS(), error: null };
    }
    return { value: format === "toml" ? parseToml(body) : JSON.parse(body), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
};

const readBody = (source: string, delimiter: string) => {
  const openingEnd = source.indexOf("\n");
  const closingStart = source.lastIndexOf("\n");
  if (openingEnd < 0 || closingStart < openingEnd) return null;
  if (
    source.slice(0, openingEnd).trimEnd() !== delimiter ||
    source.slice(closingStart + 1).trimEnd() !== delimiter
  )
    return null;
  return source.slice(openingEnd + 1, closingStart);
};

export const createLeafdownFrontmatterRemarkPlugin = () =>
  $remark(
    "leafdownFrontmatter",
    () =>
      function () {
        remarkFrontmatter.call(this, [
          { type: "yaml", marker: "-" },
          { type: "toml", marker: "+" },
          { type: "json", marker: ";" },
        ]);
        // Source-backed serialization writes the whole block; the package's stringifier extension
        // would also escape ordinary non-leading delimiter-like text.
        this.data().toMarkdownExtensions?.pop();

        return (tree, file) => {
          const root = tree as MarkdownNode;
          const first = root.children?.[0] as FrontmatterMarkdownNode | undefined;
          if (!first || !Object.hasOwn(DELIMITERS, first.type)) return;
          const from = first.position?.start.offset;
          const to = first.position?.end.offset;
          if (from !== 0 || to === undefined) return;

          const source = String(file).slice(from, to);
          const body = readBody(source, DELIMITERS[first.type]);
          if (body === null) return;
          first.source = source;
          first.body = body;
          first.value = body;
        };
      },
  );

export const leafdownFrontmatterSchema = $nodeSchema(
  FRONTMATTER_NODE_NAME,
  () =>
    ({
      group: "frontmatter",
      content: "text*",
      marks: "",
      code: true,
      defining: true,
      attrs: {
        format: { default: "yaml", validate: "string" },
        source: { default: "", validate: "string" },
        body: { default: "", validate: "string" },
      },
      parseDOM: [
        {
          tag: "section[data-leafdown-frontmatter]",
          getAttrs: (element) => ({
            format: element.getAttribute("data-format") ?? "yaml",
            source: element.getAttribute("data-source") ?? "",
            body: element.getAttribute("data-body") ?? "",
          }),
        },
      ],
      toDOM: (node) => [
        "section",
        {
          "data-leafdown-frontmatter": "",
          "data-format": node.attrs.format,
          "data-source": node.attrs.source,
          "data-body": node.attrs.body,
        },
        ["pre", ["code", 0]],
      ],
      parseMarkdown: {
        match: (node) => Object.hasOwn(DELIMITERS, node.type),
        runner: (state, node, type) => {
          const frontmatter = node as FrontmatterMarkdownNode;
          if (!frontmatter.source) return;
          state.openNode(type, {
            format: frontmatter.type,
            source: frontmatter.source,
            body: frontmatter.body,
          });
          if (frontmatter.body) state.addText(frontmatter.body);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node) => node.type.name === FRONTMATTER_NODE_NAME,
        runner: (state, node) => {
          const format = node.attrs.format as FrontmatterFormat;
          state.addNode("leafdownFrontmatter", undefined, node.textContent, {
            format,
            source: node.attrs.source,
            body: node.attrs.body,
          });
        },
      },
    }) satisfies NodeSchema,
);

export const serializeFrontmatter = (node: {
  value?: string;
  format?: FrontmatterFormat;
  source?: string;
  body?: string;
}) => {
  if (node.source && node.value === node.body) return node.source;
  if (node.source) {
    const openingEnd = node.source.indexOf("\n");
    const closingStart = node.source.lastIndexOf("\n");
    if (openingEnd >= 0 && closingStart > openingEnd) {
      return node.value
        ? `${node.source.slice(0, openingEnd + 1)}${node.value}${node.source.slice(closingStart)}`
        : `${node.source.slice(0, openingEnd + 1)}${node.source.slice(closingStart + 1)}`;
    }
  }
  const delimiter = DELIMITERS[node.format ?? "yaml"];
  return node.value ? `${delimiter}\n${node.value}\n${delimiter}` : `${delimiter}\n${delimiter}`;
};

export const createLeafdownFrontmatterViewPlugin = () =>
  $view(leafdownFrontmatterSchema.node, () => (node) => new FrontmatterNodeView(node));

export const createLeafdownFrontmatterInputPlugin = () =>
  $prose(
    (ctx) =>
      new Plugin({
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const first = state.doc.firstChild;
          if (!first || first.type.name === FRONTMATTER_NODE_NAME) return null;

          const format: FrontmatterFormat | null =
            (first.type.name === "hr" && first.attrs.marker === "---") ||
            (first.type.name === "paragraph" && first.textContent === "---")
              ? "yaml"
              : first.type.name === "paragraph" && first.textContent === "+++"
                ? "toml"
                : first.type.name === "paragraph" && first.textContent === ";;;"
                  ? "json"
                  : null;
          if (!format) return null;

          const delimiter = DELIMITERS[format];
          let closingStart = -1;
          let closingEnd = -1;
          state.doc.forEach((node, offset, index) => {
            if (
              index > 0 &&
              closingEnd < 0 &&
              ((format === "yaml" && node.type.name === "hr" && node.attrs.marker === "---") ||
                (node.type.name === "paragraph" && node.textContent === delimiter))
            ) {
              closingStart = offset;
              closingEnd = offset + node.nodeSize;
            }
          });
          if (closingEnd < 0) return null;

          const bodyContent = state.doc.content.cut(first.nodeSize, closingStart);
          const body = bodyContent.size
            ? ctx
                .get(serializerCtx)(state.schema.topNodeType.create(null, bodyContent))
                .replace(/\n$/u, "")
            : "";
          const parsed = ctx.get(parserCtx)(
            body ? `${delimiter}\n${body}\n${delimiter}` : `${delimiter}\n${delimiter}`,
          );
          if (
            !parsed ||
            typeof parsed === "string" ||
            parsed.firstChild?.type.name !== FRONTMATTER_NODE_NAME
          ) {
            return null;
          }
          return state.tr.replaceWith(0, closingEnd, parsed.firstChild);
        },
      }),
  );

class FrontmatterNodeView implements NodeView {
  readonly dom = document.createElement("section");
  readonly contentDOM = document.createElement("code");
  private readonly opening = document.createElement("div");
  private readonly closing = document.createElement("div");
  private readonly body = document.createElement("pre");
  private readonly status = document.createElement("div");

  constructor(private node: ProseMirrorNode) {
    this.dom.className = "leafdown-frontmatter";
    this.dom.dataset.leafdownFrontmatter = "";
    this.opening.className = "leafdown-frontmatter-delimiter";
    this.closing.className = "leafdown-frontmatter-delimiter";
    this.opening.contentEditable = "false";
    this.closing.contentEditable = "false";
    this.status.className = "leafdown-frontmatter-status";
    this.status.contentEditable = "false";
    this.body.append(this.contentDOM);
    this.dom.append(this.opening, this.body, this.closing, this.status);
    this.render();
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { target: Node; type: "selection" }) {
    return !this.contentDOM.contains(mutation.target);
  }

  private render() {
    const format = this.node.attrs.format as FrontmatterFormat;
    const delimiter = DELIMITERS[format];
    const { error } = validateFrontmatter(format, this.node.textContent);
    this.dom.dataset.format = format;
    this.dom.dataset.validation = error ? "invalid" : "valid";
    this.opening.textContent = delimiter;
    this.closing.textContent = delimiter;
    this.status.textContent = error ?? "";
    this.status.hidden = !error;
    if (error) this.dom.setAttribute("aria-description", error);
    else this.dom.removeAttribute("aria-description");
  }
}
