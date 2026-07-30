import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getEditorTextPosition, setTextSelection, typeText } from "@/test/utils/prosemirror";
import { enterFootnoteReferenceProjection, enterProjection } from "@/test/utils/sourceProjection";

import {
  getSourceProjectionClipboardSlice,
  hasActiveSourceProjection,
} from "../plugins/sourceProjection";

const mountEditor = setupMilkdownEditorMount();

const getClipboardHtml = (mounted: MountedMilkdownEditor) => {
  const slice = getSourceProjectionClipboardSlice(mounted.view.state);

  expect(slice).not.toBeNull();

  return mounted.view.serializeForClipboard(slice!).dom.innerHTML;
};

const parseClipboardHtml = (html: string) => {
  const template = document.createElement("template");
  template.innerHTML = html;

  return template.content;
};

describe("source projection clipboard slices", () => {
  it.each([
    {
      expectedSelectors: ["em"],
      expectedText: "Emphasis",
      selector: "em" as const,
      source: "*Emphasis*",
    },
    {
      expectedSelectors: ["strong", "em"],
      expectedText: "Both",
      selector: "strong" as const,
      source: "***Both***",
    },
    {
      expectedSelectors: ["del"],
      expectedText: "Strike",
      selector: "del" as const,
      source: "~~Strike~~",
    },
    {
      expectedSelectors: ["code"],
      expectedText: "Code",
      selector: "code" as const,
      source: "`Code`",
    },
    {
      expectedSelectors: ["a"],
      expectedText: "https://example.com",
      selector: "a" as const,
      source: "<https://example.com>",
    },
  ])(
    "resolves complete $source projections across supported inline formats",
    async ({ expectedSelectors, expectedText, selector, source }) => {
      const mounted = await mountEditor(source);

      enterProjection(mounted, selector);

      const sourceStart = getEditorTextPosition(mounted, source);
      setTextSelection(mounted.view, sourceStart, sourceStart + source.length);

      const fragment = parseClipboardHtml(getClipboardHtml(mounted));

      for (const expectedSelector of expectedSelectors) {
        expect(fragment.querySelector(expectedSelector)).toHaveTextContent(expectedText);
      }
    },
  );

  it("resolves a clean complete projection without changing editor state", async () => {
    const mounted = await mountEditor("__Strong text__");

    enterProjection(mounted, "strong");

    const sourceStart = getEditorTextPosition(mounted, "__Strong text__");
    setTextSelection(mounted.view, sourceStart, sourceStart + "__Strong text__".length);

    const stateBefore = mounted.view.state;
    const html = getClipboardHtml(mounted);

    expect(mounted.view.state).toBe(stateBefore);
    expect(parseClipboardHtml(html).querySelector("strong")).toHaveTextContent("Strong text");
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.getMarkdown()).toBe("__Strong text__\n");
  });

  it("maps marked content semantically and declines delimiter-only selections", async () => {
    const mounted = await mountEditor("**Bold**");

    enterProjection(mounted, "strong");

    const sourceStart = getEditorTextPosition(mounted, "**Bold**");
    setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);

    const html = getClipboardHtml(mounted);
    expect(parseClipboardHtml(html).querySelector("strong")).toHaveTextContent("Bold");

    setTextSelection(mounted.view, sourceStart, sourceStart + 2);
    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();
  });

  it("produces the same semantic slice for backward selections", async () => {
    const source = "**Backward**";
    const mounted = await mountEditor(source);

    enterProjection(mounted, "strong");

    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart + source.length, sourceStart);

    const html = getClipboardHtml(mounted);
    expect(parseClipboardHtml(html).querySelector("strong")).toHaveTextContent("Backward");
  });

  it("uses edited valid source and preserves invalid source literally", async () => {
    const mounted = await mountEditor("**Bold**");

    enterProjection(mounted, "strong");

    let sourceStart = getEditorTextPosition(mounted, "**Bold**");
    setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);
    typeText(mounted.view, "Edited");

    sourceStart = getEditorTextPosition(mounted, "**Edited**");
    setTextSelection(mounted.view, sourceStart, sourceStart + "**Edited**".length);

    const validHtml = getClipboardHtml(mounted);
    expect(parseClipboardHtml(validHtml).querySelector("strong")).toHaveTextContent("Edited");

    setTextSelection(
      mounted.view,
      sourceStart + "**Edited*".length,
      sourceStart + "**Edited**".length,
    );
    typeText(mounted.view, "_");

    const invalidSource = "**Edited*_";
    setTextSelection(mounted.view, sourceStart, sourceStart + invalidSource.length);

    const invalidHtml = getClipboardHtml(mounted);
    const invalidFragment = parseClipboardHtml(invalidHtml);

    expect(invalidFragment.querySelector("strong, em")).not.toBeInTheDocument();
    expect(invalidFragment.textContent).toBe(invalidSource);
  });

  it("maps link labels but declines link destination-only and title-only selections", async () => {
    const source = '[Label](https://example.com "Example title")';
    const mounted = await mountEditor(source);

    enterProjection(mounted, "a");

    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart + 1, sourceStart + "[Label".length);

    const labelHtml = getClipboardHtml(mounted);
    const link = parseClipboardHtml(labelHtml).querySelector("a");

    expect(link).toHaveTextContent("Label");
    expect(link).toHaveAttribute("href", "https://example.com");

    const destinationFrom = source.indexOf("https://");
    const destinationTo = destinationFrom + "https://example.com".length;
    setTextSelection(mounted.view, sourceStart + destinationFrom, sourceStart + destinationTo);

    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();

    const titleFrom = source.indexOf("Example title");
    const titleTo = titleFrom + "Example title".length;
    setTextSelection(mounted.view, sourceStart + titleFrom, sourceStart + titleTo);

    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();
  });

  it("preserves invalid edited links literally", async () => {
    const source = "[Label](https://example.com)";
    const mounted = await mountEditor(source);

    enterProjection(mounted, "a");

    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart + source.length - 1, sourceStart + source.length);
    typeText(mounted.view, "]");

    const invalidSource = "[Label](https://example.com]";
    setTextSelection(mounted.view, sourceStart, sourceStart + invalidSource.length);

    const fragment = parseClipboardHtml(getClipboardHtml(mounted));
    expect(fragment.querySelector("a")).not.toBeInTheDocument();
    expect(fragment.textContent).toBe(invalidSource);
  });

  it("maps complete atomic references but declines partial labels", async () => {
    const source = "[^note]";
    const mounted = await mountEditor(`Before${source} after\n\n[^note]: Detail`);

    enterFootnoteReferenceProjection(mounted);

    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart, sourceStart + source.length);

    const slice = getSourceProjectionClipboardSlice(mounted.view.state);
    let hasFootnoteReference = false;
    slice?.content.descendants((node) => {
      hasFootnoteReference ||= node.type.name === "footnote_reference";
    });
    expect(hasFootnoteReference).toBe(true);

    setTextSelection(mounted.view, sourceStart + 2, sourceStart + source.length - 1);
    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();
  });

  it("maps complete marked references but declines partial atomic source", async () => {
    const source = "**Text[^note]**";
    const mounted = await mountEditor(`${source}\n\n[^note]: Detail`);

    enterFootnoteReferenceProjection(mounted);

    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart, sourceStart + source.length);

    const completeSlice = getSourceProjectionClipboardSlice(mounted.view.state);
    let hasStrongText = false;
    let hasFootnoteReference = false;
    completeSlice?.content.descendants((node) => {
      hasStrongText ||= node.isText && node.marks.some((mark) => mark.type.name === "strong");
      hasFootnoteReference ||= node.type.name === "footnote_reference";
    });

    expect(hasStrongText).toBe(true);
    expect(hasFootnoteReference).toBe(true);

    const referenceFrom = source.indexOf("[^note]");
    setTextSelection(
      mounted.view,
      sourceStart + referenceFrom + 2,
      sourceStart + referenceFrom + "[^note]".length - 1,
    );
    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();
  });
});
