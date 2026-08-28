import { describe, expect, it, vi } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { BASIC_TABLE_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  findEditorTextNode,
  getEditorNodePosition,
  getEditorTextPosition,
  getMarkNames,
  setSelectionAtDocumentEnd,
  setTextSelection,
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
    expected: "Keep [[Wiki Link]] as ordinary text.\n",
  },
  {
    name: "directive-like text",
    source: '::note{title="Unsupported"}',
    expected: '::note{title="Unsupported"}\n',
  },
  {
    name: "malformed HTML-like text",
    source: "<custom broken",
    expected: "<custom broken\n",
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

  it.each([
    "* A\n* B",
    "* A\n\n* B",
    "1. A\n2. B",
    "1. A\n\n2. B",
    "* A\n  ```\n  code\n  ```\n* B",
    "* A\n\n  ```\n  code\n  ```\n\n* B",
    "* [ ] todo\n* [x] done",
    "* [ ] todo\n\n* [x] done",
    "* A\n  * B\n  * C\n* D",
  ])("keeps the authored list tightness in %j", async (source) => {
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it("keeps an empty list item empty", async () => {
    const mounted = await mountEditor("* first\n*\n* third");

    expect(mounted.getMarkdown()).toBe("* first\n*\n* third\n");
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
    {
      saved: "!\"#$%&'()*+,-./:;<=>?@[\\\\]^_\\`{|}~",
      source:
        "\\!\\\"\\#\\$\\%\\&\\'\\(\\)\\*\\+\\,\\-\\.\\/\\:\\;\\<\\=\\>\\?\\@\\[\\\\\\]\\^\\_\\`\\{\\|\\}\\~",
    },
    // `mdast-util-gfm-autolink-literal` escapes `.` and `@` around any word-shaped run beside a
    // `www` or protocol lead, even where the run cannot pass its own domain check and can never
    // read as a link, so the escape guards against a risk that is not present.
    { saved: "name@example", source: "name\\@example" },
    { saved: "a@b", source: "a\\@b" },
    { saved: "www.example_.com", source: "www\\.example\\_.com" },
    // A mark holds only a fragment of its line, so the `[` escapes stay while the `(` relaxes:
    // the `\[` alone already keeps the run literal.
    { saved: "**\\[a](b)**", source: "**\\[a]\\(b)**" },
    { saved: "*text \\[a](b) more*", source: "*text \\[a]\\(b) more*" },
    { saved: "**a \\[x](y) b**", source: "**a \\[x]\\(y) b**" },
    { saved: "~~\\[a](b)~~", source: "~~\\[a]\\(b)~~" },
    { saved: "***\\[a](b)***", source: "***\\[a]\\(b)***" },
    {
      saved: "| bed         |\n| ----------- |\n| **\\[a](b)** |",
      source: "| bed |\n| --- |\n| **\\[a]\\(b)** |",
    },
    // The enclosing delimiters pair only with a run of their own character, so the other
    // attention character has no counterpart to reach and keeps no escape.
    { saved: "**_a**", source: "**\\_a**" },
    { saved: "**a_**", source: "**a\\_**" },
    { saved: "*_a*", source: "*\\_a*" },
    { saved: "~~_a~~", source: "~~\\_a~~" },
    { saved: "[_a](u)", source: "[\\_a](u)" },
    { saved: "__*a__", source: "__\\*a__" },
    // The line a mark sits on decides the bracket, so a `[` no `]` can reach loses its escape
    // inside the mark exactly as it does outside one.
    { saved: "**text with [ bracket**", source: "**text with \\[ bracket**" },
    { saved: "~~text with [ bracket~~", source: "~~text with \\[ bracket~~" },
    { saved: "*a **b** [ c*", source: "*a **b** \\[ c*" },
    // A tilde run reaches a counterpart only through a run of its own length, so an opener with no
    // closer, a closer with no opener, and a mismatched pair all stay literal where they sit.
    {
      saved: "~opening-only single-tilde strikethrough",
      source: "\\~opening-only single-tilde strikethrough",
    },
    {
      saved: "closing-only double-tilde strikethrough~~",
      source: "closing-only double-tilde strikethrough\\~\\~",
    },
    {
      saved: "~single tilde opens but double tildes close~~",
      source: "\\~single tilde opens but double tildes close\\~\\~",
    },
    {
      saved: "~ opening space~ and ~closing space ~ remain literal.",
      source: "\\~ opening space\\~ and \\~closing space \\~ remain literal.",
    },
    {
      saved: "Inline ~~~three tildes do not strike~~~ remains literal.",
      source: "Inline \\~\\~\\~three tildes do not strike\\~\\~\\~ remains literal.",
    },
    {
      saved: "Empty candidates: ~~ and ~~~~ remain literal inline text.",
      source: "Empty candidates: \\~\\~ and \\~\\~\\~\\~ remain literal inline text.",
    },
    {
      saved: "This ~~does not cross\n\na paragraph boundary~~.",
      source: "This \\~\\~does not cross\n\na paragraph boundary\\~\\~.",
    },
    // Escaping the opener already breaks the pair, so the run it can no longer reach drops its own
    // escape. The third run below reaches neither escaped run before it.
    {
      saved: "\\~not single-tilde strikethrough~",
      source: "\\~not single-tilde strikethrough\\~",
    },
    {
      saved: "\\~\\~not double-tilde strikethrough~~",
      source: "\\~\\~not double-tilde strikethrough\\~\\~",
    },
    { saved: "\\*not emphasis*", source: "\\*not emphasis\\*" },
    { saved: "\\_\\_not strong emphasis__", source: "\\_\\_not strong emphasis\\_\\_" },
    { saved: "[\\*a*](u)", source: "[\\*a\\*](u)" },
    { saved: "\\~a\\~b~", source: "\\~a\\~b\\~" },
    // An autolink needs a scheme of two to thirty-two characters, and a tag name admits neither a
    // `.` nor a `:`, so neither construct can open where the angle brackets sit.
    { saved: "<a:too-short>", source: "\\<a:too-short>" },
    { saved: "<foo.bar.baz>", source: "\\<foo.bar.baz>" },
    { saved: "<a.b>", source: "\\<a.b>" },
    {
      saved: "<abcdefghijklmnopqrstuvwxyzabcdefg:thirty-three>",
      source: "\\<abcdefghijklmnopqrstuvwxyzabcdefg:thirty-three>",
    },
    // A bracket run closes no link when the destination is never closed, the reference label is
    // never closed, or no definition resolves the label.
    { saved: "[missing destination](", source: "\\[missing destination]\\(" },
    { saved: "[full reference][unclosed", source: "\\[full reference]\\[unclosed" },
    { saved: "[collapsed reference][", source: "\\[collapsed reference]\\[" },
    { saved: "[missing destination]", source: "\\[missing destination]" },
    { saved: "[reference][label]", source: "\\[reference]\\[label]" },
    { saved: "**[reference][label]**", source: "**\\[reference]\\[label]**" },
    // The line decides a construct a sibling interrupts. A bare autolink leaves the `<` alone in
    // its own node, and raw HTML does the same, so neither is decidable from that node.
    { saved: "<https://example.com path>", source: "\\<https://example.com path>" },
    { saved: "<https://example.com", source: "\\<https://example.com" },
    {
      saved: "<data:text/html,<script>alert(1)</script>>",
      source: "\\<data:text/html,<script>alert(1)</script>>",
    },
    // The `]` on the far side of the mark closes nothing, since no definition resolves the label
    // it would spell.
    {
      saved: "**text with [ bracket** and ] after",
      source: "**text with \\[ bracket** and ] after",
    },
    // A tail that never closes its destination or its title closes no link either.
    {
      saved: "[Unbalanced](garden(section.md)",
      source: "\\[Unbalanced](garden(section.md)",
    },
    {
      saved: "[angle destination](<destination.md)",
      source: "\\[angle destination](<destination.md)",
    },
    {
      saved: "![angle image destination](<image.png)",
      source: "!\\[angle image destination](<image.png)",
    },
    {
      saved: '[double-quoted title](garden.md "unclosed)',
      source: '\\[double-quoted title](garden.md "unclosed)',
    },
    {
      saved: "[single-quoted title](garden.md 'unclosed)",
      source: "\\[single-quoted title](garden.md 'unclosed)",
    },
    {
      saved: "[parenthesized title](garden.md (unclosed)",
      source: "\\[parenthesized title](garden.md (unclosed)",
    },
    {
      saved: '![unclosed image title](garden.png "unclosed)',
      source: '!\\[unclosed image title](garden.png "unclosed)',
    },
    // A link that forms leaves every opener before it inactive, so a bracket run wrapping one can
    // never become a link of its own.
    {
      saved: "[outer [inner](inner.md) text](outer.md)",
      source: "\\[outer [inner](inner.md) text]\\(outer.md)",
    },
    { saved: "*a [ b* [link](u)", source: "*a \\[ b* [link](u)" },
    // A `&` only opens a reference. One that never closes, names nothing, or overruns its digit
    // budget is ordinary text.
    { saved: "&copy no semicolon", source: "&copy no semicolon" },
    { saved: "&MadeUpEntity; names nothing", source: "&MadeUpEntity; names nothing" },
    { saved: "&123; is not a name", source: "&123; is not a name" },
    { saved: "&#; and &#x; hold no digits", source: "&#; and &#x; hold no digits" },
    { saved: "&#12345678; overruns eight digits", source: "&#12345678; overruns eight digits" },
    { saved: "&#x1234567; overruns seven digits", source: "&#x1234567; overruns seven digits" },
  ])("writes $saved without an escape it does not need", async ({ saved, source }) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${saved}\n`);
  });

  it.each([
    "\\*not emphasis*",
    "\\*\\*not strong emphasis**",
    "\\_not emphasis_",
    "\\_\\_not strong emphasis__",
    "\\* not a list item",
    "1\\. not a list item",
    "\\*\\*\\*",
    "\\_\\_\\_",
    "\\# not a heading",
    "\\> not a quote",
    "\\- not a list item",
    "\\[intentionally literal](garden.md)",
    "!\\[intentionally literal](garden.png)",
    "\\![literal bang before a live link](garden.png)",
    "\\`not code\\`",
    "\\~\\~not strikethrough~~",
    "\\<span>not html\\</span>",
    "| bed         |\n| ----------- |\n| alpha\\|beta |",
    "a \\ b",
    "C:\\Users\\me",
    "\\\\#",
    "\\\\[",
    // A `]` later on the line still closes a `[` inside a mark, wherever the two sit.
    "**\\[a** b](c)",
    // A mark inside the candidate does not put the rest of the tag out of reach.
    '\\<a href="**x**">',
    "\\<https://example.com/**a**>",
    "**\\[intentionally literal](garden.md)**",
    // A well-formed construct held as literal text keeps the escape that holds it there.
    "\\<https://example.com>",
    "\\<div>",
    '\\<a href="garden.md">',
    "\\<!-- comment -->",
    "\\[label](target.md)",
    "!\\[label](target.png)",
    // The same tails, closed. A destination may balance its own parentheses, may be empty, and may
    // hold a space inside angle brackets; a title closes in any of its three forms.
    "\\[Balanced](garden(section(one)).md)",
    "\\[Empty destination]()",
    "\\[angle destination](<folder name/file.md>)",
    '\\[Double quote](garden.md "Garden")',
    "\\[Single quote](garden.md 'Garden')",
    "\\[Parentheses](garden.md (Garden))",
    // No link-reference definition survives the editor, so a footnote definition is the one
    // resolvable label a document can still hold.
    "\\[^1] literal\n\n[^1]: Footnote text",
    // The enclosing delimiters remain available counterparts for a run of the same character.
    "**\\*a**",
    "**\\*opening-only asterisk**",
    "**text \\*mid asterisk**",
    "[\\*a*](u)",
    // A link label is closed by its own `](`, which no relaxation may assume away.
    "[x \\[ y](u)",
    "[x \\] y](u)",
    // Equal-length tilde runs reach each other, and a strikethrough's own delimiters stay reachable
    // from the text it wraps.
    "\\~not single-tilde strikethrough~",
    "\\~\\~not double-tilde strikethrough~~",
    "~~a\\~b~~",
    // The third run reaches neither escaped run before it, so two escapes hold the whole line.
    "\\~a\\~b~",
    // Three tildes at the start of a line open a code fence.
    "\\~\\~\\~",
    // A reference that would form on the next read has to stay broken, or two saves decode it.
    "\\&copy;",
    "\\&AElig;",
    "\\&amp;",
    "\\&#169;",
    "\\&#xA9;",
    // U+0000 is a well-formed reference; CommonMark decodes it to U+FFFD rather than rejecting it.
    "\\&#0;",
  ])("keeps the escape the document needs in %j", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });
});

describe("Raw link destination parentheses", () => {
  it.each([
    {
      saved: "[Balanced](garden(section(one)).md)",
      source: "[Balanced](garden\\(section\\(one\\)\\).md)",
    },
    { saved: "[Escaped](garden(section).md)", source: "[Escaped](garden\\(section\\).md)" },
    {
      saved: "[Inline script scheme](javascript:alert(1))",
      source: "[Inline script scheme](javascript:alert(1))",
    },
    { saved: '[Titled](garden(one).md "Garden")', source: '[Titled](garden(one).md "Garden")' },
    { saved: "![Image](garden(one).png)", source: "![Image](garden(one).png)" },
  ])("writes $saved without an escape it does not need", async ({ saved, source }) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${saved}\n`);
  });

  // An unbalanced parenthesis cannot be written raw at all, so the angle-bracket form is the only
  // source that carries one into the document.
  it.each([
    {
      saved: "[Unbalanced open](garden\\(section.md)",
      source: "[Unbalanced open](<garden(section.md>)",
    },
    {
      saved: "[Unbalanced close](garden\\)section.md)",
      source: "[Unbalanced close](<garden)section.md>)",
    },
    // The image serializes inside the link handler, which has already relaxed the escapes its own
    // balanced destination does not need.
    {
      saved: "[![alt](img\\(1.png)](target(2).md)",
      source: "[![alt](<img(1.png>)](target(2).md)",
    },
  ])("keeps the escape $saved needs", async ({ saved, source }) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${saved}\n`);
  });
});

describe("Character references", () => {
  it.each([
    "&copy; &#169; &#xA9; &AElig;",
    // CommonMark decodes this to U+FFFD, and the reference writes back as the reference.
    "&#0;",
    // The decoded character is invisible, which is the form an author is most likely to want back.
    "&nbsp;x",
    "&#8212; em dash",
    // A reference is not syntax, so the run needs no escape and the marker stays where it was
    // authored rather than moving onto a backslash.
    "&#35; not a heading",
    "&#42;not emphasis&#42;",
    "&#42; not a list item",
    "&#124; pipe",
    // An escaped ampersand is a reference the file spells out, and stays one.
    "&amp;copy;",
    "[&copy; label](/uri)",
    "# Heading with &copy;",
    "> quote &copy;",
  ])("writes %j as it was authored", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // A reference contributes the characters it will be written as, so neither it nor its neighbours
  // gain an escape from sitting next to one.
  it.each([
    "&copy; text with *star",
    "&copy; text with [ bracket",
    "&copy; garden_sensor_name",
    "&copy; *emphasis* and &#42;literal&#42;",
  ])("leaves %j unescaped beside a reference", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it("writes the character rather than the reference once an edit replaces it", async () => {
    const mounted = await mountEditor("&copy;\n");
    const start = getEditorTextPosition(mounted, "©");

    setTextSelection(mounted.view, start, start + 1);
    typeText(mounted.view, "z");

    expect(mounted.getMarkdown()).toBe("z\n");
  });

  it("does not carry the reference onto text typed after it", async () => {
    const mounted = await mountEditor("&copy;\n");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "x");

    expect(mounted.getMarkdown()).toBe("&copy;x\n");
  });
});

describe("Typed link source", () => {
  const typedLinkSourceFixtures = [
    {
      expected: "\\[test link](./test.html)",
      name: "inline link",
      typed: "[test link](./test.html)",
    },
    { expected: "https://example.com", name: "autolink literal", typed: "https://example.com" },
    { expected: "\\<https://example.com>", name: "URI autolink", typed: "<https://example.com>" },
  ];

  it.each(typedLinkSourceFixtures)(
    "keeps a typed $name literal while the caret is still on it",
    async ({ expected, typed }) => {
      const mounted = await mountEditor("");

      setSelectionAtDocumentEnd(mounted.view);
      typeText(mounted.view, typed);

      expect(mounted.getMarkdown()).toBe(`${expected}\n`);
    },
  );

  it.each(typedLinkSourceFixtures)(
    "writes a typed $name as the link it describes once a space follows it",
    async ({ typed }) => {
      const mounted = await mountEditor("");

      setSelectionAtDocumentEnd(mounted.view);
      typeText(mounted.view, `${typed} `);

      expect(mounted.getMarkdown()).toBe(`${typed} \n`);
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

describe("Typed inline mark source", () => {
  const typeInto = async (initial: string, typed: string) => {
    const mounted = await mountEditor(initial);

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, typed);

    return mounted.getMarkdown();
  };

  it.each([
    { expected: "~~text~~", name: "double-tilde strikethrough", typed: "~~text~~" },
    { expected: "~~text~~", name: "single-tilde strikethrough", typed: "~text~" },
    { expected: "~~a\\~b~~", name: "strikethrough holding a tilde", typed: "~~a~b~~" },
    { expected: "*text*", name: "emphasis", typed: "*text*" },
    { expected: "**text**", name: "strong emphasis", typed: "**text**" },
    { expected: "_text_", name: "underscore emphasis", typed: "_text_" },
    { expected: "__text__", name: "underscore strong emphasis", typed: "__text__" },
    { expected: "`text`", name: "inline code", typed: "`text`" },
  ])("writes a typed $name as the construct it spells", async ({ expected, typed }) => {
    expect(await typeInto("", typed)).toBe(`${expected}\n`);
  });

  // GFM reads a strikethrough only where the closing delimiter run matches the opening one.
  it.each([
    { expected: "~~", typed: "~~" },
    { expected: "~~text", typed: "~~text" },
    { expected: "~~text~", typed: "~~text~" },
    { expected: "~~ ~~", typed: "~~ ~~" },
  ])("keeps an unclosed tilde run in %j literal", async ({ expected, typed }) => {
    expect(await typeInto("", typed)).toBe(`${expected}\n`);
  });

  it.each([
    { expected: "* item ~~text~~", initial: "- item", name: "a list item" },
    { expected: "> quote ~~text~~", initial: "> quote", name: "a blockquote" },
  ])("writes a strikethrough typed in $name", async ({ expected, initial }) => {
    expect(await typeInto(initial, " ~~text~~")).toBe(`${expected}\n`);
  });

  it.each([
    { expected: "*text* tail", name: "emphasis", typed: "*text* tail" },
    { expected: "**text** tail", name: "strong emphasis", typed: "**text** tail" },
    { expected: "_text_ tail", name: "underscore emphasis", typed: "_text_ tail" },
    { expected: "__text__ tail", name: "underscore strong emphasis", typed: "__text__ tail" },
    { expected: "`text` tail", name: "inline code", typed: "`text` tail" },
    { expected: "~~text~~ tail", name: "strikethrough", typed: "~~text~~ tail" },
    { expected: "~~text~~ tail", name: "single-tilde strikethrough", typed: "~text~ tail" },
  ])("writes text typed after a completed $name outside it", async ({ expected, typed }) => {
    expect(await typeInto("", typed)).toBe(`${expected}\n`);
  });

  // The outer run only composes once the inner construct stops claiming what follows it.
  it.each([
    { expected: "**~~text~~**", typed: "**~~text~~**" },
    { expected: "**~~text~~**", typed: "~~**text**~~" },
  ])("writes %j nested with strong emphasis", async ({ expected, typed }) => {
    expect(await typeInto("", typed)).toBe(`${expected}\n`);
  });

  it("keeps typing at the end of an existing construct inside it", async () => {
    const mounted = await mountEditor("**text** plain");

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "text") + "text".length);
    typeText(mounted.view, "X");

    expect(mounted.getMarkdown()).toBe("**textX** plain\n");
  });

  it.each(["~~text~~", "~text~"])(
    "types %j into the document that loading its source produces",
    async (typed) => {
      const typedEditor = await mountEditor("");

      setSelectionAtDocumentEnd(typedEditor.view);
      typeText(typedEditor.view, typed);

      const reloaded = await mountEditor(typedEditor.getMarkdown());
      const loaded = await mountEditor("~~text~~");

      expect(reloaded.view.state.doc.toJSON()).toEqual(loaded.view.state.doc.toJSON());
      expect(getMarkNames(findEditorTextNode(reloaded, "text")!)).toContain("strike_through");
    },
  );
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

// Serialization used to write these as a space, so a byte round trip converges on a document that
// has already lost the break.
describe("Line breaks before raw HTML", () => {
  it.each([
    'Text before.\n<garden-card data-bed="north">',
    'Text before.\n<span class="leaf">x</span> tail',
    "Text before.\n<br />",
    "Text before.  \n<br />",
    "Text before.\\\n<br />",
    "> Text before.\n> <br />",
    "- Text before.\n  <br />",
    "Reference[^1]\n\n[^1]: Text before.\n    <br />",
  ])("keeps the break and adds no backslash in %j", async (source) => {
    const before = await mountEditor(source);
    const after = await mountEditor(before.getMarkdown());

    expect(after.view.state.doc.toJSON()).toEqual(before.view.state.doc.toJSON());
  });

  it("still writes a space before raw HTML that would interrupt the paragraph", async () => {
    const mounted = await mountEditor("Text <div> more");
    const { view } = mounted;

    view.dispatch(
      view.state.tr.insert(
        getEditorNodePosition(mounted, "html"),
        view.state.schema.nodes.hardbreak.create({ isInline: true }),
      ),
    );

    const reopened = await mountEditor(mounted.getMarkdown());

    expect(reopened.view.state.doc.childCount).toBe(1);
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
