import { describe, expect, it, vi } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { BASIC_TABLE_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  setSelectionAtDocumentEnd,
  typeText,
} from "@/test/utils/prosemirror";
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
// unordered/task markers become `*`, thematic breaks become `***`, and
// serialized output includes a final newline.
const supportedMarkdownExpected = `# Heading

Paragraph with *emphasis*, **strong**, \`code\`, ~~strike~~, https://example.com, and [link](docs/readme.md).

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
    "[plain \\*literal\\* and **bold**](https://example.com)",
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
    "https://example.com",
    "<https://example.com>",
    "<a@b.com>",
    "www.example.com/path",
    "testing@example.com and first.last+tag@example.co.uk",
    "Mixed https://example.com and <https://leafdown.dev>",
    "Parenthesis before the link: (www.example.com)",
    "Visit https://example.com/one, https://example.com/two. and (https://example.com/three).",
    "Balanced path: https://example.com/a(b)c and unmatched path: https://example.com/a(b)).",
    "**https://example.com**",
    "[https://example.com](https://leafdown.dev)",
  ])("keeps the authored autolink form in %s", async (source) => {
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it("writes a bare autolink as a full link once its text stops spelling its target", async () => {
    const mounted = await mountEditor("https://example.com");
    const textPosition = getEditorTextPosition(mounted, "example.com");

    mounted.view.dispatch(mounted.view.state.tr.insertText(" ", textPosition));

    expect(mounted.getMarkdown()).toBe("[https:// example.com](https://example.com)\n");
  });

  it("writes a bare autolink with angle brackets once an edit closes text in on it", async () => {
    const mounted = await mountEditor("tail https://example.com");
    const spacePosition = getEditorTextPosition(mounted, " https://example.com");

    mounted.view.dispatch(mounted.view.state.tr.delete(spacePosition, spacePosition + 1));

    expect(mounted.getMarkdown()).toBe("tail<https://example.com>\n");
  });

  it.each([
    "* ```\n  code\n  ```",
    "1. ```\n   code\n   ```",
    "* | A | B |\n  | - | - |\n  | 1 | 2 |",
    "1. | A | B |\n   | - | - |\n   | 1 | 2 |",
    "* > quoted",
    "1. > quoted",
    "* * child",
    "1. * child",
    "* ## Title",
    "1. ## Title",
    "- ***",
    "1. ***",
  ])("keeps a non-paragraph first child inside its list item in %s", async (source) => {
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it.each([
    { expected: "* ```\n  code\n  ```\n", source: "*     code" },
    { expected: "1. ```\n   code\n   ```\n", source: "1.     code" },
  ])(
    "keeps an indented-code first child inside its list item in $source",
    async ({ expected, source }) => {
      const mounted = await mountEditor(source);

      expect(mounted.getMarkdown()).toBe(expected);
    },
  );

  it("keeps an empty list item empty", async () => {
    const mounted = await mountEditor("* first\n*\n* third");

    expect(mounted.getMarkdown()).toBe("* first\n\n*\n\n* third\n");
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
    "**[a b](./doc.md)**",
    "*[a b](./doc.md)*",
    "~~[a b](./doc.md)~~",
    "~~[`a b`](./doc.md)~~",
  ])("keeps a mark wrapping a whole link outside the link in %s", async (source) => {
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it.each([
    { expected: "**[a b](./doc.md)**", source: "**[**a** b](./doc.md)**" },
    { expected: "**[a b c](./doc.md)**", source: "**[a **b** c](./doc.md)**" },
    { expected: "**bold [a b](./doc.md) tail**", source: "**bold [**a** b](./doc.md) tail**" },
    { expected: "*[a b](./doc.md)*", source: "*[*a* b](./doc.md)*" },
    { expected: "~~[a b](./doc.md)~~", source: "~~[~~a~~ b](./doc.md)~~" },
    { expected: "**[a b](./doc.md)**", source: "**[a **b**](./doc.md)**" },
    { expected: "**[*a* b](./doc.md)**", source: "**[*a* b](./doc.md)**" },
    { expected: "**~~a b~~**", source: "~~**a b**~~" },
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

  it.each([
    "[label[^note]](./doc.md)",
    "[**bold** label[^note]](./doc.md)",
    "[**bold**[^note]](./doc.md)",
    "**[label[^note]](./doc.md)**",
  ])("preserves logical link wrappers around footnote references in %s", async (source) => {
    const mounted = await mountEditor(`${source}\n\n[^note]: Detail`);

    expect(mounted.getMarkdown()).toBe(`${source}\n\n[^note]: Detail\n`);
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

// Each fixture is the source that produces the document, so a case that must lose an escape is
// written with the one it loses.
describe("Escape precision", () => {
  it.each([
    { saved: "garden_sensor_name", source: "garden\\_sensor\\_name" },
    { saved: "sensor.reading_value", source: "sensor.reading\\_value" },
    { saved: "foo__bar__baz", source: "foo\\_\\_bar\\_\\_baz" },
    { saved: "snake_case_ trailing", source: "snake\\_case\\_ trailing" },
    { saved: "*opening-only asterisk emphasis", source: "\\*opening-only asterisk emphasis" },
    { saved: "closing-only asterisk emphasis*", source: "closing-only asterisk emphasis\\*" },
    { saved: "a * b * c", source: "a \\* b \\* c" },
    { saved: "text with [ bracket", source: "text with \\[ bracket" },
    { saved: "text with ] bracket", source: "text with ] bracket" },
    {
      saved: "\\[intentionally literal](garden.md)",
      source: "\\[intentionally literal]\\(garden.md)",
    },
  ])("writes $saved without an escape it does not need", async ({ saved, source }) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${saved}\n`);
  });

  it.each([
    "\\*not emphasis\\*",
    "\\*\\*not strong emphasis\\*\\*",
    "\\_not emphasis\\_",
    "\\_\\_not strong emphasis\\_\\_",
    "\\* not a list item",
    "\\*\\*\\*",
    "\\_\\_\\_",
    "\\# not a heading",
    "\\> not a quote",
    "\\- not a list item",
    "\\[reference]\\[label]",
    "\\[intentionally literal](garden.md)",
    "!\\[intentionally literal](garden.png)",
    "\\`not code\\`",
    "\\~\\~not strikethrough\\~\\~",
    "\\<span>not html\\</span>",
    "a \\ b",
    "C:\\Users\\me",
    "\\\\#",
    "\\\\[",
  ])("keeps the escape the document needs in %j", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });
});

describe("Typed link source", () => {
  const typedLinkSourceFixtures = [
    {
      expected: "\\[test link](./test.html)",
      name: "inline link",
      typed: "[test link](./test.html)",
    },
    { expected: "https\\://example.com", name: "autolink literal", typed: "https://example.com" },
    { expected: "\\<https\\://example.com>", name: "URI autolink", typed: "<https://example.com>" },
  ];

  it.each(typedLinkSourceFixtures)(
    "keeps a typed $name literal when it ends the paragraph",
    async ({ expected, typed }) => {
      const mounted = await mountEditor("");

      setSelectionAtDocumentEnd(mounted.view);
      typeText(mounted.view, typed);

      expect(mounted.getMarkdown()).toBe(`${expected}\n`);
    },
  );

  it.each(typedLinkSourceFixtures)(
    "keeps a typed $name literal when a space follows it",
    async ({ expected, typed }) => {
      const mounted = await mountEditor("");

      setSelectionAtDocumentEnd(mounted.view);
      typeText(mounted.view, `${typed} `);

      expect(mounted.getMarkdown()).toBe(`${expected} \n`);
    },
  );

  it.each(["\\[test link](./test.html)", "\\[test link](./test.html) "])(
    "reloads a typed inline link as the text the editor presented in %j",
    async (source) => {
      const mounted = await mountEditor(source);

      expect(mounted.view.dom.querySelector("a")).toBeNull();
      expect(mounted.view.dom).toHaveTextContent("[test link](./test.html)");
    },
  );

  it("writes an ordinary trailing space as itself", async () => {
    const mounted = await mountEditor("");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "plain tail ");

    expect(mounted.getMarkdown()).toBe("plain tail \n");
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
