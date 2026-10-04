// @vitest-environment happy-dom

import { undoDepth } from "@milkdown/kit/prose/history";
import { describe, expect, it, vi } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorTextPosition, setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";
import {
  getExportFileHref,
  renderHtmlExport,
  slugifyHeading,
  type HtmlExportOptions,
} from "../services/htmlExport";
import type { ResolveMarkdownLinkTargetResult } from "../services/markdownLinkApi";
import { renderMermaid } from "../services/mermaidRenderer";
import { getMilkdownEditorHtmlExportSnapshot } from "../utils/createMilkdownEditor";
import { NO_IMAGE_GRANTS, type ImageGrants } from "../utils/imageGrants";

vi.mock("../services/mermaidRenderer", () => ({
  renderMermaid: vi.fn(() => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
}));

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const KATEX_STYLESHEET = ".katex{font-family:KaTeX_Main}";
const OUTPUT_PATH = "C:/Notes/out/readme.html";

const context = createMarkdownReferenceContext();
const mount = setupMilkdownEditorMount(context);

const exportMarkdown = async (
  markdown: string,
  {
    imageGrants = NO_IMAGE_GRANTS,
    options = {},
  }: { imageGrants?: ImageGrants; options?: Partial<HtmlExportOptions> } = {},
) => {
  const mounted = await mount(`${markdown}\n\nend`);
  setSelectionAtDocumentEnd(mounted.view);
  const snapshot = getMilkdownEditorHtmlExportSnapshot(mounted.editor);
  const result = await renderHtmlExport(
    { ...snapshot, imageGrants },
    { ...context, outputPath: OUTPUT_PATH, title: "readme", ...options },
    () => Promise.resolve(KATEX_STYLESHEET),
  );
  const page = new DOMParser().parseFromString(result.html, "text/html");

  return { ...result, page, article: page.querySelector("article")! };
};

const mockResolvers = (links: Record<string, ResolveMarkdownLinkTargetResult> = {}) =>
  mockTauriApi({
    resolveMarkdownLinkTarget: ({ target }) => links[target] ?? resolveLinkResult(target),
    resolveWikiLinkTarget: ({ target }) =>
      links[`wiki:${target}`] ?? { kind: "missing", path: target },
    readMarkdownImage: () =>
      Promise.reject({ kind: "unresolved", resolution: { kind: "missing", path: "x" } }),
  });

const resolveLinkResult = (target: string) =>
  /^https?:/u.test(target)
    ? ({ kind: "externalWeb", url: target } as const)
    : /^[a-z]+:/iu.test(target)
      ? ({ kind: "unsupportedTarget" } as const)
      : ({ kind: "missing", path: target } as const);

describe("HTML export", () => {
  it("writes a standalone page shell without editor state or metadata", async () => {
    mockResolvers();

    const { html, page, article } = await exportMarkdown(
      "---\ntitle: Secret\n---\n\n# Hello\n\nText with **strong**.",
      { options: { title: `A <b>"title"</b> & more` } },
    );

    expect(html.startsWith("<!doctype html>\n<html>")).toBe(true);
    expect(page.querySelector("meta[charset]")?.getAttribute("charset")).toBe("utf-8");
    expect(page.querySelector('meta[name="viewport"]')).not.toBeNull();
    expect(
      page.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content"),
    ).toContain("default-src 'none'");
    expect(page.title).toBe(`A <b>"title"</b> & more`);
    expect(html).toContain('<title>A &lt;b&gt;"title"&lt;/b&gt; &amp; more</title>');
    expect(page.querySelectorAll("style")).toHaveLength(1);
    expect(article.textContent).not.toContain("Secret");
    expect(html).not.toMatch(/data-|contenteditable|leafdown-|pm-slice|ProseMirror|asset:|blob:/u);
    expect(page.querySelectorAll("script, iframe, object, embed, link, base")).toHaveLength(0);
    expect(article.querySelector("h1")?.textContent).toBe("Hello");
    expect(article.querySelector("p strong")?.textContent).toBe("strong");
  });

  it("renders supported blocks semantically", async () => {
    mockResolvers();

    const { article } = await exportMarkdown(
      [
        "> quoted",
        "- a\n- b",
        "3. three\n4. four",
        "- [x] done\n- [ ] todo",
        "| L | R |\n|:-|-:|\n| 1 | 2 |",
        "Term\n: Definition",
        "> [!WARNING]\n> Careful",
        '!!! note "Custom"\n    Body',
        "??? tip\n    Hidden",
        "line one\\\nline two ~~gone~~ `code`",
        "***",
      ].join("\n\n"),
    );

    expect(article.querySelector("blockquote p")?.textContent).toBe("quoted");
    expect(article.querySelector("ul.tight > li")?.textContent).toBe("a");
    expect(article.querySelector("ol")?.getAttribute("start")).toBe("3");
    const tasks = article.querySelectorAll<HTMLInputElement>(".task-list-item > input");
    expect([...tasks].map((task) => [task.disabled, task.checked])).toEqual([
      [true, true],
      [true, false],
    ]);
    expect(article.querySelector("ul.contains-task-list")).not.toBeNull();
    expect(article.querySelector("thead th")?.getAttribute("style")).toBe("text-align:left");
    expect(article.querySelector("tbody td:last-child")?.getAttribute("style")).toBe(
      "text-align:right",
    );
    expect(article.querySelector("tbody td:last-child")?.textContent).toBe("2");
    expect(article.querySelector("dl dt")?.textContent).toBe("Term");
    expect(article.querySelector("dl dd")?.textContent).toBe("Definition");
    const callouts = article.querySelectorAll(".callout");
    expect(callouts[0].tagName).toBe("ASIDE");
    expect(callouts[0].querySelector(".callout-title")?.textContent).toBe("Warning");
    expect(callouts[0].className).toContain("callout-warning");
    expect(callouts[1].querySelector(".callout-title")?.textContent).toBe("Custom");
    expect(callouts[2].tagName).toBe("DETAILS");
    expect(callouts[2].querySelector("summary")?.textContent).toBe("Tip");
    expect(article.querySelector("br")).not.toBeNull();
    expect(article.querySelector("del")?.textContent).toBe("gone");
    expect(article.querySelector("p > code")?.textContent).toBe("code");
    expect(article.querySelector("hr")).not.toBeNull();
  });

  it("gives headings unique anchors and resolves same-document links", async () => {
    mockResolvers();

    const { article } = await exportMarkdown(
      [
        "# Title",
        "## Title",
        "## Other heading!",
        "[first](#title) [second](#title-1) [by text](<#Other heading!>) [missing](#nope)",
        "[[#Other heading!]] [[#Absent]]",
      ].join("\n\n"),
    );

    expect([...article.querySelectorAll("h1, h2")].map((heading) => heading.id)).toEqual([
      "title",
      "title-1",
      "other-heading",
    ]);
    const anchors = [...article.querySelectorAll("a")];
    expect(anchors.map((anchor) => [anchor.textContent, anchor.getAttribute("href")])).toEqual([
      ["first", "#title"],
      ["second", "#title-1"],
      ["by text", "#other-heading"],
      ["missing", null],
      ["Other heading!", "#other-heading"],
      ["Absent", null],
    ]);
  });

  it("numbers footnotes by first reference with working back links", async () => {
    mockResolvers();

    const { page, article } = await exportMarkdown(
      [
        "Second[^b] first[^a] again[^b] missing[^none].",
        "[^a]: Note A.",
        "[^b]: Note B with [^a].",
        "[^unused]: Never referenced.",
      ].join("\n\n"),
    );

    const references = [...article.querySelectorAll("sup.footnote-ref > a")];
    expect(
      references.map((anchor) => [anchor.id, anchor.getAttribute("href"), anchor.textContent]),
    ).toEqual([
      ["fnref-1", "#fn-1", "1"],
      ["fnref-2", "#fn-2", "2"],
      ["fnref-1-2", "#fn-1", "1"],
    ]);
    expect(article.textContent).toContain("missing[^none].");

    const notes = [...page.querySelectorAll("section.footnotes li")];
    expect(notes.map((note) => note.id)).toEqual(["fn-1", "fn-2", "fn-3"]);
    expect(notes[0].textContent).toContain("Note B");
    expect(
      [...notes[0].querySelectorAll("a.footnote-backref")].map((link) => link.getAttribute("href")),
    ).toEqual(["#fnref-1", "#fnref-1-2"]);
    expect(notes[0].querySelector("sup a")?.getAttribute("href")).toBe("#fn-2");
    expect(
      [...notes[1].querySelectorAll("a.footnote-backref")].map((link) => link.getAttribute("href")),
    ).toEqual(["#fnref-2", "#fnref-2-2"]);
    expect(notes[2].textContent).toContain("Never referenced.");
    expect(notes[2].querySelector("a.footnote-backref")).toBeNull();
    expect(page.querySelector("section.footnotes")?.getAttribute("role")).toBe("doc-endnotes");
  });

  it("keeps safe link targets, rebases local files, and drops executable schemes", async () => {
    mockResolvers({
      "./other.md#part": { kind: "localMarkdown", path: "C:/Notes/other.md" },
      "assets/report.pdf": { kind: "localFile", path: "C:/Notes/assets/report.pdf" },
      "D:/Elsewhere/a b.txt": { kind: "localFile", path: "D:/Elsewhere/a b.txt" },
      "wiki:Other": { kind: "localMarkdown", path: "C:/Notes/Other.md" },
      "wiki:readme": { kind: "localMarkdown", path: "C:/Notes/readme.md" },
    });

    const { article } = await exportMarkdown(
      [
        '[web](https://example.com/x?y=1 "Site") [mail](mailto:a@example.com)',
        "[js](javascript:alert(1)) [data](data:text/html,x) [local](./other.md#part)",
        "[file](assets/report.pdf) [far](<D:/Elsewhere/a b.txt>) [gone](missing.md)",
        "[[Other#Head|alias]] [[readme#Here]] [[Nowhere]]",
        "# Here",
      ].join("\n\n"),
    );

    const linkTargets = Object.fromEntries(
      [...article.querySelectorAll("a")].map((anchor) => [
        anchor.textContent,
        anchor.getAttribute("href"),
      ]),
    );
    expect(linkTargets).toEqual({
      web: "https://example.com/x?y=1",
      mail: "mailto:a@example.com",
      local: "../other.md#part",
      file: "../assets/report.pdf",
      far: "file:///D:/Elsewhere/a%20b.txt",
      gone: null,
      alias: "../Other.md",
      readme: "#here",
      Nowhere: null,
    });
    expect(article.querySelector('a[title="Site"]')).not.toBeNull();
    expect(article.textContent).toContain("js");
    expect(article.innerHTML).not.toMatch(/javascript:|data:text/u);
  });

  it("leaves relative links in an untitled document unresolved", async () => {
    mockTauriApi({
      resolveMarkdownLinkTarget: () => ({ kind: "untitledRelative" }),
      readMarkdownImage: () =>
        Promise.reject({ kind: "unresolved", resolution: { kind: "untitledRelative" } }),
    });

    const { article, warnings } = await exportMarkdown("[doc](./doc.md) ![pic](pic.png)", {
      options: { documentPath: null },
    });

    expect(article.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(article.querySelector("img")).toBeNull();
    expect(warnings).toEqual([{ kind: "image", target: "pic.png", reason: "untitledRelative" }]);
    expect(getLastTauriApiArgs("readMarkdownImage")).toMatchObject({ documentPath: null });
  });

  it("embeds readable images and describes the ones it leaves out", async () => {
    const failures: Record<string, unknown> = {
      "missing.png": { kind: "unresolved", resolution: { kind: "missing", path: "missing.png" } },
      "../outside.png": {
        kind: "unresolved",
        resolution: { kind: "outsideFolder", path: "C:/outside.png" },
      },
      "https://example.com/r.png": {
        kind: "unresolved",
        resolution: { kind: "remoteBlocked", host: "example.com" },
      },
      "big.png": { kind: "tooLarge", path: "big.png", sizeBytes: 9, maxSizeBytes: 1 },
    };
    mockTauriApi({
      readMarkdownImage: ({ target, allowOutsideFolder }) =>
        target in failures && !(target === "../approved.png" && allowOutsideFolder)
          ? Promise.reject(failures[target])
          : PNG_BYTES.slice().buffer,
    });

    const { article, warnings, html } = await exportMarkdown(
      [
        '![Local *icon*](icon.png "Icon title") ![](missing.png) ![Away](../outside.png)',
        "![Approved](../approved.png) ![Remote](https://example.com/r.png) ![Big](big.png)",
        "![Loaded](https://example.com/loaded.png)",
      ].join("\n\n"),
      {
        imageGrants: {
          outsideFolderTargets: new Set(["../approved.png"]),
          remoteImages: new Map([["https://example.com/loaded.png", PNG_BYTES.slice().buffer]]),
        },
      },
    );

    const images = [...article.querySelectorAll("img")];
    expect(images.map((image) => [image.alt, image.getAttribute("src")?.slice(0, 22)])).toEqual([
      ["Local icon", "data:image/png;base64,"],
      ["Approved", "data:image/png;base64,"],
      ["Loaded", "data:image/png;base64,"],
    ]);
    expect(images[0].title).toBe("Icon title");
    expect(warnings).toEqual([
      { kind: "image", target: "missing.png", reason: "missing" },
      { kind: "image", target: "../outside.png", reason: "outsideFolder" },
      { kind: "image", target: "https://example.com/r.png", reason: "remote" },
      { kind: "image", target: "big.png", reason: "tooLarge" },
    ]);
    const placeholders = [...article.querySelectorAll(".image-placeholder")];
    expect(placeholders.map((placeholder) => placeholder.getAttribute("aria-label"))).toEqual([
      "missing.png",
      "Away",
      "Remote",
      "Big",
    ]);
    expect(placeholders[2].querySelector("code")?.textContent).toBe("https://example.com/r.png");
    expect(html).not.toMatch(/src="https?:/u);
    expect(countTauriApiCalls("fetchRemoteImage")).toBe(0);
  });

  it("renders only allowlisted raw HTML and keeps everything else as source", async () => {
    mockResolvers();

    const { article, html } = await exportMarkdown(
      [
        'Inline <mark>split</mark> line<br>break and <img src=x onerror=alert(1)> and <b onclick="x">b</b>.',
        "<div>block</div>",
        "<script>alert(1)</script>",
        '<svg><a href="javascript:alert(1)">x</a></svg>',
      ].join("\n\n"),
    );

    expect(article.querySelector("p > br")).not.toBeNull();
    expect(article.querySelector("mark")).toBeNull();
    expect(article.querySelector("div.paragraph > div")?.textContent).toBe("block");
    const sources = [...article.querySelectorAll(".raw-html-source")].map(
      (node) => node.textContent,
    );
    expect(sources).toContain("<img src=x onerror=alert(1)>");
    expect(sources).toContain("<script>alert(1)</script>");
    expect(article.querySelector("img, script, svg, [onerror], [onclick]")).toBeNull();
    expect(article.querySelector("[href], [src]")).toBeNull();
    expect(html).not.toMatch(/<(?:script|svg|img|a)\b/u);
  });

  it("highlights supported code and keeps other code as escaped text", async () => {
    mockResolvers();

    const { article } = await exportMarkdown(
      [
        "```ts\nconst answer = 42;\n```",
        "```unknownlang\n<script>alert(1)</script>\n```",
        "    indented <b>",
      ].join("\n\n"),
    );

    const blocks = [...article.querySelectorAll("pre > code")];
    expect(blocks[0].textContent).toBe("const answer = 42;");
    expect(blocks[0].querySelector("span[style*='color:']")).not.toBeNull();
    expect(blocks[1].textContent).toBe("<script>alert(1)</script>");
    expect(blocks[1].children).toHaveLength(0);
    expect(blocks[2].textContent).toBe("indented <b>");
  });

  it("embeds diagrams as inert images and falls back to their source", async () => {
    mockResolvers();
    vi.mocked(renderMermaid)
      .mockResolvedValueOnce('<svg xmlns="http://www.w3.org/2000/svg"><text>ok</text></svg>')
      .mockRejectedValueOnce(new Error("Parse error"));

    const { article, warnings } = await exportMarkdown(
      ["```mermaid\ngraph TD; A-->B\n```", "```mermaid\nnot a diagram\n```"].join("\n\n"),
    );

    const image = article.querySelector("figure > img");
    expect(image?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/u);
    expect(image?.getAttribute("alt")).toBe("Mermaid diagram");
    expect(article.querySelector("pre > code")?.textContent).toBe("not a diagram");
    expect(warnings).toEqual([{ kind: "diagram" }]);
    expect(vi.mocked(renderMermaid).mock.calls[0][1].dark).toBe(false);
  });

  it("renders math with embedded styles and keeps rejected TeX as source", async () => {
    mockResolvers();

    const { page, article } = await exportMarkdown(
      [
        "Inline $x^2$ and $\\href{https://x}{y}$.",
        "$$\nE=mc^2\n$$",
        "```math\n\\frac{a}{b}\n```",
      ].join("\n\n"),
    );

    expect(article.querySelectorAll("p .katex").length).toBeGreaterThan(0);
    expect(article.querySelectorAll(".math-display .katex-display")).toHaveLength(2);
    expect(article.innerHTML).not.toContain('href="https://x"');
    expect(page.querySelector("style")?.textContent).toContain(KATEX_STYLESHEET);
  });

  it("omits the math stylesheet when the document has no math", async () => {
    mockResolvers();
    const loadKatex = vi.fn(() => Promise.resolve(KATEX_STYLESHEET));
    const mounted = await mount("Plain text.");

    await renderHtmlExport(
      getMilkdownEditorHtmlExportSnapshot(mounted.editor),
      { ...context, outputPath: OUTPUT_PATH, title: "t" },
      loadKatex,
    );

    expect(loadKatex).not.toHaveBeenCalled();
  });

  it("warns when math fonts cannot be embedded", async () => {
    mockResolvers();
    const mounted = await mount("$x$");

    const result = await renderHtmlExport(
      getMilkdownEditorHtmlExportSnapshot(mounted.editor),
      { ...context, outputPath: OUTPUT_PATH, title: "t" },
      () => Promise.resolve(null),
    );

    expect(result.warnings).toEqual([{ kind: "mathFonts" }]);
  });

  it("captures settled projected source without editing the document", async () => {
    mockResolvers();
    const mounted = await mount("Start [label](https://old.example) more\n\nend");

    enterProjection(mounted, "a");
    const oldPosition = getEditorTextPosition(mounted, "old");
    mounted.view.dispatch(mounted.view.state.tr.insertText("new", oldPosition, oldPosition + 3));
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

    const stateBefore = mounted.view.state;
    const historyBefore = undoDepth(stateBefore);
    const snapshot = getMilkdownEditorHtmlExportSnapshot(mounted.editor);

    expect(mounted.view.state).toBe(stateBefore);
    expect(undoDepth(mounted.view.state)).toBe(historyBefore);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(snapshot.doc.firstChild?.textContent).toBe("Start label more");

    const exporting = renderHtmlExport(
      snapshot,
      { ...context, outputPath: OUTPUT_PATH, title: "t" },
      () => Promise.resolve(null),
    );
    setSelectionAtDocumentEnd(mounted.view);
    mounted.view.dispatch(mounted.view.state.tr.insertText(" later"));
    const result = await exporting;

    expect(result.html).toContain('href="https://new.example"');
    expect(result.html).not.toContain("later");
    expect(mounted.getMarkdown()).toBe("Start [label](https://new.example) more\n\nend later\n");
  });
});

describe("export link helpers", () => {
  it("names local files relative to the output folder", () => {
    expect(getExportFileHref("C:/Notes/out/page.html", "C:\\Notes\\a #1.md")).toBe(
      "../a%20%231.md",
    );
    expect(getExportFileHref("C:/Notes/page.html", "c:/notes/sub/b.png")).toBe("sub/b.png");
    expect(getExportFileHref("C:/Notes/page.html", "D:/x/y?.md")).toBe("file:///D:/x/y%3F.md");
    expect(getExportFileHref("/home/a/page.html", "/srv/b.md")).toBe("../../srv/b.md");
  });

  it("slugifies headings the way GitHub anchors them", () => {
    expect(slugifyHeading(" Hello, World! ")).toBe("hello-world");
    expect(slugifyHeading("Ünïcode_and-dash")).toBe("ünïcode_and-dash");
    expect(slugifyHeading("a  b")).toBe("a--b");
  });
});
