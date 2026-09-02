// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { type MountedMilkdownEditor, setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorTextPosition, setTextSelection, typeText } from "@/test/utils/prosemirror";

const mountEditor = setupMilkdownEditorMount();

const TAIL = "\n\ntail";

const describeDocument = (mounted: MountedMilkdownEditor) => {
  const parts: string[] = [];

  mounted.view.state.doc.descendants((node) => {
    if (node.isText) {
      const marks = node.marks.map((mark) => mark.type.name).join("+");
      parts.push(`${node.text ?? ""}${marks ? `[${marks}]` : ""}`);
    }

    return true;
  });

  return parts.join(" ");
};

const settle = (mounted: MountedMilkdownEditor) => {
  setTextSelection(mounted.view, getEditorTextPosition(mounted, "tail") + 2);

  return describeDocument(mounted);
};

const typeAtProjectedOffset = (
  mounted: MountedMilkdownEditor,
  source: string,
  offset: number,
  text: string,
) => {
  setTextSelection(mounted.view, getEditorTextPosition(mounted, "text") + 1);
  setTextSelection(mounted.view, getEditorTextPosition(mounted, source) + offset);
  typeText(mounted.view, text);
};

describe("pairing a delimiter typed beside a mark", () => {
  it.each([
    { source: "_**text**", offset: 9, typed: "_", saved: "_**text**_" },
    { source: "*__text__", offset: 9, typed: "*", saved: "*__text__*" },
    { source: "**text**_", offset: 0, typed: "_", saved: "_**text**_" },
    { source: "__text__*", offset: 0, typed: "*", saved: "*__text__*" },
  ])("pairs $typed across $source", async ({ offset, saved, source, typed }) => {
    const mounted = await mountEditor(`${source}${TAIL}`);

    typeAtProjectedOffset(mounted, source, offset, typed);

    expect(settle(mounted)).toBe("text[emphasis+strong] tail");
    expect(mounted.getMarkdown()).toBe(`${saved}\n\ntail\n`);

    const reopened = await mountEditor(mounted.getMarkdown());

    expect(describeDocument(reopened)).toBe("text[emphasis+strong] tail");
  });

  // The serializer writes a mark set in schema order, so the saved nesting is the order the same
  // source already takes when the editor opens it from a file rather than the order it was typed
  // in. What the pairing owes is the mark set and the document the file reloads as.
  it("pairs a two-character run into strong emphasis", async () => {
    const mounted = await mountEditor(`__*text*${TAIL}`);

    typeAtProjectedOffset(mounted, "__*text*", 8, "_");
    typeText(mounted.view, "_");

    expect(settle(mounted)).toBe("text[emphasis+strong] tail");
    expect(mounted.getMarkdown()).toBe("*__text__*\n\ntail\n");

    const reopened = await mountEditor(mounted.getMarkdown());

    expect(describeDocument(reopened)).toBe("text[emphasis+strong] tail");
  });

  it("pairs a tilde run into strikethrough", async () => {
    const mounted = await mountEditor(`~~**text**${TAIL}`);

    typeAtProjectedOffset(mounted, "~~**text**", 10, "~");
    typeText(mounted.view, "~");

    expect(settle(mounted)).toBe("text[strong+strike_through] tail");
    expect(mounted.getMarkdown()).toBe("**~~text~~**\n\ntail\n");

    const reopened = await mountEditor(mounted.getMarkdown());

    expect(describeDocument(reopened)).toBe("text[strong+strike_through] tail");
  });

  it.each([
    // A file that escapes both delimiters holds the same three siblings, and nothing was typed
    // into them, so they stay literal.
    { name: "an escaped pair a file already holds", source: "\\_**text**\\_" },
    { name: "an escaped pair with the other marker", source: "\\*__text__\\*" },
  ])("leaves $name literal", async ({ source }) => {
    const mounted = await mountEditor(`${source}${TAIL}`);

    expect(describeDocument(mounted)).toBe("_ text[strong] _ tail".replace(/_/gu, source[1]));
    expect(mounted.getMarkdown()).toBe(`${source}\n\ntail\n`);
  });

  it("leaves a run that cannot open literal", async () => {
    const mounted = await mountEditor(`a_**text**${TAIL}`);

    typeAtProjectedOffset(mounted, "a_**text**", 10, "_");

    expect(settle(mounted)).toBe("a_ text[strong] _ tail");
    expect(mounted.getMarkdown()).toBe("a\\_**text**\\_\n\ntail\n");
  });

  it("leaves a run that cannot close literal", async () => {
    const mounted = await mountEditor(`_**text**a${TAIL}`);

    typeAtProjectedOffset(mounted, "_**text**a", 9, "_");

    expect(settle(mounted)).toBe("_ text[strong] _a tail");
    expect(mounted.getMarkdown()).toBe("\\_**text**\\_a\n\ntail\n");
  });

  it("leaves runs of unequal length literal", async () => {
    const mounted = await mountEditor(`__**text**${TAIL}`);

    typeAtProjectedOffset(mounted, "__**text**", 10, "_");

    expect(settle(mounted)).toBe("__ text[strong] _ tail");
  });

  it("leaves a span that already carries the mark alone", async () => {
    const mounted = await mountEditor(`_*text*${TAIL}`);

    typeAtProjectedOffset(mounted, "_*text*", 7, "_");

    expect(settle(mounted)).toBe("_ text[emphasis] _ tail");
  });

  it("keeps the ordinary input rule working with no mark between", async () => {
    const mounted = await mountEditor(TAIL);

    setTextSelection(mounted.view, 1);
    typeText(mounted.view, "_text_");

    expect(settle(mounted)).toBe("text[emphasis] tail");
  });
});

describe("typing a delimiter run into literal text", () => {
  // The run needs a paragraph the tail does not share: a run closed against a letter reads as the
  // opener of a construct the author has not finished, and stays literal.
  const typeIntoEmptyParagraph = async (input: string) => {
    const mounted = await mountEditor(`x${TAIL}`);

    mounted.view.dispatch(mounted.view.state.tr.delete(1, 2));
    setTextSelection(mounted.view, 1);
    typeText(mounted.view, input);

    return mounted;
  };

  it.each([
    { document: "** text[emphasis]", saved: "***text*", typed: "***text*" },
    { document: "_* text[emphasis]", saved: "_\\**text*", typed: "_**text*" },
    { document: "_ text[strong]", saved: "_**text**", typed: "_**text**" },
    { document: "*_ text[emphasis]", saved: "*\\__text_", typed: "*__text_" },
    { document: "text[emphasis+strong]", saved: "_**text**_", typed: "_**text**_" },
    { document: "* text[emphasis]", saved: "\\**text*", typed: "**text*" },
    { document: "*** text[emphasis]", saved: "****text*", typed: "****text*" },
    { document: "* text[strong]", saved: "***text**", typed: "***text**" },
    { document: "* text[strong]", saved: "*__text__", typed: "*__text__" },
    { document: "text[emphasis+strong]", saved: "***text***", typed: "***text***" },
  ])(
    "reads $typed the way CommonMark reads the same source",
    async ({ document, saved, typed }) => {
      const mounted = await typeIntoEmptyParagraph(typed);

      expect(settle(mounted)).toBe(`${document} tail`);
      expect(mounted.getMarkdown()).toBe(`${saved}\n\ntail\n`);
      // The file spells the delimiters the author typed and no others, whether it writes them as
      // syntax or escapes them as text.
      expect(saved.replaceAll(/\\(?=[*_~])/gu, "")).toBe(typed);

      const reopened = await mountEditor(mounted.getMarkdown());

      expect(describeDocument(reopened)).toBe(`${document} tail`);
    },
  );

  it("holds a run the author can still extend until the caret leaves it", async () => {
    const mounted = await typeIntoEmptyParagraph("***text*");

    expect(describeDocument(mounted)).toBe("***text* tail");

    typeText(mounted.view, "*");

    expect(settle(mounted)).toBe("* text[strong] tail");
  });

  it("leaves a run closed against a letter literal", async () => {
    const mounted = await typeIntoEmptyParagraph("**a*b");

    expect(settle(mounted)).toBe("**a*b tail");
  });

  it("leaves a run that follows a word literal", async () => {
    const mounted = await typeIntoEmptyParagraph("lead**text**");

    expect(settle(mounted)).toBe("lead**text** tail");
  });

  it("leaves an unequal tilde run literal", async () => {
    const mounted = await typeIntoEmptyParagraph("~~text~");

    expect(settle(mounted)).toBe("~~text~ tail");
  });
});
