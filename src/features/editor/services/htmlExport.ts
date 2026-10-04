import {
  DOMSerializer,
  Fragment,
  type DOMOutputSpec,
  type Mark,
  type Node as ProseMirrorNode,
} from "@milkdown/kit/prose/model";
import { Transform } from "@milkdown/kit/prose/transform";

import { TaskLimiter } from "@/lib/async";
import { encodeBase64 } from "@/lib/base64";
import { t } from "@/lib/i18n";
import { getPathParts, getRelativePath, isSamePath, toSlashPath } from "@/lib/path";

import { mermaidSourceError } from "../plugins/codeBlockView";
import { isMermaidCodeBlock } from "../plugins/mermaidMode";
import { readCodeFenced } from "../utils/codeMarkdown";
import {
  FOOTNOTE_DEFINITION_NODE_NAME,
  getFootnoteDefinitionLabel,
  isFootnoteDefinitionLabel,
} from "../utils/footnoteDefinitionLabel";
import { loadLeafdownHighlighter } from "../utils/highlighting";
import { normalizeHighlightLanguage } from "../utils/highlightLanguages";
import type { ImageGrants } from "../utils/imageGrants";
import type { MarkdownReferenceContext } from "../utils/markdownReferences";
import { readMathTex, renderMathTex } from "../utils/mathRender";
import { isDisplayMathSource } from "../utils/mathSyntax";
import { parseSafeHtml, type SafeHtmlRender } from "../utils/safeHtml";
import { plainHeadingText } from "../utils/wikiHeadings";
import { parseWikiLink } from "../utils/wikiLinkMarkdown";
import { HTML_EXPORT_STYLESHEET } from "./htmlExportStyles";
import {
  isReadMarkdownImageError,
  readMarkdownImage,
  type ResolveMarkdownImageTargetResult,
} from "./markdownImageApi";
import { resolveMarkdownLinkTarget, resolveWikiLinkTarget } from "./markdownLinkApi";
import type { MermaidTheme } from "./mermaidMessages";
import { renderMermaid } from "./mermaidRenderer";

/** One captured document version and the image approvals the author gave while viewing it. */
export interface HtmlExportSnapshot {
  doc: ProseMirrorNode;
  imageGrants: ImageGrants;
}

export interface HtmlExportOptions extends MarkdownReferenceContext {
  outputPath: string;
  title: string;
}

export type HtmlExportImageOmission =
  | "missing"
  | "untitledRelative"
  | "outsideFolder"
  | "remote"
  | "unsupported"
  | "tooLarge"
  | "unreadable";

export type HtmlExportWarning =
  | { kind: "image"; target: string; reason: HtmlExportImageOmission }
  | { kind: "diagram" }
  | { kind: "mathFonts" };

export interface HtmlExportResult {
  html: string;
  warnings: HtmlExportWarning[];
}

type ImageEmbed = { kind: "embedded"; src: string } | { kind: "omitted" };

type LinkResolution =
  | { kind: "href"; href: string }
  | { kind: "heading"; heading: string }
  | { kind: "fragment"; fragment: string }
  | { kind: "unresolved" }
  | { kind: "rejected" };

interface Highlighter {
  codeToTokens: Awaited<ReturnType<typeof loadLeafdownHighlighter>>["codeToTokens"];
}

const CONTENT_SECURITY_POLICY =
  "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
const EXPORT_HIGHLIGHT_THEME = "github-light";
// Mermaid bakes its colors into the SVG, so the diagram is drawn for the export's light page.
const EXPORT_MERMAID_THEME: MermaidTheme = {
  dark: false,
  background: "#ffffff",
  block: "#ffffff",
  node: "#f6f8fa",
  border: "#d1d9e0",
  subtle: "#eff1f3",
  text: "#1f2328",
  line: "#59636e",
};
const MAX_CONCURRENT_RESOLUTIONS = 4;
const URI_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/iu;
const MAILTO_PATTERN = /^mailto:/iu;
const FOOTNOTE_HEADING_ID = "footnote-label";
const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
const TONE_BY_TOKEN: Record<string, string> = {
  TIP: "success",
  SUCCESS: "success",
  WARNING: "warning",
  QUESTION: "warning",
  EXAMPLE: "warning",
  CAUTION: "danger",
  DANGER: "danger",
  FAILURE: "danger",
  BUG: "danger",
  IMPORTANT: "important",
};
const SHIKI_FONT_STYLE = { italic: 1, bold: 2, underline: 4, strikethrough: 8 } as const;

const IMAGE_OMISSION_BY_RESOLUTION: Record<
  Exclude<ResolveMarkdownImageTargetResult["kind"], "renderable">,
  HtmlExportImageOmission
> = {
  missing: "missing",
  untitledRelative: "untitledRelative",
  outsideFolder: "outsideFolder",
  remoteBlocked: "remote",
  unsupportedFormat: "unsupported",
  unsupportedTarget: "unsupported",
  invalidPath: "missing",
  permissionDenied: "unreadable",
  metadataFailed: "unreadable",
};

const getImageMimeType = (bytes: Uint8Array) => {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";

  return "image/svg+xml";
};

const toImageDataUri = (data: ArrayBuffer) => {
  const bytes = new Uint8Array(data);

  return `data:${getImageMimeType(bytes)};base64,${encodeBase64(bytes)}`;
};

const encodeHrefPath = (path: string) =>
  encodeURI(path).replaceAll("#", "%23").replaceAll("?", "%3F");

/** How the exported page names a local file: relative to its own folder where one path reaches. */
export const getExportFileHref = (outputPath: string, targetPath: string) => {
  const relativePath = getRelativePath(getPathParts(outputPath).parent, targetPath);

  if (relativePath !== null) {
    return encodeHrefPath(relativePath);
  }

  const slashPath = toSlashPath(targetPath);

  return `file://${slashPath.startsWith("/") ? "" : "/"}${encodeHrefPath(slashPath)}`;
};

const getTargetFragment = (target: string) => {
  const index = target.indexOf("#");

  return index < 0 ? "" : target.slice(index);
};

/** GitHub's heading anchor: lowercase letters, digits, `-` and `_`, with spaces as hyphens. */
export const slugifyHeading = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replaceAll(" ", "-");

const decodeFragment = (fragment: string) => {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
};

const readListSpread = (node: ProseMirrorNode) =>
  typeof node.attrs.spread === "boolean" ? node.attrs.spread : node.attrs.spread === "true";

const isDisplayMathParagraph = (node: ProseMirrorNode) =>
  node.childCount === 1 &&
  node.firstChild?.type.name === "math_inline" &&
  isDisplayMathSource(String(node.firstChild.attrs.value));

const collectTargets = (doc: ProseMirrorNode) => {
  const images = new Set<string>();
  const links = new Set<string>();
  const wikiLinks = new Set<string>();
  const diagrams = new Set<string>();
  let hasMath = false;
  let hasHighlightedCode = false;

  doc.descendants((node) => {
    switch (node.type.name) {
      case "image":
        images.add(String(node.attrs.src ?? ""));
        break;
      case "wiki_link":
        wikiLinks.add(String(node.attrs.source ?? ""));
        break;
      case "math_inline":
        hasMath = true;
        break;
      case "code_block":
        if (isMermaidCodeBlock(node)) {
          if (!mermaidSourceError(node.textContent)) diagrams.add(node.textContent);
        } else if (readCodeFenced(node.attrs) && node.attrs.language === "math") {
          hasMath = true;
        } else if (normalizeHighlightLanguage(String(node.attrs.language ?? ""))) {
          hasHighlightedCode = true;
        }
        break;
    }

    for (const mark of node.marks) {
      if (mark.type.name === "link") {
        links.add(String(mark.attrs.href ?? ""));
      }
    }

    return true;
  });

  return { images, links, wikiLinks, diagrams, hasMath, hasHighlightedCode };
};

const NODES_OUTSIDE_THE_PAGE = new Set([
  "frontmatter",
  "definition",
  FOOTNOTE_DEFINITION_NODE_NAME,
]);

// Frontmatter and reference definitions are source the page does not show, footnote definitions
// move to the notes section, and a blank paragraph holds nothing to read. `copy` does not check
// content expressions, so a container left without its required child still serializes.
const pruneForPage = (node: ProseMirrorNode): ProseMirrorNode => {
  if (node.isTextblock || node.isLeaf) {
    return node;
  }

  const children: ProseMirrorNode[] = [];

  node.forEach((child) => {
    const isBlankParagraph = child.type.name === "paragraph" && child.childCount === 0;

    if (!NODES_OUTSIDE_THE_PAGE.has(child.type.name) && !isBlankParagraph) {
      children.push(pruneForPage(child));
    }
  });

  return node.copy(Fragment.from(children));
};

// The parser reads a character reference into its character, so the mark carries only the
// source spelling, which the page has no use for.
const stripSourceOnlyMarks = (doc: ProseMirrorNode) => {
  const markType = doc.type.schema.marks.leafdownCharacterReference;

  return markType ? new Transform(doc).removeMark(0, doc.content.size, markType).doc : doc;
};

export const renderHtmlExport = async (
  snapshot: HtmlExportSnapshot,
  options: HtmlExportOptions,
  loadKatexStylesheet: () => Promise<string | null> = async () =>
    (await import("./htmlExportKatex")).loadEmbeddedKatexStylesheet(),
): Promise<HtmlExportResult> => {
  const doc = stripSourceOnlyMarks(snapshot.doc);
  const targets = collectTargets(doc);
  const warnings: HtmlExportWarning[] = [];
  const limiter = new TaskLimiter(MAX_CONCURRENT_RESOLUTIONS);
  const context = {
    documentPath: options.documentPath,
    folderContextPath: options.folderContextPath,
  };

  const embedImage = async (target: string): Promise<ImageEmbed> => {
    const remoteImage = snapshot.imageGrants.remoteImages.get(target);
    const omit = (reason: HtmlExportImageOmission): ImageEmbed => {
      warnings.push({ kind: "image", target, reason });
      return { kind: "omitted" };
    };

    if (remoteImage) {
      return { kind: "embedded", src: toImageDataUri(remoteImage) };
    }

    try {
      const bytes = await readMarkdownImage({
        ...context,
        allowOutsideFolder: snapshot.imageGrants.outsideFolderTargets.has(target),
        target,
      });

      return { kind: "embedded", src: toImageDataUri(bytes) };
    } catch (error) {
      if (!isReadMarkdownImageError(error)) return omit("unreadable");

      switch (error.kind) {
        case "unresolved":
          return error.resolution.kind === "renderable"
            ? omit("unreadable")
            : omit(IMAGE_OMISSION_BY_RESOLUTION[error.resolution.kind]);
        case "tooLarge":
          return omit("tooLarge");
        case "unsupportedContent":
          return omit("unsupported");
        case "readFailed":
          return omit("unreadable");
      }
    }
  };

  const resolveLink = async (target: string): Promise<LinkResolution> => {
    const trimmed = target.trim();

    if (trimmed.startsWith("#")) {
      return { kind: "fragment", fragment: decodeFragment(trimmed.slice(1)) };
    }

    if (MAILTO_PATTERN.test(trimmed)) {
      return { kind: "href", href: trimmed };
    }

    if (!trimmed) {
      return { kind: "unresolved" };
    }

    try {
      const result = await resolveMarkdownLinkTarget({
        ...context,
        allowOutsideFolder: true,
        target: trimmed,
      });

      switch (result.kind) {
        case "externalWeb":
          return { kind: "href", href: result.url };
        case "localMarkdown":
        case "localFile":
          return {
            kind: "href",
            href: `${getExportFileHref(options.outputPath, result.path)}${getTargetFragment(trimmed)}`,
          };
        case "unsupportedTarget":
          return URI_SCHEME_PATTERN.test(trimmed) && !/^file:/iu.test(trimmed)
            ? { kind: "rejected" }
            : { kind: "unresolved" };
        default:
          return { kind: "unresolved" };
      }
    } catch {
      return { kind: "unresolved" };
    }
  };

  const resolveWikiLink = async (source: string): Promise<LinkResolution> => {
    const link = parseWikiLink(source);

    if (!link) {
      return { kind: "unresolved" };
    }

    if (!link.path) {
      return { kind: "heading", heading: link.heading ?? "" };
    }

    try {
      const result = await resolveWikiLinkTarget({
        ...context,
        allowOutsideFolder: true,
        target: link.path,
      });

      if (result.kind !== "localMarkdown") {
        return { kind: "unresolved" };
      }

      if (link.heading && context.documentPath && isSamePath(result.path, context.documentPath)) {
        return { kind: "heading", heading: link.heading };
      }

      return { kind: "href", href: getExportFileHref(options.outputPath, result.path) };
    } catch {
      return { kind: "unresolved" };
    }
  };

  const renderDiagram = async (source: string) => {
    try {
      const svg = await renderMermaid(source, EXPORT_MERMAID_THEME, new AbortController().signal);

      return `data:image/svg+xml;base64,${encodeBase64(new TextEncoder().encode(svg))}`;
    } catch {
      warnings.push({ kind: "diagram" });
      return null;
    }
  };

  const resolveAll = <T>(keys: Iterable<string>, resolve: (key: string) => Promise<T>) =>
    Promise.all(
      [...keys].map(async (key) => [key, await limiter.run(() => resolve(key))] as const),
    ).then((entries) => new Map(entries));

  const [images, links, wikiLinks, diagrams, highlighter, katexStylesheet] = await Promise.all([
    resolveAll(targets.images, embedImage),
    resolveAll(targets.links, resolveLink),
    resolveAll(targets.wikiLinks, resolveWikiLink),
    // Diagrams render one at a time in the shared renderer, so they queue there instead.
    Promise.all(
      [...targets.diagrams].map(async (source) => [source, await renderDiagram(source)] as const),
    ).then((entries) => new Map(entries)),
    targets.hasHighlightedCode
      ? loadLeafdownHighlighter().catch((): Highlighter | null => null)
      : Promise.resolve(null),
    targets.hasMath ? loadKatexStylesheet().catch(() => null) : Promise.resolve(null),
  ]);

  if (targets.hasMath && !katexStylesheet) {
    warnings.push({ kind: "mathFonts" });
  }

  const page = document.implementation.createHTMLDocument("");
  const writer = new HtmlExportWriter(page, doc, {
    images,
    links,
    wikiLinks,
    diagrams,
    highlighter,
  });

  writer.writeDocument(options.title, katexStylesheet);

  return { html: `<!doctype html>\n${page.documentElement.outerHTML}\n`, warnings };
};

interface HtmlExportResources {
  images: ReadonlyMap<string, ImageEmbed>;
  links: ReadonlyMap<string, LinkResolution>;
  wikiLinks: ReadonlyMap<string, LinkResolution>;
  diagrams: ReadonlyMap<string, string | null>;
  highlighter: Highlighter | null;
}

class HtmlExportWriter {
  private readonly serializer: DOMSerializer;
  private readonly headingNodes = new WeakMap<Element, ProseMirrorNode>();
  private readonly safeHtml = new Map<string, SafeHtmlRender | null>();
  private readonly footnoteDefinitions = new Map<string, ProseMirrorNode>();
  private readonly allFootnoteDefinitions: ProseMirrorNode[] = [];
  private inTableCell = false;

  constructor(
    private readonly page: Document,
    private readonly doc: ProseMirrorNode,
    private readonly resources: HtmlExportResources,
  ) {
    doc.descendants((node) => {
      if (node.type.name !== FOOTNOTE_DEFINITION_NODE_NAME) return node.isBlock;

      const label = getFootnoteDefinitionLabel(node);
      this.allFootnoteDefinitions.push(node);
      if (!this.footnoteDefinitions.has(label)) this.footnoteDefinitions.set(label, node);
      return false;
    });

    this.serializer = new DOMSerializer(this.createNodeSpecs(), this.createMarkSpecs());
  }

  writeDocument(title: string, katexStylesheet: string | null) {
    const { head, body } = this.page;
    const charset = this.element("meta", { charset: "utf-8" });
    const viewport = this.element("meta", {
      name: "viewport",
      content: "width=device-width, initial-scale=1",
    });
    const policy = this.element("meta", {
      "http-equiv": "Content-Security-Policy",
      content: CONTENT_SECURITY_POLICY,
    });
    const titleElement = this.element("title");
    const style = this.element("style");

    titleElement.textContent = title;
    style.textContent = katexStylesheet
      ? `${HTML_EXPORT_STYLESHEET}\n${katexStylesheet}`
      : HTML_EXPORT_STYLESHEET;
    head.replaceChildren(charset, viewport, policy, titleElement, style);

    const main = this.element("main");
    const article = this.element("article");

    this.serializeInto(pruneForPage(this.doc).content, article);
    main.append(article);
    body.replaceChildren(main);

    const usedIds = this.writeFootnotes(article);
    this.writeHeadingAnchors(article, usedIds);
    this.writeFragmentLinks(article);

    for (const element of body.querySelectorAll("[data-export-heading], [data-export-fragment]")) {
      element.removeAttribute("data-export-heading");
      element.removeAttribute("data-export-fragment");
    }
  }

  private element(tag: string, attributes: Record<string, string> = {}) {
    const element = this.page.createElement(tag);

    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }

    return element;
  }

  private text(value: string) {
    return this.page.createTextNode(value);
  }

  private span(value: string, className?: string) {
    const span = this.element("span", className ? { class: className } : {});
    span.textContent = value;
    return span;
  }

  private serializeInto(fragment: Fragment, target: HTMLElement) {
    this.serializer.serializeFragment(fragment, { document: this.page }, target);
  }

  private parseSafeHtml(value: string) {
    if (!this.safeHtml.has(value)) {
      this.safeHtml.set(value, parseSafeHtml(value));
    }

    return this.safeHtml.get(value) ?? null;
  }

  private createNodeSpecs(): Record<string, (node: ProseMirrorNode) => DOMOutputSpec> {
    return {
      paragraph: (node) => this.paragraph(node),
      heading: (node) => {
        const heading = this.element(`h${Math.min(Math.max(Number(node.attrs.level) || 1, 1), 6)}`);
        this.headingNodes.set(heading, node);
        return { dom: heading, contentDOM: heading };
      },
      blockquote: () => ["blockquote", 0],
      code_block: (node) => this.codeBlock(node),
      hr: () => ["hr"],
      hardbreak: () => ["br"],
      image: (node) => this.image(node),
      bullet_list: (node) => this.list("ul", node),
      ordered_list: (node) => this.list("ol", node),
      list_item: (node) => this.listItem(node),
      html: (node) => this.rawHtml(String(node.attrs.value ?? "")),
      table: (node) => this.table(node),
      table_header_row: () => ["tr", 0],
      table_row: () => ["tr", 0],
      table_header: () => ["th", 0],
      table_cell: () => ["td", 0],
      footnote_reference: (node) => this.footnoteReference(String(node.attrs.label ?? "")),
      callout: (node) => this.callout(node),
      definition_list: () => ["dl", 0],
      definition_term: () => ["dt", 0],
      definition_description: () => ["dd", 0],
      math_inline: (node) => this.math(String(node.attrs.value ?? ""), false),
      wiki_link: (node) => this.wikiLink(String(node.attrs.source ?? "")),
      // ProseMirror renders a string spec as a text node, which is how its own schema serializer
      // writes text; the published type leaves strings out.
      text: (node) => (node.text ?? "") as unknown as DOMOutputSpec,
    };
  }

  private createMarkSpecs(): Record<string, (mark: Mark) => DOMOutputSpec> {
    return {
      emphasis: () => ["em", 0],
      strong: () => ["strong", 0],
      inlineCode: () => ["code", 0],
      strike_through: () => ["del", 0],
      link: (mark) => this.link(mark),
    };
  }

  private paragraph(node: ProseMirrorNode): DOMOutputSpec {
    if (isDisplayMathParagraph(node)) {
      const block = this.element("div", { class: "math-display" });
      block.append(this.math(String(node.firstChild?.attrs.value ?? ""), true));
      return block;
    }

    let holdsBlock = false;
    node.forEach((child) => {
      if (
        child.type.name === "html" &&
        this.parseSafeHtml(String(child.attrs.value ?? ""))?.flow === "block"
      ) {
        holdsBlock = true;
      }
    });

    const paragraph = holdsBlock ? this.element("div", { class: "paragraph" }) : this.element("p");
    return { dom: paragraph, contentDOM: paragraph };
  }

  private list(tag: "ul" | "ol", node: ProseMirrorNode): DOMOutputSpec {
    const list = this.element(tag);
    const order = Number(node.attrs.order);
    const classes: string[] = [];

    if (tag === "ol" && Number.isInteger(order) && order !== 1) {
      list.setAttribute("start", String(order));
    }

    if (!readListSpread(node)) classes.push("tight");

    let hasTask = false;
    node.forEach((child) => {
      if (typeof child.attrs.checked === "boolean") hasTask = true;
    });
    if (hasTask) classes.push("contains-task-list");
    if (classes.length > 0) list.setAttribute("class", classes.join(" "));

    return { dom: list, contentDOM: list };
  }

  private listItem(node: ProseMirrorNode): DOMOutputSpec {
    const item = this.element("li");

    if (typeof node.attrs.checked === "boolean") {
      const checkbox = this.element("input", { type: "checkbox", disabled: "" });

      if (node.attrs.checked) checkbox.setAttribute("checked", "");
      item.setAttribute("class", "task-list-item");
      item.append(checkbox);
    }

    return { dom: item, contentDOM: item };
  }

  private codeBlock(node: ProseMirrorNode): DOMOutputSpec {
    const source = node.textContent;
    const language = String(node.attrs.language ?? "");

    if (isMermaidCodeBlock(node)) {
      const diagram = this.resources.diagrams.get(source);

      if (diagram) {
        const figure = this.element("figure");
        figure.append(this.element("img", { src: diagram, alt: t("editor.mermaid.diagramName") }));
        return figure;
      }
    } else if (readCodeFenced(node.attrs) && language === "math") {
      const rendered = renderMathTex(source, true);

      if (rendered.element) {
        const block = this.element("div", { class: "math-display" });
        block.append(this.page.importNode(rendered.element, true));
        return block;
      }
    }

    const pre = this.element("pre");
    const code = this.element("code");
    pre.append(code);
    code.append(...this.highlight(source, language));
    return pre;
  }

  private highlight(source: string, language: string): Node[] {
    const lang = normalizeHighlightLanguage(language);

    if (!lang || !this.resources.highlighter) {
      return [this.text(source)];
    }

    let lines;
    try {
      ({ tokens: lines } = this.resources.highlighter.codeToTokens(source, {
        lang,
        theme: EXPORT_HIGHLIGHT_THEME,
      }));
    } catch {
      return [this.text(source)];
    }

    const nodes: Node[] = [];

    lines.forEach((tokens, index) => {
      if (index > 0) nodes.push(this.text("\n"));

      for (const token of tokens) {
        const span = this.element("span");
        const styles: string[] = [];
        const fontStyle = token.fontStyle ?? 0;

        if (token.color) styles.push(`color:${token.color}`);
        if (fontStyle & SHIKI_FONT_STYLE.italic) styles.push("font-style:italic");
        if (fontStyle & SHIKI_FONT_STYLE.bold) styles.push("font-weight:bold");
        if (fontStyle & (SHIKI_FONT_STYLE.underline | SHIKI_FONT_STYLE.strikethrough)) {
          styles.push(
            `text-decoration:${[
              fontStyle & SHIKI_FONT_STYLE.underline ? "underline" : "",
              fontStyle & SHIKI_FONT_STYLE.strikethrough ? "line-through" : "",
            ]
              .filter(Boolean)
              .join(" ")}`,
          );
        }

        span.textContent = token.content;
        if (styles.length > 0) span.setAttribute("style", styles.join(";"));
        nodes.push(styles.length > 0 ? span : this.text(token.content));
      }
    });

    return nodes;
  }

  private image(node: ProseMirrorNode): DOMOutputSpec {
    const target = String(node.attrs.src ?? "");
    const alt = String(node.attrs.alt ?? "");
    const title = String(node.attrs.title ?? "");
    const embed = this.resources.images.get(target);

    if (embed?.kind === "embedded") {
      const image = this.element("img", { src: embed.src, alt });
      if (title) image.setAttribute("title", title);
      return image;
    }

    const placeholder = this.element("span", {
      class: "image-placeholder",
      role: "img",
      "aria-label": alt || target,
    });
    if (title) placeholder.setAttribute("title", title);
    if (alt) placeholder.append(this.text(alt));
    if (target) {
      const source = this.element("code");
      source.textContent = target;
      placeholder.append(source);
    }
    return placeholder;
  }

  private rawHtml(value: string): DOMOutputSpec {
    const rendered = this.parseSafeHtml(value);

    return rendered
      ? this.page.importNode(rendered.element, true)
      : this.span(value, "raw-html-source");
  }

  private table(node: ProseMirrorNode): DOMOutputSpec {
    const table = this.element("table");
    let body: HTMLElement | null = null;

    node.forEach((row) => {
      const header = row.type.name === "table_header_row";
      const section = header ? this.element("thead") : (body ??= this.element("tbody"));
      const tableRow = this.element("tr");

      row.forEach((cell) => {
        const cellElement = this.element(header || cell.type.name === "table_header" ? "th" : "td");
        const alignment = String(cell.attrs.alignment ?? "");

        if (["left", "center", "right"].includes(alignment)) {
          cellElement.setAttribute("style", `text-align:${alignment}`);
        }

        this.inTableCell = true;
        try {
          cell.forEach((block, _offset, index) => {
            if (index > 0) cellElement.append(this.element("br"));
            this.serializeInto(
              block.type.name === "paragraph" ? block.content : Fragment.from(block),
              cellElement,
            );
          });
        } finally {
          this.inTableCell = false;
        }

        tableRow.append(cellElement);
      });

      section.append(tableRow);
      if (section.parentNode !== table) table.append(section);
    });

    return table;
  }

  private callout(node: ProseMirrorNode): DOMOutputSpec {
    const token = String(node.attrs.token ?? "");
    const dialect = String(node.attrs.dialect ?? "");
    const marker = String(node.attrs.marker ?? "");
    const defaultTitle = token.toLowerCase().replace(/^./u, (character) => character.toUpperCase());
    const authoredTitle = node.attrs.title as string | null;
    const title = dialect === "github" ? defaultTitle : (authoredTitle ?? defaultTitle);
    const tone = TONE_BY_TOKEN[token.toUpperCase()] ?? "info";
    const collapsible =
      (dialect === "mkdocs" && marker !== "!!!") ||
      (dialect === "vitepress" && token === "details");

    if (collapsible) {
      const details = this.element("details", { class: `callout callout-${tone}` });
      const summary = this.element("summary");
      if (marker === "???+") details.setAttribute("open", "");
      summary.textContent = title || defaultTitle;
      details.append(summary);
      this.serializeInto(node.content, details);
      return details;
    }

    const aside = this.element("aside", { class: `callout callout-${tone}`, role: "note" });

    if (title) {
      const titleElement = this.element("p", { class: "callout-title" });
      titleElement.textContent = title;
      aside.append(titleElement);
    } else {
      aside.setAttribute("aria-label", defaultTitle);
    }

    this.serializeInto(node.content, aside);
    return aside;
  }

  private math(value: string, display: boolean): Element {
    const rendered = renderMathTex(readMathTex(value, this.inTableCell), display);

    return rendered.element
      ? this.page.importNode(rendered.element, true)
      : this.span(value, "math-source");
  }

  private footnoteReference(label: string): DOMOutputSpec {
    if (!this.footnoteDefinitions.has(label)) {
      return this.span(`[^${label}]`);
    }

    const sup = this.element("sup", { class: "footnote-ref" });
    const anchor = this.element("a");
    anchor.dataset.footnoteLabel = label;
    sup.append(anchor);
    return sup;
  }

  private wikiLink(source: string): DOMOutputSpec {
    const link = parseWikiLink(source);

    if (!link) {
      return this.span(source);
    }

    const anchor = this.linkElement(this.resources.wikiLinks.get(source));
    anchor.textContent = link.label;
    return anchor;
  }

  private link(mark: Mark): DOMOutputSpec {
    const href = String(mark.attrs.href ?? "");
    const resolution = this.resources.links.get(href);

    if (resolution?.kind === "rejected") {
      return ["span", 0];
    }

    const anchor = this.linkElement(resolution);
    const title = String(mark.attrs.title ?? "");
    if (title) anchor.setAttribute("title", title);
    return { dom: anchor, contentDOM: anchor };
  }

  private linkElement(resolution: LinkResolution | undefined) {
    const anchor = this.element("a");

    switch (resolution?.kind) {
      case "href":
        anchor.setAttribute("href", resolution.href);
        break;
      case "heading":
        anchor.dataset.exportHeading = resolution.heading;
        break;
      case "fragment":
        anchor.dataset.exportFragment = resolution.fragment;
        break;
    }

    return anchor;
  }

  // Notes are numbered by their first reference in reading order, including references made from
  // inside other notes, and each lists a way back to every reference that reached it.
  private writeFootnotes(article: HTMLElement) {
    const usedIds = new Set<string>();
    const numbers = new Map<string, number>();
    const referenceCounts = new Map<number, number>();
    const order: ProseMirrorNode[] = [];

    const numberReferences = (root: Element) => {
      for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[data-footnote-label]")) {
        const label = anchor.dataset.footnoteLabel ?? "";
        const definition = this.footnoteDefinitions.get(label);
        anchor.removeAttribute("data-footnote-label");

        if (!definition) continue;

        let number = numbers.get(label);
        if (number === undefined) {
          number = order.push(definition);
          numbers.set(label, number);
        }

        const count = (referenceCounts.get(number) ?? 0) + 1;
        const id = count === 1 ? `fnref-${number}` : `fnref-${number}-${count}`;
        referenceCounts.set(number, count);
        usedIds.add(id);
        anchor.id = id;
        anchor.setAttribute("href", `#fn-${number}`);
        anchor.setAttribute("role", "doc-noteref");
        anchor.setAttribute("aria-describedby", FOOTNOTE_HEADING_ID);
        anchor.textContent = String(number);
      }
    };

    numberReferences(article);

    if (this.allFootnoteDefinitions.length === 0) {
      return usedIds;
    }

    const section = this.element("section", { class: "footnotes", role: "doc-endnotes" });
    const heading = this.element("h2", { id: FOOTNOTE_HEADING_ID, class: "visually-hidden" });
    const list = this.element("ol");
    heading.textContent = t("editor.htmlExport.footnotes");
    section.append(heading, list);
    usedIds.add(FOOTNOTE_HEADING_ID);

    const writeDefinition = (definition: ProseMirrorNode, number: number) => {
      const item = this.element("li", { id: `fn-${number}` });
      usedIds.add(item.id);

      definition.forEach((child) => {
        if (!isFootnoteDefinitionLabel(child)) this.serializeInto(Fragment.from(child), item);
      });
      numberReferences(item);

      const backlinkTarget = item.lastElementChild?.tagName === "P" ? item.lastElementChild : item;
      for (let count = 1; count <= (referenceCounts.get(number) ?? 0); count += 1) {
        const backlink = this.element("a", {
          href: count === 1 ? `#fnref-${number}` : `#fnref-${number}-${count}`,
          class: "footnote-backref",
          role: "doc-backlink",
          "aria-label": t("editor.htmlExport.backToReference", { number: String(number) }),
        });
        backlink.textContent = count === 1 ? "↩" : `↩${count}`;
        backlinkTarget.append(this.text(" "), backlink);
      }

      list.append(item);
    };

    let written = 0;
    const writePending = () => {
      for (; written < order.length; written += 1) writeDefinition(order[written], written + 1);
    };

    writePending();

    // A definition nothing reaches is still authored content, so it follows the reached ones.
    for (const definition of this.allFootnoteDefinitions) {
      if (!order.includes(definition)) {
        order.push(definition);
        writePending();
      }
    }

    article.after(section);
    return usedIds;
  }

  private writeHeadingAnchors(article: HTMLElement, usedIds: Set<string>) {
    const root = article.parentElement ?? article;

    for (const heading of root.querySelectorAll(HEADING_SELECTOR)) {
      const node = this.headingNodes.get(heading);
      if (!node) continue;

      const base = slugifyHeading(plainHeadingText(node)) || "section";
      let id = base;
      for (let suffix = 1; usedIds.has(id); suffix += 1) id = `${base}-${suffix}`;
      usedIds.add(id);
      heading.id = id;
    }
  }

  private writeFragmentLinks(article: HTMLElement) {
    const root = article.parentElement ?? article;
    const headings = [...root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)].flatMap(
      (element) => {
        const node = this.headingNodes.get(element);
        return node ? [{ element, text: plainHeadingText(node) }] : [];
      },
    );

    for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[data-export-heading]")) {
      const target = headings.find(({ text }) => text === anchor.dataset.exportHeading);
      if (target) anchor.setAttribute("href", `#${target.element.id}`);
    }

    for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[data-export-fragment]")) {
      const fragment = anchor.dataset.exportFragment ?? "";
      const slug = slugifyHeading(fragment);
      const target =
        headings.find(({ element }) => element.id === fragment) ??
        headings.find(({ text }) => slugifyHeading(text) === slug && slug !== "") ??
        headings.find(({ text }) => text === fragment);

      if (target) anchor.setAttribute("href", `#${target.element.id}`);
    }
  }
}
