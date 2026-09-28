// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());
const raw = String.raw;

const mathSources = [
  raw`$\{x\}$`,
  raw`$a\,b$`,
  raw`$a \\ b$`,
  raw`$50\%$`,
  raw`$a*b$ and $c_d$`,
  "$$\n  a\n    b\n$$",
  "Text $a +\n  b +\n    c$ end",
  "a $x  \ny$ b",
  raw`$\begin{aligned}a &= b \\ c &= d\end{aligned}$`,
  raw`a $` + "`a$b`" + raw`$ c`,
];

const containers = [
  "# Title $x^2$\n",
  "Title $x$\n===\n",
  "- item $x$\n",
  "> $x$\n",
  "Text[^1]\n\n[^1]: $x$\n",
  "[$x$](https://example.com)\n",
  "[*see* $x$](https://example.com)\n",
  "*see $x$ here*\n",
  "- item\n\n  $$\n  a\n  $$\n",
  "> $$\n> x^2\n> $$\n",
];

const literalSources = [
  "Cost $5 and $10, or $20,000 and $30,000.\n",
  "US$5 and $5-$10 stay text.\n",
  raw`\$x *y* z$` + "\n",
  "`$x$` and <span>$</span> and $$$x$$$ and $x$$y$\n",
];

describe("math source round trip", () => {
  it.each(mathSources)("keeps authored math source: %s", async (source) => {
    const markdown = `${source}\n`;
    const first = await mountEditor(markdown);
    const saved = first.getMarkdown();
    expect(saved).toBe(markdown);
    const reopened = await mountEditor(saved);
    expect(reopened.getMarkdown()).toBe(markdown);
    expect(reopened.view.state.doc.toJSON()).toEqual(first.view.state.doc.toJSON());
  });

  it.each(containers)("keeps math in its container: %s", async (markdown) => {
    const first = await mountEditor(markdown);
    expect(first.getMarkdown()).toBe(markdown);
    const reopened = await mountEditor(first.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(first.view.state.doc.toJSON());
  });

  it.each(literalSources)("keeps literal dollars literal: %s", async (markdown) => {
    const first = await mountEditor(markdown);
    expect(first.getMarkdown()).toBe(markdown);
    const reopened = await mountEditor(first.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(first.view.state.doc.toJSON());
  });

  it("keeps only the dollar escapes required to prevent math", async () => {
    const first = await mountEditor(raw`\$x\$ and \$y$` + "\n");
    expect(first.getMarkdown()).toBe(raw`\$x$ and \$y$` + "\n");
    const reopened = await mountEditor(first.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(first.view.state.doc.toJSON());
  });

  it("drops a dollar escape when its only apparent closer is inside a code span", async () => {
    const first = await mountEditor(raw`\$x ` + "`$y`\n");
    expect(first.getMarkdown()).toBe(raw`$x ` + "`$y`\n");
    const reopened = await mountEditor(first.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(first.view.state.doc.toJSON());
  });

  it("keeps an escaped dollar in a table cell", async () => {
    const markdown = "| a | b |\n| - | - |\n| \\$x$ | $y$ |\n";
    const first = await mountEditor(markdown);
    expect(first.getMarkdown()).toContain("| \\$x$ | $y$ |\n");
    const reopened = await mountEditor(first.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(first.view.state.doc.toJSON());
  });

  it("keeps an escaped pipe inside math in a table cell", async () => {
    const markdown = raw`| a | b |
| - | - |
| $x\|y$ | $z$ |
`;
    const first = await mountEditor(markdown);
    expect(first.getMarkdown()).toContain(raw`| $x\|y$ | $z$ |`);
    const reopened = await mountEditor(first.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(first.view.state.doc.toJSON());
  });

  it("keeps the document line ending inside math", async () => {
    const markdown = "a $x$ b\r\n\r\n$$\r\n  y\r\n$$\r\n";
    const first = await mountEditor(markdown);
    expect(first.getMarkdown()).toBe("a $x$ b\n\n$$\r\n  y\r\n$$\n");
    const reopened = await mountEditor(first.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(first.view.state.doc.toJSON());
  });

  it.each([
    ["$x$", ["$x$"]],
    ["$$ x $$", ["$$ x $$"]],
    ["$a*b*c$", ["$a*b*c$"]],
    ["$`a$b`$", ["$`a$b`$"]],
    ["`$x$`", []],
    ["<span>$</span>", []],
    ["$5 and $10", []],
    ["$20,000 and $30,000", []],
    ["US$5", []],
    ["$5-$10", []],
    ["$$$x$$$", []],
    ["$x$$y$", []],
    [raw`\(x\)`, []],
  ] as const)("recognizes only the selected grammar in %s", async (source, expected) => {
    const mounted = await mountEditor(`${source}\n`);
    const math: string[] = [];
    mounted.view.state.doc.descendants((node) => {
      if (node.type.name === "math_inline") math.push(node.attrs.value as string);
    });
    expect(math).toEqual(expected);
  });
});
