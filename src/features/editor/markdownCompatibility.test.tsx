import { afterEach, describe, expect, it } from "vitest";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown);
  mountedEditors.push(mounted);
  return mounted;
};

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

| A | B |
| - | - |
| 1 | 2 |

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

| A | B |
| - | - |
| 1 | 2 |

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
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("parses and serializes the documented CommonMark and GFM fixture", async () => {
    const mounted = await mountEditor(supportedMarkdown);

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
    expect(dom.querySelector("img[alt='Alt']")).toBeInTheDocument();
    expect(dom.querySelector("table")).toHaveTextContent("1");
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
});
