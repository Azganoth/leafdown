// @vitest-environment happy-dom

import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { BASIC_TABLE_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { type MountedMilkdownEditor, setupMilkdownEditorMount } from "@/test/utils/milkdown";
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

import { type EditorCommandId, runEditorCommand } from "../commands";
import { toggleTaskCheckedAt } from "../utils/taskLists";

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

// The save writes the fixture back as it was authored, apart from the final newline.
const supportedMarkdownExpected = `${supportedMarkdown}
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

const getEditorLinkHref = (mounted: MountedMilkdownEditor, text: string) => {
  const href = findEditorTextNode(mounted, text)?.marks.find((mark) => mark.type.name === "link")
    ?.attrs.href;

  return typeof href === "string" ? href : null;
};

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
    "\\<test@example.com>",
    "&lt;https://example.com&gt;",
    "&lt;https://example.com&gt; tail",
    "https://example.com&gt;",
    "test@example.com&gt;",
    "https://example.com&notarealentity;",
    "test@example.com&notarealentity;",
    "&lt;https://example.com&notarealentity;",
    "https://example.com&notarealentity; tail",
    "https://example.com&gt;&notarealentity;",
    "https://example.com&notarealentity;&gt;",
    "https://example.com&copy",
    "https://example.com&#62;",
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

  // The angle-bracket fallback writes the very brackets these documents already hold, so the bytes
  // it produces converge while the document has moved to the other autolink form.
  it.each([
    "\\<test@example.com>",
    "&lt;https://example.com&gt;",
    "https://example.com&notarealentity;",
    "https://example.com&gt;&notarealentity;",
  ])("keeps a bare autolink beside a trimmed neighbour across a save in %j", async (source) => {
    const before = await mountEditor(source);
    const after = await mountEditor(before.getMarkdown());

    expect(after.view.state.doc.toJSON()).toEqual(before.view.state.doc.toJSON());
  });

  // A marker beside a literal is one the file may escape, and a literal's target takes a backslash
  // in rather than leaving it out, so an untouched document grew one backslash per save while every
  // save still converged on its own output.
  it.each([
    {
      expected: "<https://example.com>*\n",
      href: "https://example.com",
      source: "https://example.com*",
      text: "https://example.com",
    },
    {
      expected: "<https://example.com>_\n",
      href: "https://example.com",
      source: "https://example.com_",
      text: "https://example.com",
    },
    {
      expected: "<https://example.com>~\n",
      href: "https://example.com",
      source: "https://example.com~",
      text: "https://example.com",
    },
    {
      expected: "<test@example.com>*\n",
      href: "mailto:test@example.com",
      source: "test@example.com*",
      text: "test@example.com",
    },
  ])(
    "keeps the target of a bare autolink an escaped marker follows in $source",
    async ({ expected, href, source, text }) => {
      const first = await mountEditor(source);
      const saved = first.getMarkdown();

      expect(saved).toBe(expected);

      const second = await mountEditor(saved);
      const third = await mountEditor(second.getMarkdown());

      expect(second.getMarkdown()).toBe(saved);
      expect(third.view.state.doc.toJSON()).toEqual(second.view.state.doc.toJSON());
      expect(getEditorLinkHref(third, text)).toBe(href);
    },
  );

  it("writes a bare autolink with angle brackets once a typed character reference follows it", async () => {
    const mounted = await mountEditor("https://example.com");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "&copy;");

    expect(mounted.getMarkdown()).toBe("<https://example.com>\\&copy;\n");
  });

  it("writes a bare autolink with angle brackets once an edit puts text the target takes in after a trimmed run", async () => {
    const mounted = await mountEditor("https://example.com&notarealentity; tail");
    const spacePosition = getEditorTextPosition(mounted, " tail");

    mounted.view.dispatch(mounted.view.state.tr.delete(spacePosition, spacePosition + 1));

    expect(mounted.getMarkdown()).toBe("<https://example.com>&notarealentity;tail\n");
  });

  it("writes a bare autolink with angle brackets once an edit puts a bracket its target takes in after it", async () => {
    const mounted = await mountEditor("https://example.com >tail");
    const spacePosition = getEditorTextPosition(mounted, " >tail");

    mounted.view.dispatch(mounted.view.state.tr.delete(spacePosition, spacePosition + 1));

    expect(mounted.getMarkdown()).toBe("<https://example.com>>tail\n");
  });

  it("writes a bare autolink with angle brackets once an edit stops a following reference from being trimmed", async () => {
    const mounted = await mountEditor("&lt;https://example.com&gt; tail");
    const spacePosition = getEditorTextPosition(mounted, " tail");

    mounted.view.dispatch(mounted.view.state.tr.delete(spacePosition, spacePosition + 1));

    expect(mounted.getMarkdown()).toBe("&lt;<https://example.com>&gt;tail\n");
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
    // A construct on the line writes its own delimiters and its content, so a marker reaches a
    // counterpart through what a sibling spells rather than through the sibling merely being there.
    { saved: "[a](b)*", source: "[a](b)\\*" },
    { saved: "[a](b)_", source: "[a](b)\\_" },
    { saved: "[a](b)~", source: "[a](b)\\~" },
    { saved: "<https://example.com>*", source: "<https://example.com>\\*" },
    { saved: "~**Bold** plain", source: "\\~**Bold** plain" },
    // A counterpart the line does spell keeps the escape, whether a construct writes it as a
    // delimiter, holds it in its content, or writes an output the tree cannot be read for.
    { saved: "*em*x\\*", source: "*em*x\\*" },
    { saved: "![alt](x.png)\\*", source: "![alt](x.png)\\*" },
    // A run flush against a span's delimiters is not standing opposite them: the two spell one
    // longer run, and the surplus the span's own pairing leaves over is literal without a
    // backslash. The counterpart is looked for past the span instead.
    { saved: "***strong**", source: "\\***strong**" },
    { saved: "**strong***", source: "**strong**\\*" },
    { saved: "___strong__", source: "\\___strong__" },
    { saved: "__strong___", source: "__strong__\\_" },
    { saved: "***em*", source: "\\*\\**em*" },
    { saved: "**strong***trailing", source: "**strong**\\*trailing" },
    { saved: "x***strong**", source: "x\\***strong**" },
    // The sum of the two runs decides whether CommonMark pairs them at all, and the span's far
    // delimiters can open wherever the text past them admits it, so a sum of three keeps the
    // escape it cannot be shown to have outgrown.
    { saved: "\\**em*", source: "\\**em*" },
    { saved: "x\\*\\*\\*\\*strong**", source: "x\\*\\*\\*\\*strong**" },
    // A delimiter inside the span could take the pairing the merged run is measured against, and
    // one on the other side of the run is a counterpart the merge does not hide.
    { saved: "**bold *and* italic**\\*", source: "**bold *and* italic**\\*" },
    { saved: "\\***strong** and *em*", source: "\\***strong** and *em*" },
    // GFM closes a strikethrough only with a run of its own length, so a tilde run a literal tilde
    // lengthens spells nothing and the escape is what holds it.
    { saved: "~~strike~~\\~", source: "~~strike~~\\~" },
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
    // An ATX heading needs a separator after its hashes and admits no more than six of them.
    { saved: "#no separator", source: "\\#no separator" },
    { saved: "####### seven hashes", source: "\\####### seven hashes" },
    // A list marker admits no more than nine digits, and only a list starting at one interrupts a
    // paragraph.
    {
      saved: "1234567890. ten digits remain paragraph text",
      source: "1234567890\\. ten digits remain paragraph text",
    },
    {
      saved: "1234567890) ten digits remain paragraph text",
      source: "1234567890\\) ten digits remain paragraph text",
    },
    {
      saved: "does not interrupt:\n2. remains paragraph text",
      source: "does not interrupt:\n2\\. remains paragraph text",
    },
    {
      saved: "does not interrupt:\n2) remains paragraph text",
      source: "does not interrupt:\n2\\) remains paragraph text",
    },
    // A marker with nothing between it and its content opens no list item at all.
    { saved: "does not interrupt:\n1)item", source: "does not interrupt:\n1\\)item" },
    // A table needs a delimiter row whose cell count matches the header row above it.
    {
      saved: "| Header | Cells |\n| --- |\n| mismatch | stays text |",
      source: "\\| Header | Cells |\n\\| --- |\n\\| mismatch | stays text |",
    },
    {
      saved: "| No delimiter row | so these lines |\n| stay paragraph text | with pipes |",
      source: "\\| No delimiter row | so these lines |\n\\| stay paragraph text | with pipes |",
    },
    // A container prefixes every line of the paragraph it holds, which the cell count reads past.
    {
      saved: "> | Header | Cells |\n> | --- |",
      source: "> \\| Header | Cells |\n> \\| --- |",
    },
    {
      saved: "* | Header | Cells |\n  | --- |",
      source: "* \\| Header | Cells |\n  \\| --- |",
    },
    { saved: "> quoted\n> 2. remains paragraph", source: "> quoted\n> 2\\. remains paragraph" },
    { saved: "> #no separator", source: "> \\#no separator" },
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
    // Whitespace between a run and the span beside it keeps them two runs rather than one, so the
    // run is still a bullet marker on its own and the span is not what holds it literal.
    "\\* **a**",
    "\\_ __a__",
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
    // Hashes followed by a separator open a heading, and the end of the line separates as a space
    // does. Six is the last depth a heading admits.
    "\\###### six hashes",
    "\\#\nsecond line",
    // At the start of a block any start number opens a list; on a continuation line only one
    // interrupts the paragraph.
    "2\\. not an ordered list item",
    "2\\) not an ordered list item",
    "123456789\\. nine digits",
    "does not interrupt:\n1\\. item",
    "does not interrupt:\n1\\) item",
    // The delimiter row matches the header row above it, so both rows open a table. Inside a
    // container the rows are counted past the prefix, which a list marker shares a width with.
    "\\| a | b |\n\\| --- | --- |",
    "> \\| a | b |\n> \\| --- | --- |",
    "* \\| a | b |\n  \\| --- | --- |",
    "* 2\\. not a nested ordered list",
  ])("keeps the escape the document needs in %j", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // Both spellings of a surplus delimiter reopen as the same document, which is why neither the
  // corpus round trip nor the document-preservation guard can see the escape. These rows assert
  // the bytes and the document together, so a relaxation that damaged the document fails here
  // rather than converging on its own output.
  it.each([
    "***strong**",
    "**strong***",
    "___strong__",
    "__strong___",
    "***em*",
    "****em*",
    "**strong***trailing",
    "x***strong**",
    "x___strong__",
  ])("writes %j as authored and reopens it as the same document", async (source) => {
    const mounted = await mountEditor(`${source}\n`);
    const document: unknown = mounted.view.state.doc.toJSON();

    expect(mounted.getMarkdown()).toBe(`${source}\n`);

    const reopened = await mountEditor(mounted.getMarkdown());

    expect(reopened.view.state.doc.toJSON()).toEqual(document);
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

describe("Raw link destination ampersands", () => {
  it.each([
    { saved: "[x](a.md?x=1&y=2)", source: "[x](a.md?x=1\\&y=2)" },
    { saved: "![x](a.png?x=1&y=2)", source: "![x](a.png?x=1\\&y=2)" },
    { saved: "[x](<a file.md?x=1&y=2>)", source: "[x](<a file.md?x=1\\&y=2>)" },
    // `&MadeUpEntity;` names nothing and `&123;` is not a name, so neither closes a reference.
    { saved: "[x](a.md?q=&MadeUpEntity;)", source: "[x](a.md?q=\\&MadeUpEntity;)" },
    { saved: "[x](a.md?q=&123;)", source: "[x](a.md?q=\\&123;)" },
  ])("writes $saved without an escape it does not need", async ({ saved, source }) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${saved}\n`);
  });

  // Writing one of these bare would decode it on the next read, which is a different destination
  // than the document holds.
  it.each([
    "[x](a.md?q=\\&copy;)",
    "[x](a.md?q=\\&#169;)",
    "[x](a.md?q=\\&#xA9;)",
    // Only the ampersands that open a reference are escaped; the rest of the query stays bare.
    "[x](a.md?a=1&b=2&q=\\&copy;)",
    "![x](a.png?q=\\&copy;)",
    // The label holds its own text, so the destination relaxing its ampersands leaves the label's
    // escape standing.
    "[\\&copy; x](a.md?q=&copy;)",
    "[\\&copy; x](a.md?x=1&y=2)",
  ])("keeps the escape the document needs in %j", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });
});

describe("Heading form", () => {
  it.each([
    "# Level one",
    "### Level three",
    "###### Level six",
    "# Level one #",
    "### Level three ###",
    "###### Level six ######",
    // CommonMark reads a closing sequence of any length, so the run the file wrote is not the
    // opening sequence read back.
    "# Trailing hashes ####",
    "### One hash closes three #",
    // An empty heading is its opening sequence, and a run after it closes rather than fills it.
    "#",
    "# #",
    "# ##",
    // A backslash keeps the hash literal, which leaves the heading with nothing closing it.
    "# Not a closer \\#",
    // The spaces or tabs after the opening sequence are the ones the file was written with.
    "#\tHeading after a tab separator",
    "#   Wide separator",
    "#  Padded closer  ##",
  ])("writes the ATX heading in %j as it was authored", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it.each([
    "Level one\n=========",
    "Level two\n---------",
    // The underline carries the level, not the length of the content above it.
    "Level two with *inline content*\n--------------------------------",
    "Paragraph becomes a heading\n---",
    "A paragraph that\n-",
    "Setext one\n=",
    "Quoted setext\n====================",
  ])("writes the setext heading in %j as it was authored", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it.each([
    { name: "a blockquote", source: "> Quoted setext\n> ====" },
    { name: "a list item", source: "- Item setext\n  ----" },
    { name: "a blockquote holding an ATX heading", source: "> # Quoted atx #" },
  ])("keeps the authored form inside $name", async ({ source }) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // Indentation before the opening sequence and whitespace closing the line stand outside the
  // characters the heading is spelled with, and Leafdown writes neither.
  it.each([
    { saved: "# Level one #", source: "   # Level one #" },
    { saved: "# Level one #", source: "# Level one #   " },
    { saved: "Level one\n=========", source: "Level one\n=========  " },
  ])("writes $source as the heading it spells", async ({ saved, source }) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${saved}\n`);
  });

  // `mdast-util-to-markdown` chooses one form for the whole document, so a file holding both is
  // what shows that preserving either cannot force the other onto its neighbours.
  it("writes both forms in one document", async () => {
    const source = "# Closed atx #\n\nSetext one\n===\n\n## Open atx\n\nSetext two\n-\n";
    const mounted = await mountEditor(source);

    expect(mounted.getMarkdown()).toBe(source);
  });

  // A heading the editor makes carries no authored form and writes the default.
  it("writes a heading made in the editor as ATX with nothing closing it", async () => {
    const mounted = await mountEditor("Paragraph\n");

    await runEditorCommand(mounted.editor, "format.heading2");

    expect(mounted.getMarkdown()).toBe("## Paragraph\n");
  });

  // A setext underline carries only levels one and two, so a heading moved past them is written
  // ATX. The authored run stays on the node, which is what returns the form to a heading moved
  // back into reach of it, at the length the file wrote and the character its level reads back as.
  it("writes a setext heading moved past level two as ATX", async () => {
    const mounted = await mountEditor("Setext one\n===\n");

    await runEditorCommand(mounted.editor, "format.increaseHeading");
    await runEditorCommand(mounted.editor, "format.increaseHeading");

    expect(mounted.getMarkdown()).toBe("### Setext one\n");

    await runEditorCommand(mounted.editor, "format.decreaseHeading");

    expect(mounted.getMarkdown()).toBe("Setext one\n---\n");
  });

  // A tight list item joins its children with a single newline, so a setext heading written after
  // a paragraph there is read back as more of that paragraph with the underline covering both. No
  // file holds one, because a setext heading written there underlines the paragraph to begin with,
  // so only an edit that puts text before it reaches this.
  it("writes a setext heading following a paragraph in a tight list item as ATX", async () => {
    const mounted = await mountEditor("- Item setext\n  ----\n");

    mounted.view.dispatch(mounted.view.state.tr.insertText("Lead", 3));

    expect(mounted.getMarkdown()).toBe("- Lead\n  ## Item setext\n");
  });

  // The document a save writes is the document that wrote it, whichever form each heading holds.
  it.each([
    "# Closed atx #",
    "Setext one\n===",
    "- Item setext\n  ----",
    "> Quoted setext\n> ====",
  ])("reopens %j as the document that wrote it", async (source) => {
    const mounted = await mountEditor(`${source}\n`);
    const reopened = await mountEditor(mounted.getMarkdown());

    expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  });

  // A heading stays a heading through a level change, so it keeps the form it was authored in. Two
  // commands reach the same level, and each row runs one document through both, so a level change
  // that keeps the form on one path cannot silently reset it on the other.
  it.each([
    { level: "format.heading2", saved: "Setext one\n---", source: "Setext one\n===", step: 1 },
    { level: "format.heading1", saved: "Setext two\n===", source: "Setext two\n---", step: -1 },
    { level: "format.heading2", saved: "## Closed atx #", source: "# Closed atx #", step: 1 },
    {
      level: "format.heading5",
      saved: "##### Level six ######",
      source: "###### Level six ######",
      step: -1,
    },
    { level: "format.heading2", saved: "##\tTab separator", source: "#\tTab separator", step: 1 },
    {
      level: "format.heading2",
      saved: "##   Wide separator",
      source: "#   Wide separator",
      step: 1,
    },
  ] satisfies { level: EditorCommandId; saved: string; source: string; step: number }[])(
    "keeps the form of $source through either command that reaches $level",
    async (row) => {
      const step: EditorCommandId =
        row.step > 0 ? "format.increaseHeading" : "format.decreaseHeading";

      for (const command of [row.level, step]) {
        const mounted = await mountEditor(`${row.source}\n`);

        await runEditorCommand(mounted.editor, command);

        expect(mounted.getMarkdown()).toBe(`${row.saved}\n`);
      }
    },
  );

  // One command reaches every block it covers, so a heading in the selection keeps its own form
  // while a paragraph beside it, which has none, is written in the default.
  it("keeps each selected heading's own form through one level change", async () => {
    const mounted = await mountEditor("Setext one\n===\n\nParagraph\n\n# Closed atx #\n");

    await runEditorCommand(mounted.editor, "edit.selectAll");
    await runEditorCommand(mounted.editor, "format.heading2");

    expect(mounted.getMarkdown()).toBe("Setext one\n---\n\n## Paragraph\n\n## Closed atx #\n");
  });

  // A heading that becomes another construct has no form to keep, because the form belonged to the
  // heading that is gone. Making one again writes the default rather than the run the file held.
  it.each([
    { away: "format.heading1", name: "toggled off and back" },
    { away: "format.paragraph", name: "turned into a paragraph" },
    { away: "format.clearBlock", name: "cleared" },
  ] satisfies { away: EditorCommandId; name: string }[])(
    "writes the default form for a heading $name",
    async ({ away }) => {
      const mounted = await mountEditor("# Closed atx #\n");

      await runEditorCommand(mounted.editor, away);

      expect(mounted.getMarkdown()).toBe("Closed atx\n");

      await runEditorCommand(mounted.editor, "format.heading1");

      expect(mounted.getMarkdown()).toBe("# Closed atx\n");
    },
  );
});

describe("Thematic break form", () => {
  const setThematicBreakMarker = (mounted: MountedMilkdownEditor, marker: string) => {
    const position = getEditorNodePosition(mounted, "hr");
    const { attrs } = mounted.view.state.doc.nodeAt(position) ?? {};

    mounted.view.dispatch(
      mounted.view.state.tr.setNodeMarkup(position, undefined, { ...attrs, marker }),
    );
  };

  it.each([
    "***",
    "---",
    "___",
    "* * *",
    "- - -",
    "_ _ _",
    "----------",
    // A tab separates the characters the way a space does. The run is read off the file rather
    // than off the tab stops the parser expands it to, so the tabs stay where they were written.
    "*\t*\t*",
  ])("writes the break in %j as it was authored", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // Indentation before the run and whitespace after it stand outside the characters the break is
  // spelled with, and Leafdown writes neither.
  it.each([
    { saved: "---", source: "   ---" },
    { saved: "---", source: "--- " },
    { saved: "_ _ _", source: "  _ _ _\t" },
  ])("writes $source as the run it spells", async ({ saved, source }) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${saved}\n`);
  });

  it.each([
    { name: "a blockquote", source: "> Quote\n>\n> ---" },
    { name: "a list item", source: "* Item\n\n  ---" },
    { name: "a tight list item", source: "* Item\n  ***" },
    { name: "a list item whose bullet it cannot join", source: "* ---\n  Paragraph" },
  ])("keeps the authored run inside $name", async ({ source }) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // A bullet and a run spelled with the same character stand on one line and are read back as one
  // longer break with no list around it. No file holds that spelling, because it opens as the
  // longer break rather than as a list, so only a run edited into it can reach the collision. The
  // run is what gives way, the bullet keeping the marker its list was authored with.
  it.each([
    { marker: "---", saved: "- ***", source: "- ***" },
    { marker: "***", saved: "* ___", source: "* ---" },
  ])(
    "writes a $marker break opening $source in a run its bullet cannot join",
    async ({ marker, saved, source }) => {
      const mounted = await mountEditor(`${source}\n  Paragraph\n`);

      setThematicBreakMarker(mounted, marker);

      expect(mounted.getMarkdown()).toBe(`${saved}\n  Paragraph\n`);
    },
  );

  // A tight list item joins its children with a single newline, so a run of hyphens written after
  // a paragraph there underlines it and the file is read back holding a heading.
  it("writes a hyphen break following a paragraph in a tight list item as the default", async () => {
    const mounted = await mountEditor("* Paragraph\n  ***\n");

    setThematicBreakMarker(mounted, "---");

    expect(mounted.getMarkdown()).toBe("* Paragraph\n  ***\n");
  });
});

describe("Table outer pipe form", () => {
  const BOTH_PIPES = "| Alpha | Bravo |\n| ----- | ----- |\n| Gamma | Delta |";
  const NO_PIPES = "Alpha | Bravo\n----- | -----\nGamma | Delta";
  const LEADING_PIPE = "| Alpha | Bravo\n| ----- | -----\n| Gamma | Delta";
  const TRAILING_PIPE = "Alpha | Bravo |\n----- | ----- |\nGamma | Delta |";

  const replaceCellText = (mounted: MountedMilkdownEditor, text: string, replacement: string) => {
    const position = getEditorTextPosition(mounted, text);
    const transaction = mounted.view.state.tr.delete(position, position + text.length);

    mounted.view.dispatch(
      replacement ? transaction.insertText(replacement, position) : transaction,
    );
  };

  it.each([
    BOTH_PIPES,
    NO_PIPES,
    LEADING_PIPE,
    TRAILING_PIPE,
    // A table with no body rows carries its form on the one row it has.
    "Alpha | Bravo\n----- | -----",
    // An alignment marker widens the delimiter cell past the lone hyphen that would open a bullet
    // list, so a one-character first column keeps the form it was authored with.
    "A  | Bravo\n:- | -----\nc  | Delta",
    // The delimiter row only has to answer for a bullet where no pipe precedes it.
    "| A | Bravo\n| - | -----\n| c | Delta",
  ])("writes the outer pipes in %j as they were authored", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it.each([
    { name: "a blockquote", source: "> Alpha | Bravo\n> ----- | -----\n> Gamma | Delta" },
    { name: "a list item", source: "* Alpha | Bravo\n  ----- | -----\n  Gamma | Delta" },
  ])("keeps the authored form inside $name", async ({ source }) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // One row's pipe answers for the table, so a form is dropped only where every row was authored
  // without it. Taking the pipes off the rows that carry them would rewrite more than it keeps.
  it("keeps an outer pipe the rows of a table disagree about", async () => {
    const mounted = await mountEditor("| Alpha | Bravo |\n| ----- | ----- |\nGamma | Delta\n");

    expect(mounted.getMarkdown()).toBe(`${BOTH_PIPES}\n`);
  });

  // A blank cell at either end of a row leaves the written row opening or closing on a pipe of its
  // own, which GFM strips before it splits the row. No source can author one into a table with no
  // outer pipes, and an edit can.
  it.each([
    {
      cell: "Gamma",
      name: "first",
      saved: "| Alpha | Bravo |\n| ----- | ----- |\n|       | Delta |\n",
    },
    {
      cell: "Delta",
      name: "last",
      saved: "| Alpha | Bravo |\n| ----- | ----- |\n| Gamma |       |\n",
    },
  ])(
    "writes a table whose $name cell an edit emptied with its outer pipes",
    async ({ cell, saved }) => {
      const mounted = await mountEditor(`${NO_PIPES}\n`);

      replaceCellText(mounted, cell, "");

      expect(mounted.getMarkdown()).toBe(saved);
    },
  );

  // A delimiter cell is as wide as its column, so a first column narrowed to one character is
  // written `-`, and that hyphen opens a bullet list where no pipe precedes it.
  it("writes a table whose first column an edit narrowed to a hyphen with its outer pipes", async () => {
    const mounted = await mountEditor("Alpha | Bravo\n----- | -----\n");

    replaceCellText(mounted, "Alpha", "A");

    expect(mounted.getMarkdown()).toBe("| A | Bravo |\n| - | ----- |\n");
  });
});

describe("List marker form", () => {
  const removeBlock = (mounted: MountedMilkdownEditor, index: number) => {
    const { doc, tr } = mounted.view.state;
    let start = 0;

    for (let child = 0; child < index; child += 1) {
      start += doc.child(child).nodeSize;
    }

    mounted.view.dispatch(tr.delete(start, start + doc.child(index).nodeSize));
  };

  it.each([
    "- Hyphen",
    "+ Plus",
    "* Asterisk",
    "1. Period",
    "1) Parenthesis",
    // CommonMark reads a change of marker as the start of another list, so adjacent lists were
    // each authored with a marker of their own.
    "- Hyphen\n\n+ Plus\n\n* Asterisk",
    "1. Period\n\n1) Parenthesis",
    // A nested list is a list of its own and carries its own marker.
    "- Outer\n  * Nested\n  * Nested again\n- Outer again",
    "1. Outer\n   + Nested\n2. Outer again",
    "+ Outer\n  1) Nested",
    // A task marker stands inside the item rather than in place of its marker.
    "- [ ] Todo\n- [x] Done",
    "1) [ ] Todo\n2) [x] Done",
  ])("writes the marker in %j as it was authored", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // Only an ordered list's first number sets the start it is read back with. The numbers after it
  // are the author's own counting, which a renumbering from the start would rewrite.
  it.each([
    "1. One\n2. Two\n3. Three",
    "3. Three\n8. Eight\n8. Eight again",
    "1. One\n1. One again\n1. One more",
    "0. Zero\n0. Zero again",
    "123456789. The longest marker CommonMark reads\n1. Short again",
  ])("writes the numbers in %j as they were authored", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it.each([
    "- one space",
    "-  two spaces",
    "-   three spaces",
    "-    four spaces",
    "10.  Padding is measured from the end of the marker",
    "-    [x] A task marker stands after the padding",
    // The widest marker and the widest padding together are the longest an item's form can be
    // read from, and the padding is measured against the character that ends it.
    "123456789.    The widest marker and the widest padding",
    "123456789.   One space short of the widest padding",
    // The padding is the column the item's own blocks are written at.
    "-   Paragraph\n\n    Second paragraph",
    "-  Paragraph\n   - Nested",
  ])("writes the marker padding in %j as it was authored", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // A list the editor makes carries no authored marker and writes the default.
  it("writes a list made in the editor with the default marker", async () => {
    const mounted = await mountEditor("Paragraph\n");

    await runEditorCommand(mounted.editor, "format.unorderedList");

    expect(mounted.getMarkdown()).toBe("* Paragraph\n");
  });

  // Two adjacent lists sharing a marker are read back as one list. No file holds that, because a
  // repeated marker opens one list to begin with, but deleting what stood between two lists does.
  it.each([
    { name: "bullet", saved: "- a\n\n* b\n", source: "- a\n\n<!---->\n\n- b\n" },
    { name: "ordered", saved: "1. a\n\n1) b\n", source: "1. a\n\n<!---->\n\n1. b\n" },
  ])(
    "moves the second of two adjacent $name lists off the marker they share",
    async ({ saved, source }) => {
      const mounted = await mountEditor(source);

      removeBlock(mounted, 1);

      expect(mounted.getMarkdown()).toBe(saved);

      const reopened = await mountEditor(saved);

      expect(reopened.view.state.doc.childCount).toBe(2);
    },
  );

  it.each([
    "-\n  Content on the line after the marker",
    "-\n  First\n- Second",
    "1.\n   Content",
    "-\n  [x] A task marker opens the content wherever it stands",
    "-\n  > A block other than a paragraph",
  ])("writes the item in %j opening on the line after its marker", async (source) => {
    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // A list interrupts the paragraph above it only where its first item opens with content, so an
  // item that would open with a blank line there is written on the marker's line instead. Only a
  // tight item joins a paragraph to the list after it, and no file holds one: a list written there
  // is read as more of the paragraph, so only an edit that tightens the item reaches this.
  it("writes an item opening on the line after its marker where its list must interrupt a paragraph", async () => {
    const mounted = await mountEditor("- Paragraph\n\n  -\n    Nested\n");
    const position = getEditorNodePosition(mounted, "list_item");
    const { attrs } = mounted.view.state.doc.nodeAt(position) ?? {};

    mounted.view.dispatch(
      mounted.view.state.tr.setNodeMarkup(position, undefined, { ...attrs, spread: false }),
    );

    expect(mounted.getMarkdown()).toBe("- Paragraph\n  - Nested\n");
  });

  // A list converted to the other kind is a construct that is gone, so the marker and the numbers
  // it was authored with go with it and the list it becomes is written in the default form. Each
  // row asserts the node the command left behind beside the bytes, because a conversion that never
  // happened writes a file the bytes alone cannot tell from one that did.
  it.each([
    {
      command: "format.unorderedList",
      node: "bullet_list",
      saved: "* One\n* Two\n",
      source: "1) One\n1) Two\n",
    },
    {
      command: "format.unorderedList",
      node: "bullet_list",
      saved: "* Three\n* Eight\n",
      source: "3. Three\n8. Eight\n",
    },
    {
      command: "format.orderedList",
      node: "ordered_list",
      saved: "1. One\n2. Two\n",
      source: "+ One\n+ Two\n",
    },
    // Tightness is not a form the conversion replaces, and nothing about it asks for a blank line
    // between the items, so a loose list stays loose and a tight one stays tight.
    {
      command: "format.unorderedList",
      node: "bullet_list",
      saved: "* One\n\n* Two\n",
      source: "1. One\n\n2. Two\n",
    },
    {
      command: "format.orderedList",
      node: "ordered_list",
      saved: "1. One\n\n2. Two\n",
      source: "+ One\n\n+ Two\n",
    },
    // The items stay the items they were, so each keeps the form it holds itself.
    {
      command: "format.unorderedList",
      node: "bullet_list",
      saved: "*   One\n*   Two\n",
      source: "1)   One\n2)   Two\n",
    },
    {
      command: "format.orderedList",
      node: "ordered_list",
      saved: "1.   One\n2.   Two\n",
      source: "-   One\n-   Two\n",
    },
    {
      command: "format.unorderedList",
      node: "bullet_list",
      saved: "* [ ] Todo\n* [x] Done\n",
      source: "1) [ ] Todo\n2) [x] Done\n",
    },
    {
      command: "format.orderedList",
      node: "ordered_list",
      saved: "1.\n   Content\n",
      source: "-\n  Content\n",
    },
  ] satisfies { command: EditorCommandId; node: string; saved: string; source: string }[])(
    "writes $source converted to a $node in the default form for it",
    async ({ command, node, saved, source }) => {
      const mounted = await mountEditor(source);

      await runEditorCommand(mounted.editor, command);

      expect(mounted.view.state.doc.firstChild?.type.name).toBe(node);
      expect(mounted.getMarkdown()).toBe(saved);
    },
  );

  // The numbers belonged to the ordered list the first conversion left behind, so the second one
  // makes a list the editor made rather than bringing that one back.
  it("writes the default numbers for a list converted away from ordered and back", async () => {
    const mounted = await mountEditor("3. Three\n8. Eight\n");

    await runEditorCommand(mounted.editor, "format.unorderedList");
    await runEditorCommand(mounted.editor, "format.orderedList");

    expect(mounted.view.state.doc.firstChild?.type.name).toBe("ordered_list");
    expect(mounted.getMarkdown()).toBe("1. Three\n2. Eight\n");
  });
});

describe("Task marker form", () => {
  // GFM reads `x` and `X` as the same checked marker and a space and a tab as the same unchecked
  // one, so the state survives whichever is written and only the authored spelling is at stake.
  // The reopened document is asserted beside the bytes, because a marker written in a form the
  // next read does not answer for costs the state rather than the form.
  it.each([
    "- [ ] Unchecked",
    "- [x] Checked",
    "- [X] Checked in uppercase",
    "- [\t] Unchecked with a tab",
    "- [X] Outer\n  - [\t] Nested",
    "1) [X] Ordered",
    "-   [X] After the padding",
    "-\n  [X] Opening on the line after its marker",
    "> - [X] Inside a blockquote",
  ])("writes the task marker in %j as it was authored", async (source) => {
    const mounted = await mountEditor(`${source}\n`);
    const saved = mounted.getMarkdown();

    expect(saved).toBe(`${source}\n`);

    const reopened = await mountEditor(saved);

    expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  });

  // A marker spells one of the two states, so the state the editor moves an item to is one the
  // authored marker cannot answer for and the default for it is written.
  it.each([
    { name: "unchecks", saved: "- [ ] Task\n", source: "- [X] Task\n" },
    { name: "checks", saved: "- [x] Task\n", source: "- [\t] Task\n" },
  ])("writes the default marker for an item the editor $name", async ({ saved, source }) => {
    const mounted = await mountEditor(source);

    await runEditorCommand(mounted.editor, "format.toggleTaskChecked");

    expect(mounted.getMarkdown()).toBe(saved);
  });

  // The marker did not survive the edit to the state it spells, so it is gone rather than held for
  // a return to that state. Measured against Typora 1.14.9, which writes `[x]` here.
  it("writes the default marker for an item moved off its state and back", async () => {
    const mounted = await mountEditor("- [X] Task\n");

    await runEditorCommand(mounted.editor, "format.toggleTaskChecked");
    await runEditorCommand(mounted.editor, "format.toggleTaskChecked");

    expect(mounted.getMarkdown()).toBe("- [x] Task\n");
  });

  // Clicking the checkbox is the same move made through the rendered item rather than a command.
  it("writes the default marker for an item whose checkbox was clicked", async () => {
    const mounted = await mountEditor("- [X] Task\n");

    toggleTaskCheckedAt(mounted.view, getEditorNodePosition(mounted, "list_item"));

    expect(mounted.getMarkdown()).toBe("- [ ] Task\n");

    toggleTaskCheckedAt(mounted.view, getEditorNodePosition(mounted, "list_item"));

    expect(mounted.getMarkdown()).toBe("- [x] Task\n");
  });

  // The marker spells a checkbox, so it belongs to a construct that is gone once the item stops
  // being a task item, and the item made a task item again is one the editor made.
  it("writes the default marker for an item made a task item again", async () => {
    const mounted = await mountEditor("- [X] Task\n");

    await runEditorCommand(mounted.editor, "format.taskList");

    expect(mounted.getMarkdown()).toBe("- Task\n");

    await runEditorCommand(mounted.editor, "format.taskList");
    await runEditorCommand(mounted.editor, "format.toggleTaskChecked");

    expect(mounted.getMarkdown()).toBe("- [x] Task\n");
  });

  it("writes a task item made in the editor with the default marker", async () => {
    const mounted = await mountEditor("Paragraph\n");

    await runEditorCommand(mounted.editor, "format.taskList");

    expect(mounted.getMarkdown()).toBe("* [ ] Paragraph\n");

    await runEditorCommand(mounted.editor, "format.toggleTaskChecked");

    expect(mounted.getMarkdown()).toBe("* [x] Paragraph\n");
  });
});

describe("Link and image title form", () => {
  it.each([
    '[Double quote](garden.md "Garden")',
    "[Single quote](garden.md 'Garden')",
    "[Parentheses](garden.md (Garden))",
    '![Double quote](garden.png "Garden")',
    "![Single quote](garden.png 'Garden')",
    "![Parentheses](garden.png (Garden))",
    // A quote keeps the escape the author wrote rather than moving the title to another form.
    "[Apostrophe](garden.md 'It\\'s')",
    '[Quote](garden.md "He said \\"hi\\"")',
    // A parenthesized title holds either quote bare.
    '[Quote in parentheses](garden.md (He said "hi"))',
    "[Apostrophe in parentheses](garden.md (It's))",
    '[Both quotes in parentheses](garden.md (He said "it\'s"))',
    // The author's own backslash before a quote is not the marker's escape and stays where it is.
    "[Escaped backslash in parentheses](garden.md (a\\\\'b\"c))",
    // Each object answers for its own title while one serializes inside the other.
    "[![Alt](garden.png 'Image')](target.md 'Target')",
  ])("writes the title in %j as it was authored", async (source) => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));

    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // CommonMark reads a parenthesized title between matching parentheses, so a title holding one
  // moves to a quote that carries it bare rather than being escaped back into the authored form.
  it.each([
    {
      saved: '[Close](garden.md "Garden ) here")',
      source: "[Close](garden.md (Garden \\) here))",
    },
    {
      saved: "[Close and quote](garden.md 'He said \"hi\" ) end')",
      source: '[Close and quote](garden.md (He said "hi" \\) end))',
    },
    {
      saved: '![Close](garden.png "Garden ) here")',
      source: "![Close](garden.png (Garden \\) here))",
    },
  ])("writes $saved in a form that holds its title", async ({ saved, source }) => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));

    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${saved}\n`);
  });
});

describe("Reference link and image form", () => {
  const DEFINITION = '[garden report]: /garden "Report"';
  const IMAGE_DEFINITION = '[leaf]: ../assets/leaf.svg "Leaf"';

  it.each([
    `${DEFINITION}\n\n[Full reference][garden report]`,
    `${DEFINITION}\n\n[garden report][]`,
    `${DEFINITION}\n\n[garden report]`,
    // A definition placed after the reference that uses it resolves the same way.
    `[Full reference][garden report]\n\n${DEFINITION}`,
    `${IMAGE_DEFINITION}\n\n![Reference leaf][leaf]`,
    `${IMAGE_DEFINITION}\n\n![leaf][]`,
    `${IMAGE_DEFINITION}\n\n![leaf]`,
    // A definition needs neither a title nor a destination another form would rewrite.
    "[bare]: /bare\n\n[bare]",
    // Each reference keeps the casing and spacing it was written with, though both resolve
    // against the one definition.
    "[Normalized   Report]: /normalized\n\n[normalized report] and [NORMALIZED REPORT]",
    // A reference inside a mark, and a mark inside a reference's label.
    `${DEFINITION}\n\n**[Full reference][garden report]**`,
    `${DEFINITION}\n\n[*Full* reference][garden report]`,
  ])("writes the reference in %j as it was authored", async (source) => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));

    const mounted = await mountEditor(`${source}\n`);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // A definition writes its title through the same option a link and an image do.
  it.each([
    '[quote]: /garden "Report"',
    "[apostrophe]: /garden 'Report'",
    "[parentheses]: /garden (Report)",
    '[quote in parentheses]: /garden (He said "hi")',
  ])("writes the definition title in %j as it was authored", async (definition) => {
    const mounted = await mountEditor(`${definition}\n`);

    expect(mounted.getMarkdown()).toBe(`${definition}\n`);
  });

  // CommonMark reads a parenthesized title between matching parentheses, so a definition title
  // holding one moves to a quote that carries it bare, as a link title already does.
  it("writes a parenthesized definition title holding a parenthesis in a form that holds it", async () => {
    const mounted = await mountEditor("[close]: /garden (Report \\) here)\n");

    expect(mounted.getMarkdown()).toBe('[close]: /garden "Report ) here"\n');
  });

  it("keeps a reference whose definition is missing as literal text", async () => {
    const mounted = await mountEditor("[missing]\n");

    expect(getMarkNames(mounted.view.state.doc)).not.toContain("link");
    expect(mounted.getMarkdown()).toBe("[missing]\n");
  });

  it("resolves a reference to the destination its definition names", async () => {
    const mounted = await mountEditor(`${DEFINITION}\n\n[Full reference][garden report]\n`);
    const anchor = mounted.root.querySelector("a");

    expect(anchor?.getAttribute("href")).toBe("/garden");
    expect(anchor?.getAttribute("title")).toBe("Report");
  });

  // The definition is one block rather than a line to type in, so removing it is a node deletion,
  // and the references it resolved are written as the text they spell.
  it("writes references as literal text once their definition block is deleted", async () => {
    const mounted = await mountEditor(`${DEFINITION}\n\n[Full reference][garden report]\n`);
    const { view } = mounted;

    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)).deleteSelection(),
    );

    expect(mounted.getMarkdown()).toBe("[Full reference][garden report]\n");

    const reopened = await mountEditor(mounted.getMarkdown());

    expect(getMarkNames(reopened.view.state.doc)).not.toContain("link");
  });

  it("renders a definition as the permanent source it is written with", async () => {
    const mounted = await mountEditor(`${DEFINITION}\n`);
    const definition = mounted.root.querySelector('[data-type="definition"]');

    expect(definition?.textContent).toBe(DEFINITION);
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
    // References written back to back are one run, whether they repeat, differ, or name more than
    // one character each.
    "A &copy;&copy; b",
    "A &copy;&reg; b",
    "A &copy;&copy;&copy; b",
    "A &fjlig;&fjlig; b",
    "A &copy;&#169;&#xA9; b",
    // A reference beside the character it names keeps them apart.
    "A &copy;© b",
    "A ©&copy; b",
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

  // A destination carries its authored form on the link and the image, so a reference there is
  // written back rather than resolved into the target it names.
  it.each([
    "[Entity-obfuscated scheme](&#106;avascript&#58;alert&lpar;1&rpar;)",
    "[Destination](folder/f&ouml;&ouml;.md)",
    "[Angle](<f&ouml;&ouml; one.md>)",
    "[Query](a.md?x=1&amp;y=2)",
    "![Image](f&ouml;&ouml;.png)",
  ])("writes the destination in %j as it was authored", async (source) => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));

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

      expect(mounted.getMarkdown()).toBe(`${typed}\n`);
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

  it("leaves the space that follows typed source out of the line it ends", async () => {
    const mounted = await mountEditor("");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "plain tail ");

    expect(mounted.getMarkdown()).toBe("plain tail\n");
  });
});

// A parse drops whitespace closing a line or a cell, so writing it produces a file that reloads as
// a different document. The corpus guard cannot reach this: a file it has opened once no longer
// holds such whitespace, so only an edit puts it there.
describe("Line-final whitespace", () => {
  const editThenReload = async (
    initial: string,
    edit: (mounted: MountedMilkdownEditor) => void,
  ) => {
    const edited = await mountEditor(initial);

    edit(edited);

    const firstSave = edited.getMarkdown();
    const reloaded = await mountEditor(firstSave);

    return {
      firstSave,
      reloadedText: reloaded.view.state.doc.textContent,
      secondSave: reloaded.getMarkdown(),
    };
  };

  const typeAtEnd = (typed: string) => (mounted: MountedMilkdownEditor) => {
    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, typed);
  };

  it.each([
    { expected: "plain\n", initial: "plain", name: "a paragraph", typed: " " },
    {
      expected: "plain tail\n",
      initial: "plain tail",
      name: "a paragraph holding a space",
      typed: " ",
    },
    { expected: "*text*\n", initial: "*text*", name: "emphasis closing a paragraph", typed: " " },
    { expected: "plain\n", initial: "plain", name: "a paragraph, typed twice", typed: "  " },
    { expected: "plain\n", initial: "plain", name: "a paragraph, typed as a tab", typed: "\t" },
    { expected: "# head\n", initial: "# head", name: "a heading", typed: " " },
    { expected: "- item\n", initial: "- item", name: "a list item", typed: " " },
    { expected: "> quote\n", initial: "> quote", name: "a blockquote", typed: " " },
  ])(
    "converges on $name after a space is typed at its end",
    async ({ expected, initial, typed }) => {
      const { firstSave, secondSave } = await editThenReload(initial, typeAtEnd(typed));

      expect(firstSave).toBe(expected);
      expect(secondSave).toBe(firstSave);
    },
  );

  it("converges on a table cell after a space is typed at its end", async () => {
    const { firstSave, secondSave } = await editThenReload(BASIC_TABLE_MARKDOWN, typeAtEnd(" "));

    expect(secondSave).toBe(firstSave);
  });

  it("reloads the paragraph the editor showed before the space was typed", async () => {
    const { reloadedText } = await editThenReload("plain", typeAtEnd(" "));

    expect(reloadedText).toBe("plain");
  });

  it("converges where whitespace ends a line through a deletion rather than a keystroke", async () => {
    const { firstSave, secondSave } = await editThenReload("plain x", (mounted) => {
      const end = mounted.view.state.doc.content.size - 1;

      mounted.view.dispatch(mounted.view.state.tr.delete(end - 1, end));
    });

    expect(firstSave).toBe("plain\n");
    expect(secondSave).toBe(firstSave);
  });

  it("keeps a space that later text on the same line follows", async () => {
    const { firstSave, secondSave } = await editThenReload("plain", (mounted) => {
      setTextSelection(mounted.view, 6);
      typeText(mounted.view, " tail");
    });

    expect(firstSave).toBe("plain tail\n");
    expect(secondSave).toBe(firstSave);
  });

  it("keeps a space a hard break follows", async () => {
    const { firstSave, secondSave } = await editThenReload("a\\\nb\n", (mounted) => {
      setTextSelection(mounted.view, 2);
      typeText(mounted.view, " ");
    });

    expect(firstSave).toBe("a \\\nb\n");
    expect(secondSave).toBe(firstSave);
  });

  it("keeps whitespace inside fenced code, which no parse trims", async () => {
    const { firstSave, secondSave } = await editThenReload("```\ncode\n```", typeAtEnd(" "));

    expect(firstSave).toBe("```\ncode \n```\n");
    expect(secondSave).toBe(firstSave);
  });

  // A character CommonMark does not trim is content the line carries, so it reaches the file even
  // where it sits against the line ending. `TRAILING_WHITESPACE_PATTERN` decides both what is left
  // out and what `state.safe` never sees, which is why these are asserted through the escape it
  // would otherwise have skipped rather than through the saved character alone.
  const NO_BREAK_SPACE = "\u00a0";
  const EM_SPACE = "\u2003";
  const IDEOGRAPHIC_SPACE = "\u3000";

  const openThenReload = async (initial: string) => {
    const opened = await mountEditor(initial);
    const firstSave = opened.getMarkdown();
    const reloaded = await mountEditor(firstSave);

    return {
      firstSave,
      reloadedText: reloaded.view.state.doc.textContent,
      secondSave: reloaded.getMarkdown(),
    };
  };

  it.each([
    {
      expected: `plain${NO_BREAK_SPACE}\n`,
      initial: `plain${NO_BREAK_SPACE}`,
      name: "a paragraph",
    },
    {
      expected: `# head${NO_BREAK_SPACE}\n`,
      initial: `# head${NO_BREAK_SPACE}`,
      name: "a heading",
    },
    {
      expected: `- item${NO_BREAK_SPACE}\n`,
      initial: `- item${NO_BREAK_SPACE}`,
      name: "a list item",
    },
    {
      expected: `> quote${NO_BREAK_SPACE}\n`,
      initial: `> quote${NO_BREAK_SPACE}`,
      name: "a blockquote",
    },
  ])("keeps a no-break space ending $name", async ({ expected, initial }) => {
    const { firstSave, secondSave } = await openThenReload(initial);

    expect(firstSave).toBe(expected);
    expect(secondSave).toBe(firstSave);
  });

  it.each([
    { character: EM_SPACE, name: "an em space" },
    { character: IDEOGRAPHIC_SPACE, name: "an ideographic space" },
  ])("keeps $name ending a paragraph", async ({ character }) => {
    const { firstSave, secondSave } = await openThenReload(`plain${character}`);

    expect(firstSave).toBe(`plain${character}\n`);
    expect(secondSave).toBe(firstSave);
  });

  it("keeps a no-break space ending a table cell", async () => {
    const { firstSave, secondSave } = await openThenReload(
      `| A | B |\n| - | - |\n| C${NO_BREAK_SPACE} | D |`,
    );

    expect(firstSave).toContain(`C${NO_BREAK_SPACE}`);
    expect(secondSave).toBe(firstSave);
  });

  it("reloads the paragraph holding the character the file kept", async () => {
    const { reloadedText } = await openThenReload(`plain${NO_BREAK_SPACE}`);

    expect(reloadedText).toBe(`plain${NO_BREAK_SPACE}`);
  });

  // The two classes meet here: the space is what a parse trims and goes, the character beside it
  // is not and stays, whichever order the line puts them in.
  it.each([
    {
      expected: `plain ${NO_BREAK_SPACE}\n`,
      initial: `plain ${NO_BREAK_SPACE}`,
      name: "a space the character follows",
    },
    {
      expected: `plain${NO_BREAK_SPACE}\n`,
      initial: `plain${NO_BREAK_SPACE} `,
      name: "a space following the character",
    },
    {
      expected: `plain${NO_BREAK_SPACE}\n`,
      initial: `plain${NO_BREAK_SPACE}\t`,
      name: "a tab following the character",
    },
  ])("keeps a line ending in $name", async ({ expected, initial }) => {
    const { firstSave, secondSave } = await openThenReload(initial);

    expect(firstSave).toBe(expected);
    expect(secondSave).toBe(firstSave);
  });

  // `state.safe` sees the character now that it is no longer split off the value, so the escapes
  // it decides read the real line rather than one ending where the character starts.
  it("leaves a backslash the character separates from the line ending bare", async () => {
    const { firstSave, secondSave } = await openThenReload(`a\\${NO_BREAK_SPACE}`);

    expect(firstSave).toBe(`a\\${NO_BREAK_SPACE}\n`);
    expect(secondSave).toBe(firstSave);
  });

  it("keeps a bare autolink bare before the character", async () => {
    const { firstSave, secondSave } = await openThenReload(`https://example.com${NO_BREAK_SPACE}`);

    expect(firstSave).toBe(`https://example.com${NO_BREAK_SPACE}\n`);
    expect(secondSave).toBe(firstSave);
  });
});

// A parse trims what a line opens with just as it trims what a line closes with, so writing
// that whitespace produces a file the next open reads as a different document. The corpus guard
// cannot reach this either: only an edit, or a character reference an author wrote, puts it
// there.
describe("Line-initial whitespace", () => {
  const saveReloadSave = async (
    initial: string,
    edit?: (mounted: MountedMilkdownEditor) => void,
  ) => {
    const edited = await mountEditor(initial);

    edit?.(edited);

    const firstSave = edited.getMarkdown();
    const reloaded = await mountEditor(firstSave);

    return {
      firstSave,
      reloadedText: reloaded.view.state.doc.textContent,
      secondSave: reloaded.getMarkdown(),
    };
  };

  const typeBefore = (anchor: string, typed: string) => (mounted: MountedMilkdownEditor) => {
    setTextSelection(mounted.view, getEditorTextPosition(mounted, anchor));
    typeText(mounted.view, typed);
  };

  it.each([
    { anchor: "plain", expected: "plain\n", initial: "plain", name: "a paragraph", typed: " " },
    {
      anchor: "plain",
      expected: "plain\n",
      initial: "plain",
      name: "a paragraph, typed twice",
      typed: "  ",
    },
    {
      anchor: "plain",
      expected: "plain\n",
      initial: "plain",
      name: "a paragraph, typed as a tab",
      typed: "\t",
    },
    { anchor: "head", expected: "# head\n", initial: "# head", name: "a heading", typed: " " },
    { anchor: "item", expected: "- item\n", initial: "- item", name: "a list item", typed: " " },
    {
      anchor: "quote",
      expected: "> quote\n",
      initial: "> quote",
      name: "a blockquote",
      typed: " ",
    },
    {
      anchor: "two",
      expected: "one\n\ntwo\n",
      initial: "one\n\ntwo",
      name: "a later paragraph",
      typed: " ",
    },
    {
      anchor: "text",
      expected: "*text*\n",
      initial: "*text*",
      name: "emphasis opening a paragraph",
      typed: " ",
    },
  ])(
    "converges on $name after a space is typed at its start",
    async ({ anchor, expected, initial, typed }) => {
      const { firstSave, secondSave } = await saveReloadSave(initial, typeBefore(anchor, typed));

      expect(firstSave).toBe(expected);
      expect(secondSave).toBe(firstSave);
    },
  );

  it("converges on a table cell after a space is typed at its start", async () => {
    const { firstSave, secondSave } = await saveReloadSave(
      BASIC_TABLE_MARKDOWN,
      typeBefore("C", " "),
    );

    expect(firstSave).toBe(`${BASIC_TABLE_MARKDOWN}\n`);
    expect(secondSave).toBe(firstSave);
  });

  it("converges where whitespace opens the line a hard break left behind", async () => {
    const { firstSave, secondSave } = await saveReloadSave("a\\\nb", typeBefore("b", " "));

    expect(firstSave).toBe("a\\\nb\n");
    expect(secondSave).toBe(firstSave);
  });

  it.each([
    { expected: "plain\n", initial: "&#x20;plain", name: "a paragraph" },
    { expected: "# head\n", initial: "# &#x20;head", name: "a heading" },
  ])(
    "converges on $name a character reference opens with a space",
    async ({ expected, initial }) => {
      const { firstSave, secondSave } = await saveReloadSave(initial);

      expect(firstSave).toBe(expected);
      expect(secondSave).toBe(firstSave);
    },
  );

  it("reloads the paragraph the editor showed before the space was typed", async () => {
    const { reloadedText } = await saveReloadSave("plain", typeBefore("plain", " "));

    expect(reloadedText).toBe("plain");
  });

  it("reloads the paragraph without the space its character reference named", async () => {
    const { reloadedText } = await saveReloadSave("&#x20;plain");

    expect(reloadedText).toBe("plain");
  });

  it.each([
    {
      expected: "a b\n",
      initial: "a&#x20;b",
      name: "a character reference away from a line edge",
    },
    { expected: "&nbsp;plain\n", initial: "&nbsp;plain", name: "a no-break space" },
    {
      expected: "&#x9;plain\n",
      initial: "&#x9;plain",
      name: "a tab a character reference names",
    },
    {
      expected: "*text* tail\n",
      initial: "*text* tail",
      name: "a space a construct on the same line precedes",
    },
  ])("keeps $name", async ({ expected, initial }) => {
    const { firstSave, secondSave } = await saveReloadSave(initial);

    expect(firstSave).toBe(expected);
    expect(secondSave).toBe(firstSave);
  });

  it("keeps whitespace inside fenced code, which no parse trims", async () => {
    const { firstSave, secondSave } = await saveReloadSave(
      "```\ncode\n```",
      typeBefore("code", " "),
    );

    expect(firstSave).toBe("```\n code\n```\n");
    expect(secondSave).toBe(firstSave);
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
    { expected: "- item ~~text~~", initial: "- item", name: "a list item" },
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
