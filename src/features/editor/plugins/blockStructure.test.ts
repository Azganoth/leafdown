import type { MarkdownNode } from "@milkdown/kit/transformer";
import { describe, expect, it } from "vitest";

import { restoreBlockStructure } from "./blockStructure";

const positioned = (type: string, startLine: number, endLine = startLine): MarkdownNode => ({
  type,
  position: {
    start: { line: startLine, column: 1 },
    end: { line: endLine, column: 1 },
  },
});

const container = (type: string, children: MarkdownNode[]): MarkdownNode => ({ type, children });

const childTypes = (node: MarkdownNode) => node.children?.map((child) => child.type);

describe("restoreBlockStructure", () => {
  it.each([
    { blankLines: 1, nextLine: 3, restored: 0 },
    { blankLines: 2, nextLine: 4, restored: 0 },
    { blankLines: 3, nextLine: 5, restored: 1 },
    { blankLines: 5, nextLine: 7, restored: 2 },
    { blankLines: 7, nextLine: 9, restored: 3 },
  ])(
    "restores $restored empty paragraphs from $blankLines blank lines",
    ({ nextLine, restored }) => {
      const tree = container("root", [
        positioned("paragraph", 1),
        positioned("paragraph", nextLine),
      ]);

      restoreBlockStructure(tree);

      expect(tree.children).toHaveLength(restored + 2);
      expect(
        tree.children?.slice(1, restored + 1).every((child) => child.type === "paragraph"),
      ).toBe(true);
      expect(
        tree.children?.slice(1, restored + 1).every((child) => child.children?.length === 0),
      ).toBe(true);
    },
  );

  it("restores empty paragraphs inside nested block containers", () => {
    const tree = container("root", [
      container("blockquote", [positioned("paragraph", 1), positioned("paragraph", 5)]),
    ]);

    restoreBlockStructure(tree);

    expect(childTypes(tree.children![0])).toEqual(["paragraph", "paragraph", "paragraph"]);
  });

  it("leaves children alone when a container reports no positions", () => {
    const tree = container("root", [{ type: "paragraph" }, { type: "paragraph" }]);

    restoreBlockStructure(tree);

    expect(tree.children).toHaveLength(2);
  });

  it("ignores gaps between children of containers that hold no block content", () => {
    const tree = container("root", [
      container("list", [positioned("listItem", 1), positioned("listItem", 5)]),
    ]);

    restoreBlockStructure(tree);

    expect(childTypes(tree.children![0])).toEqual(["listItem", "listItem"]);
  });

  it("wraps raw HTML in a paragraph inside a footnote definition", () => {
    const html = { type: "html", value: "<div>x</div>" };
    const tree = container("root", [container("footnoteDefinition", [html])]);

    restoreBlockStructure(tree);

    const definition = tree.children![0];

    expect(childTypes(definition)).toEqual(["paragraph"]);
    expect(definition.children![0].children).toEqual([html]);
  });

  it("leaves raw HTML alone where the preset already wraps it", () => {
    const html = { type: "html", value: "<div>x</div>" };
    const tree = container("root", [html]);

    restoreBlockStructure(tree);

    expect(tree.children).toEqual([html]);
  });

  it("accepts a container with no children", () => {
    const tree = container("root", []);

    expect(() => restoreBlockStructure(tree)).not.toThrow();
  });

  it.each([
    { adjacent: true, nextLine: 2, separator: "no blank line" },
    { adjacent: false, nextLine: 3, separator: "one blank line" },
    { adjacent: false, nextLine: 5, separator: "a blank-line run" },
  ])("records $separator between two blocks as adjacent=$adjacent", ({ adjacent, nextLine }) => {
    const tree = container("root", [positioned("paragraph", 1), positioned("heading", nextLine)]);

    restoreBlockStructure(tree);

    const heading = tree.children?.at(-1);

    expect(heading?.type).toBe("heading");
    expect(Object.hasOwn(heading!, "adjacent")).toBe(adjacent);
  });

  it("records adjacency from the line a block ends on rather than the line it opens", () => {
    const tree = container("root", [positioned("heading", 1, 2), positioned("paragraph", 3)]);

    restoreBlockStructure(tree);

    expect(tree.children![1]).toMatchObject({ adjacent: true });
  });

  it("records adjacency inside nested block containers", () => {
    const tree = container("root", [
      container("blockquote", [positioned("paragraph", 1), positioned("heading", 2)]),
    ]);

    restoreBlockStructure(tree);

    expect(tree.children![0].children![1]).toMatchObject({ adjacent: true });
  });

  it("leaves the first block of a container with no separator to record", () => {
    const tree = container("root", [positioned("paragraph", 1), positioned("heading", 2)]);

    restoreBlockStructure(tree);

    expect(tree.children![0]).not.toHaveProperty("adjacent");
  });

  it("records adjacency on the paragraph filled in around raw HTML", () => {
    const tree = container("root", [
      container("footnoteDefinition", [
        positioned("paragraph", 1),
        { ...positioned("html", 2), value: "<div>x</div>" },
      ]),
    ]);

    restoreBlockStructure(tree);

    const wrapper = tree.children![0].children![1];

    expect(wrapper).toMatchObject({ type: "paragraph", adjacent: true });
    expect(wrapper.children![0]).not.toHaveProperty("adjacent");
  });

  it("records no adjacency where the parser gave a block no position", () => {
    const tree = container("root", [{ type: "paragraph" }, positioned("heading", 2)]);

    restoreBlockStructure(tree);

    expect(tree.children![1]).not.toHaveProperty("adjacent");
  });
});
