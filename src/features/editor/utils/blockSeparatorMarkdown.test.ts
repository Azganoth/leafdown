import { describe, expect, it } from "vitest";

import {
  BLOCK_ADJACENT_ATTRIBUTE_NAME,
  joinsPrecedingBlock,
  readBlockAdjacent,
  resolveBlockSeparators,
} from "./blockSeparatorMarkdown";

interface TestNode {
  type: string;
  title?: string | null;
  children?: TestNode[];
}

const node = (type: string, children?: TestNode[]): TestNode => ({ type, children });

const paragraph = node("paragraph", [node("text")]);

const htmlBlock = node("paragraph", [node("html")]);

// The pair as the serializer hands it over: the block, the parent holding both, and the text the
// handler just wrote for it.
const joins = (previous: TestNode, block: TestNode, value: string) =>
  joinsPrecedingBlock(block, node("root", [previous, block]), value);

describe("readBlockAdjacent", () => {
  it.each([
    { adjacent: true, source: { adjacent: true } },
    { adjacent: false, source: { adjacent: false } },
    { adjacent: false, source: { adjacent: "true" } },
    { adjacent: false, source: {} },
  ])("reads $source as $adjacent", ({ adjacent, source }) => {
    expect(readBlockAdjacent(source)).toBe(adjacent);
  });

  it("names the attribute the schemas carry", () => {
    expect(readBlockAdjacent({ [BLOCK_ADJACENT_ATTRIBUTE_NAME]: true })).toBe(true);
  });
});

describe("joinsPrecedingBlock", () => {
  it("keeps the separator for the first block of a container", () => {
    const block = node("heading");

    expect(joinsPrecedingBlock(block, node("root", [block]), "# Heading")).toBe(false);
  });

  it("keeps the separator where the block has no parent to be measured against", () => {
    expect(joinsPrecedingBlock(node("heading"), undefined, "# Heading")).toBe(false);
  });

  describe("after a block a plain line continues", () => {
    it.each([
      { line: "# Heading", name: "an ATX heading" },
      { line: "###### Six", name: "a level six heading" },
      { line: "***", name: "an asterisk thematic break" },
      { line: "___", name: "an underscore thematic break" },
      { line: "- - -", name: "a spaced hyphen thematic break" },
      { line: "```js", name: "an opening fence" },
      { line: "~~~", name: "a tilde fence" },
      { line: "> quoted", name: "a blockquote" },
      { line: "- item", name: "a bullet item holding content" },
      { line: "1. item", name: "an ordered item starting at one" },
      { line: "1) item", name: "a parenthesised ordered item" },
      { line: "[^a]: note", name: "a footnote definition" },
      { line: '<section class="garden">', name: "a block HTML tag" },
      { line: "<!-- comment", name: "an HTML comment" },
    ])("drops the separator before $name", ({ line }) => {
      expect(joins(paragraph, node("heading"), line)).toBe(true);
    });

    it.each([
      { line: "Plain text", name: "a paragraph" },
      { line: "Setext\n======", name: "a setext heading" },
      { line: "---", name: "a run of hyphens, which underlines the paragraph instead" },
      { line: "-", name: "an item whose content opens below its marker" },
      { line: "**", name: "a run too short to break" },
      { line: "2. item", name: "an ordered list starting past one" },
      { line: "[a]: /one", name: "a reference definition" },
      { line: "``` info`with-backtick", name: "a fence whose info string holds a backtick" },
      { line: "<custom-tag>", name: "an HTML tag that opens no block" },
      { line: "#Heading", name: "a hash run with no space after it" },
      { line: "-item", name: "a bullet with no space after it" },
    ])("keeps the separator before $name", ({ line }) => {
      expect(joins(paragraph, node("heading"), line)).toBe(false);
    });

    it.each(["blockquote", "list", "listItem", "footnoteDefinition"])(
      "reads the block a %s ends with rather than the container",
      (type) => {
        expect(joins(node(type, [paragraph]), node("heading"), "Plain text")).toBe(false);
        expect(joins(node(type, [node("heading")]), node("paragraph"), "Plain text")).toBe(true);
      },
    );

    it("treats a table as a block a plain line extends", () => {
      expect(joins(node("table"), node("paragraph"), "Plain text")).toBe(false);
      expect(joins(node("table"), node("blockquote"), "> quote")).toBe(true);
    });

    it("drops the separator before a table, which writes its own delimiter row", () => {
      expect(joins(paragraph, node("table"), "| a | b |\n| - | - |")).toBe(true);
    });

    it("reads a container ending with nothing as one a plain line continues", () => {
      expect(joins(node("blockquote", []), node("paragraph"), "Plain text")).toBe(false);
      expect(joins(node("blockquote", []), node("heading"), "# Heading")).toBe(true);
    });
  });

  describe("after a block that closes on its own line", () => {
    it.each(["heading", "thematicBreak", "code"])("drops the separator after a %s", (type) => {
      expect(joins(node(type), node("paragraph"), "Plain text")).toBe(true);
    });
  });

  describe("after a raw HTML block", () => {
    it("keeps the separator, which is what ends the block", () => {
      expect(joins(htmlBlock, node("heading"), "# Heading")).toBe(false);
    });

    it("reads a paragraph holding HTML beside its own text as ordinary text", () => {
      const mixed = node("paragraph", [node("text"), node("html")]);

      expect(joins(mixed, node("heading"), "# Heading")).toBe(true);
    });
  });

  describe("after a definition", () => {
    it.each([
      { line: '"Title"', opener: "a double quote" },
      { line: "'Title'", opener: "a single quote" },
      { line: "(Title)", opener: "a parenthesis" },
    ])("keeps the separator before $opener, which the definition would take", ({ line }) => {
      expect(joins(node("definition"), node("paragraph"), line)).toBe(false);
    });

    it("drops the separator where the definition already holds a title", () => {
      const titled: TestNode = { type: "definition", title: "Title" };

      expect(joins(titled, node("paragraph"), '"Not a title"')).toBe(true);
    });

    it.each([
      { line: "[b]: /two", name: "another definition" },
      { line: "# Heading", name: "a heading" },
      { line: "Plain text", name: "a paragraph" },
    ])("drops the separator before $name", ({ line }) => {
      expect(joins(node("definition"), node("paragraph"), line)).toBe(true);
    });
  });
});

describe("resolveBlockSeparators", () => {
  // The marker the handlers write, spelled here as the serializer spells it.
  const marked = (text: string) => text.replaceAll("@", "\u0000j");

  it("leaves a document holding no marker alone", () => {
    expect(resolveBlockSeparators("First.\n\nSecond.\n")).toBe("First.\n\nSecond.\n");
  });

  it("takes out the blank line before a marked block", () => {
    expect(resolveBlockSeparators(marked("A paragraph.\n\n@# Heading\n"))).toBe(
      "A paragraph.\n# Heading\n",
    );
  });

  it("takes out the blank line a blockquote writes as its own marker", () => {
    expect(resolveBlockSeparators(marked("> Quoted.\n>\n> @# Heading\n"))).toBe(
      "> Quoted.\n> # Heading\n",
    );
  });

  it("takes out the blank line inside an indented list item", () => {
    expect(resolveBlockSeparators(marked("- Item.\n\n  @# Heading\n"))).toBe(
      "- Item.\n  # Heading\n",
    );
  });

  it("drops a marker where the blocks already stand on consecutive lines", () => {
    expect(resolveBlockSeparators(marked("- Item.\n  @# Heading\n"))).toBe(
      "- Item.\n  # Heading\n",
    );
  });

  it("drops a marker opening the document, which separates nothing", () => {
    expect(resolveBlockSeparators(marked("@# Heading\n"))).toBe("# Heading\n");
  });

  it("resolves every marker in a document", () => {
    expect(resolveBlockSeparators(marked("# One\n\n@## Two\n\n@### Three\n"))).toBe(
      "# One\n## Two\n### Three\n",
    );
  });

  it("takes out the blank line between a blockquote and the block after it", () => {
    expect(resolveBlockSeparators(marked("> Quoted.\n\n@# Heading\n"))).toBe(
      "> Quoted.\n# Heading\n",
    );
  });
});
