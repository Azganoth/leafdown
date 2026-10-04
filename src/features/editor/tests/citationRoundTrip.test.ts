// @vitest-environment happy-dom

import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { describe, expect, it } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());
const raw = String.raw;

const readCitations = (document: ProseMirrorNode) => {
  const citations: string[] = [];
  document.descendants((node) => {
    if (node.type.name === "citation") citations.push(node.attrs.value as string);
  });
  return citations;
};

const findCitation = (document: ProseMirrorNode) => {
  let found: { node: ProseMirrorNode; position: number } | undefined;
  document.descendants((node, position) => {
    if (!found && node.type.name === "citation") found = { node, position };
  });
  return found!;
};

const groups = [
  "[@doe2026]",
  "[@doe2026, pp. 4-6]",
  "[-@roe2024; @smith2025]",
  "[see @doe99, pp. 33-35 and *passim*; @smith04, chap. 1]",
  "[*see* @doe99; **also** -@roe, `p. 3`; @smith, ~~ch. 2~~]",
  "[@{Foo_bar.baz.}]",
  "[@{https://example.com/bib?name=foobar&date=2000}, p. 33]",
  "[@key{ii, A}, suffix]",
  "[@key, {pp. iv, vi} suffix]",
  "[@key{}, 99 years later]",
  "[@ünï_cødé; @2026report; @a:b.c-d]",
  "[ @doe ;  @roe ]",
  "[see\n@doe, pp. 1-2;\n  @roe]",
  "[@doe, \\[sic\\] p. 3]",
];

describe("citation source round trip", () => {
  it.each(groups)("reads %s as one citation and writes it back", async (group) => {
    const markdown = `Before ${group} after.\n`;
    const first = await mountEditor(markdown);
    expect(readCitations(first.view.state.doc)).toEqual([group]);
    const saved = first.getMarkdown();
    expect(saved).toBe(markdown);
    const reopened = await mountEditor(saved);
    expect(reopened.getMarkdown()).toBe(markdown);
    expect(reopened.view.state.doc.toJSON()).toEqual(first.view.state.doc.toJSON());
  });

  it("reads a citation regardless of bibliography metadata", async () => {
    const markdown = "---\nbibliography: refs.bib\ncsl: style.csl\n---\n\nText [@missing].\n";
    const mounted = await mountEditor(markdown);
    expect(readCitations(mounted.view.state.doc)).toEqual(["[@missing]"]);
    expect(mounted.getMarkdown()).toBe(markdown);
  });

  it.each([
    "# Title [@doe]\n",
    "Title [@doe]\n===\n",
    "- item [see @doe,\n  p. 3] tail\n",
    "> quote [see @doe,\n> p. 3] tail\n",
    "1. item\n\n   > [@doe;\n   > @roe]\n",
    "Text[^1]\n\n[^1]: Note [@doe].\n",
    "| a | b |\n| - | - |\n| [@doe] | c |\n",
    "*see [@doe] here* and **[@roe]**\n",
    "Term\n: Description [@doe]\n",
    "[link](https://example.com) [@doe] [^1]\n\n[^1]: Note.\n",
  ])("keeps a citation in its container: %s", async (markdown) => {
    const first = await mountEditor(markdown);
    expect(readCitations(first.view.state.doc).length).toBeGreaterThan(0);
    const saved = first.getMarkdown();
    const reopened = await mountEditor(saved);
    expect(reopened.view.state.doc.toJSON()).toEqual(first.view.state.doc.toJSON());
    expect(reopened.getMarkdown()).toBe(saved);
  });

  it("keeps a multiline group's indentation across repeated saves", async () => {
    const markdown = "- item [see\n    @doe,\n  p. 3]\n";
    let current = markdown;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const mounted = await mountEditor(current);
      expect(readCitations(mounted.view.state.doc)).toHaveLength(1);
      current = mounted.getMarkdown();
      expect(current).toBe(markdown);
    }
  });

  it.each([
    "[@doe](https://example.com)",
    "[see @doe](<a b> 'title')",
    "[@doe][ref]\n\n[ref]: https://example.com",
    "[@doe][]\n\n[@doe]: https://example.com",
    "[@doe]\n\n[@doe]: https://example.com",
    "![@doe](image.png)",
    "![@doe]",
    "[x [@doe]](https://example.com)",
    "[^doe]\n\n[^doe]: Note.",
    "[[@doe]]",
    "[[page]] and [[page|@doe]]",
    "`[@doe]`",
    "```\n[@doe]\n```",
    "    [@doe]",
    '<span title="[@doe]">x</span>',
    "<div>\n[@doe]\n</div>",
    "---\ncite: [@doe]\n---\n\nText",
    raw`[\@doe]`,
    raw`\[@doe]`,
    raw`[-\@doe]`,
    "Mail [me@example.com] or @doe or me@example.com",
    "[see the appendix] and [ ] and []",
    "[@doe",
    "[@doe;]",
    "[@{}]",
    "[@{doe]",
    "[@doe, *p. 3]",
    "[@doe, $x$]",
    "[@doe, <b>p</b>]",
    "[see `a]` @doe]",
  ])("keeps %s as ordinary Markdown", async (source) => {
    const mounted = await mountEditor(`${source}\n`);
    expect(readCitations(mounted.view.state.doc)).toEqual([]);
    const reopened = await mountEditor(mounted.getMarkdown());
    expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  });

  it.each([
    "> [see @doe,  \n> p. 3]\n",
    "- [see @doe,\\\n  p. 3]\n",
    "> [see the note  \n> p. 3](./doc.md)\n",
    "> [see the\n> appendix] and a break  \n> here\n",
    "- [see the\n  appendix](./doc.md) and a break\\\n  here\n",
    "> [see [the] @doe,\n> p. 3]\n",
  ])("keeps ordinary brackets and the breaks after them as written: %s", async (markdown) => {
    const mounted = await mountEditor(markdown);
    expect(readCitations(mounted.view.state.doc)).toEqual([]);
    expect(mounted.getMarkdown()).toBe(markdown);
  });

  it.each([
    [raw`[\@doe]`, raw`[\@doe]`],
    [raw`\[@doe]`, raw`[\@doe]`],
    [raw`[-\@doe; @roe]`, raw`[-\@doe; @roe]`],
    [raw`[see \@doe]`, raw`[see \@doe]`],
    [raw`[*see* \@doe]`, raw`[*see* \@doe]`],
  ])(
    "writes literal group text %s with the escape that keeps it literal",
    async (source, saved) => {
      const mounted = await mountEditor(`${source}\n`);
      expect(mounted.getMarkdown()).toBe(`${saved}\n`);
    },
  );

  it("keeps literal group text before a footnote reference literal", async () => {
    const mounted = await mountEditor(raw`[\@doe][^1]` + "\n\n[^1]: Note.\n");
    const reopened = await mountEditor(mounted.getMarkdown());
    expect(readCitations(reopened.view.state.doc)).toEqual([]);
    expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
  });

  it.each([
    raw`| a       |` + "\n| ------- |\n" + raw`| [\@doe] |` + "\n",
    "Mail me@example.com\n===================\n",
    raw`Title [\@doe]` + "\n=============\n",
  ])("keeps a literal group or address in a measured block: %s", async (markdown) => {
    const mounted = await mountEditor(markdown);
    expect(readCitations(mounted.view.state.doc)).toEqual([]);
    expect(mounted.getMarkdown()).toBe(markdown);
  });

  it.each([
    ["[@roe]", raw`[\@roe]`],
    ["(https://example.com)", raw`\(https://example.com)`],
    ["[ref]", raw`\[ref]`],
    ["!", raw`\!`],
  ])("keeps the citation when %s is written against it", async (text, written) => {
    const markdown = "a [@doe] b\n\n[ref]: https://example.com\n";
    const mounted = await mountEditor(markdown);
    const { node, position } = findCitation(mounted.view.state.doc);
    const at = text === "!" ? position : position + node.nodeSize;
    mounted.view.dispatch(mounted.view.state.tr.insertText(text, at));
    const saved = mounted.getMarkdown();
    expect(saved).toContain(text === "!" ? `${written}[@doe]` : `[@doe]${written}`);
    const reopened = await mountEditor(saved);
    expect(readCitations(reopened.view.state.doc)).toEqual(["[@doe]"]);
  });

  it("does not reconstruct a citation from literal text", async () => {
    const mounted = await mountEditor("Text.\n");
    mounted.view.dispatch(mounted.view.state.tr.insertText(" [see @doe, p. 3]", 6));
    const saved = mounted.getMarkdown();
    expect(saved).toBe(raw`Text. [see \@doe, p. 3]` + "\n");
    const reopened = await mountEditor(saved);
    expect(readCitations(reopened.view.state.doc)).toEqual([]);
  });
});
