import { describe, expect, it, vi } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { BASIC_TABLE_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { setSelectionAtDocumentEnd, typeText } from "@/test/utils/prosemirror";
import { waitFor } from "@/test/utils/react";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

const mountEditor = setupMilkdownEditorMount();

const supportedMarkdown = `# Heading

Paragraph with *emphasis*, **strong**, \`code\`, ~~strike~~, https://example.com, and [link](docs/readme.md).

> Quote

1. One
2. Two

- A
- B

\`\`\`ts
const value = 1;
\`\`\`

---

![Alt](image.png)

${BASIC_TABLE_MARKDOWN}

- [ ] todo
- [x] done

Footnote[^1]

[^1]: Footnote text`;

// Milkdown serializer defaults normalize several source markers:
// unordered/task markers become `*`, thematic breaks become `***`, bare URLs
// become autolink syntax, and serialized output includes a final newline.
const supportedMarkdownExpected = `# Heading

Paragraph with *emphasis*, **strong**, \`code\`, ~~strike~~, <https://example.com>, and [link](docs/readme.md).

> Quote

1. One
2. Two

* A

* B

\`\`\`ts
const value = 1;
\`\`\`

***

![Alt](image.png)

${BASIC_TABLE_MARKDOWN}

* [ ] todo

* [x] done

Footnote[^1]

[^1]: Footnote text
`;

const unusualMarkdownFixtures = [
  {
    name: "wiki-link-like text",
    source: "Keep [[Wiki Link]] as ordinary text.",
    expected: "Keep \\[\\[Wiki Link]] as ordinary text.\n",
  },
  {
    name: "directive-like text",
    source: '::note{title="Unsupported"}',
    expected: '::note{title="Unsupported"}\n',
  },
  {
    name: "malformed HTML-like text",
    source: "<custom broken",
    expected: "\\<custom broken\n",
  },
];

describe("Markdown compatibility", () => {
  it("parses and serializes the documented CommonMark and GFM fixture", async () => {
    mockTauriApiCommand("resolveMarkdownImageTarget", () => ({
      kind: "renderable",
      path: "C:/Notes/image.png",
    }));

    const mounted = await mountEditor(supportedMarkdown, createMarkdownReferenceContext());

    expect(mounted.getMarkdown()).toBe(supportedMarkdownExpected);

    const { dom } = mounted.view;

    expect(dom.querySelector("h1")).toHaveTextContent("Heading");
    expect(dom.querySelector("p")).toHaveTextContent("Paragraph");
    expect(dom.querySelector("em")).toHaveTextContent("emphasis");
    expect(dom.querySelector("strong")).toHaveTextContent("strong");
    expect(dom.querySelector("code")).toHaveTextContent("code");
    expect(dom.querySelector("pre code")).toHaveTextContent("const value = 1;");
    expect(dom.querySelector("blockquote")).toHaveTextContent("Quote");
    expect(dom.querySelector("ol")).toHaveTextContent("One");
    expect(dom.querySelector("ul")).toHaveTextContent("A");
    expect(dom.querySelector("a[href='docs/readme.md']")).toHaveTextContent("link");
    expect(dom.querySelector("a[href='https://example.com']")).toHaveTextContent(
      "https://example.com",
    );
    expect(dom.querySelector("hr")).toBeInTheDocument();
    await waitFor(() => {
      expect(dom.querySelector("img[alt='Alt']")).toBeInTheDocument();
    });
    expect(dom.querySelector("table")).toHaveTextContent("C");
    expect(dom.querySelector("li[data-checked='false']")).toHaveTextContent("todo");
    expect(dom.querySelector("li[data-checked='true']")).toHaveTextContent("done");
    expect(dom.querySelector("del")).toHaveTextContent("strike");
    expect(dom).toHaveTextContent("Footnote");
  });

  it.each(unusualMarkdownFixtures)(
    "preserves unsupported or unusual Markdown as text: $name",
    async ({ source, expected }) => {
      const mounted = await mountEditor(source);

      expect(mounted.getMarkdown()).toBe(expected);
      expect(mounted.view.dom).toHaveTextContent(source.replace("\\", ""));
    },
  );

  it("mounts invalid or unusual Markdown input without crashing", async () => {
    const mounted = await mountEditor(`# Edge Input

[unterminated link](

![unterminated image](

| A | B
| --- |
| one

<custom broken

::note{title="Unsupported"}

[^missing`);

    expect(mounted.view.dom).toHaveClass("ProseMirror");
    expect(mounted.view.dom).toHaveTextContent("Edge Input");
    expect(() => mounted.getMarkdown()).not.toThrow();
  });

  it.each([
    "[plain **bold**](https://example.com)",
    "[**bold** plain](https://example.com)",
    "[plain *soft* and ~~strike~~](https://example.com)",
    "[plain `code` and **bold**](https://example.com)",
    "[plain \\* literal and **bold**](https://example.com)",
    '**[plain *soft*](https://example.com "Title")**',
    "[plain **bold**]()",
    "[a](https://example.com) [b](https://example.com)",
    "[one **bold**](first) and [two *soft*](second)",
    "<https://example.com>",
  ])("preserves logical link wrappers in %s", async (source) => {
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it.each([
    "[plain\nlabel](docs/readme.md)",
    '[**bold** and\n*soft*](docs/readme.md "Title")',
    "**[plain *soft*\nlabel](docs/readme.md)**",
  ])("preserves multiline logical link wrappers in %s", async (source) => {
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it.each([
    { expected: "**[a b](./doc.md)**", source: "**[**a** b](./doc.md)**" },
    { expected: "**[a b c](./doc.md)**", source: "**[a **b** c](./doc.md)**" },
    { expected: "**bold [a b](./doc.md) tail**", source: "**bold [**a** b](./doc.md) tail**" },
    { expected: "*[a b](./doc.md)*", source: "*[*a* b](./doc.md)*" },
    { expected: "[~~a b~~](./doc.md)", source: "~~[~~a~~ b](./doc.md)~~" },
    { expected: "**[a b](./doc.md)**", source: "**[a **b**](./doc.md)**" },
    { expected: "**[*a* b](./doc.md)**", source: "**[*a* b](./doc.md)**" },
  ])("keeps the wrapping mark of $source", async ({ expected, source }) => {
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${expected}\n`);
  });

  it.each([
    "[**bold** ![alt](./pic.png)](./doc.md)",
    "[![alt](./pic.png) **bold**](./doc.md)",
    "[*soft* ![a](./a.png) `code`](./doc.md)",
    "[**bold**\n![alt](./pic.png)](./doc.md)",
  ])("preserves logical link wrappers around images in %s", async (source) => {
    mockTauriApiCommand("resolveMarkdownImageTarget", () => ({
      kind: "renderable",
      path: "C:/Notes/pic.png",
    }));

    const mounted = await mountEditor(source, createMarkdownReferenceContext());

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it("uses logical link serialization for Markdown update listeners", async () => {
    const onMarkdownUpdated = vi.fn();
    const mounted = await mountEditor("[plain **bold**](first)\n\nTail", { onMarkdownUpdated });

    vi.useFakeTimers();

    try {
      setSelectionAtDocumentEnd(mounted.view);
      typeText(mounted.view, "!");
      await vi.advanceTimersByTimeAsync(300);

      expect(onMarkdownUpdated).toHaveBeenCalledWith({
        markdown: "[plain **bold**](first)\n\nTail!\n",
        previousMarkdown: "[plain **bold**](first)\n\nTail\n",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    "[before](https://example.com/LEAFDOWNLOGICALLINK0PLACEHOLDER) [plain **bold**](target)",
    '[before](https://example.com "LEAFDOWNLOGICALLINK0PLACEHOLDER") [plain **bold**](target)',
  ])("avoids logical-link placeholder collisions in %s", async (source) => {
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });
});

describe("Authored raw line breaks", () => {
  it.each([
    "a <br /> b",
    "a<br>b",
    "a <br/> b",
    "a <br > b",
    "a <BR> b",
    "line<br>\nnext",
    "<br />",
    "<br>",
    "# a <br /> b",
    "* item <br /> tail",
    "> quoted <br /> text",
    "| left       | right |\n| ---------- | ----- |\n| x <br /> y | z     |",
    "Reference[^1]\n\n[^1]: definition <br /> tail",
    "`a <br /> b`",
    "```\na <br /> b\n```",
    "<div>\n<br />\n</div>",
  ])("preserves an authored line break in %j", async (source) => {
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it("preserves an authored line break through an edit", async () => {
    const mounted = await mountEditor("a <br /> b");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "!");

    expect(mounted.getMarkdown()).toBe("a <br /> b!\n");
  });

  it("keeps a footnote definition whose content is raw HTML", async () => {
    const source = "Reference[^1]\n\n[^1]: <div>x</div>";
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });
});

describe("Blank paragraphs", () => {
  it.each([
    "a\n\n\n\nb",
    "a\n\n\n\n\n\nb",
    "> a\n>\n>\n>\n> b",
    "Reference[^1]\n\n[^1]: one\n\n\n\n    two",
  ])("preserves the blank paragraphs in %j", async (source) => {
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it.each([1, 2, 3])(
    "writes and restores %i blank paragraphs made in the editor",
    async (count) => {
      const mounted = await mountEditor("a\n\nb");
      const { view } = mounted;
      const blankParagraphs = Array.from({ length: count }, () =>
        view.state.schema.nodes.paragraph.create(),
      );

      view.dispatch(view.state.tr.insert(view.state.doc.child(0).nodeSize, blankParagraphs));

      const markdown = mounted.getMarkdown();
      const reopened = await mountEditor(markdown);

      expect(reopened.view.state.doc.childCount).toBe(count + 2);
      expect(reopened.getMarkdown()).toBe(markdown);
    },
  );

  it("does not write a line break to represent a blank paragraph", async () => {
    const mounted = await mountEditor("a\n\nb");
    const { view } = mounted;

    view.dispatch(
      view.state.tr.insert(
        view.state.doc.child(0).nodeSize,
        view.state.schema.nodes.paragraph.create(),
      ),
    );

    expect(mounted.getMarkdown()).not.toContain("<br");
  });
});
