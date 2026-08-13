import { describe, expect, it } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { createClipboardData, parseClipboardHtml } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  containsNodeType,
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  getMarkNames,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { enterFootnoteReferenceProjection, enterProjection } from "@/test/utils/sourceProjection";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

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

    expect(slice).not.toBeNull();
    expect(containsNodeType(slice!.content, "footnote_reference")).toBe(true);

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
    completeSlice?.content.descendants((node) => {
      hasStrongText ||= node.isText && getMarkNames(node).includes("strong");
    });

    expect(hasStrongText).toBe(true);
    expect(containsNodeType(completeSlice!.content, "footnote_reference")).toBe(true);

    const referenceFrom = source.indexOf("[^note]");
    setTextSelection(
      mounted.view,
      sourceStart + referenceFrom + 2,
      sourceStart + referenceFrom + "[^note]".length - 1,
    );
    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();
  });

  it("maps a complete image label but declines a partial image selection", async () => {
    mockTauriApiCommand("resolveMarkdownImageTarget", () => ({
      kind: "renderable",
      path: "C:/Notes/pic.png",
    }));

    const image = "![alt](./pic.png)";
    const source = `[word ${image}](./doc.md)`;
    const mounted = await mountEditor(`${source} tail`, createMarkdownReferenceContext());

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "image"));
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

    const sourceStart = getEditorTextPosition(mounted, source);
    const imageFrom = sourceStart + source.indexOf(image);

    setTextSelection(mounted.view, sourceStart + 1, imageFrom + image.length);

    const slice = getSourceProjectionClipboardSlice(mounted.view.state);

    expect(slice).not.toBeNull();
    expect(containsNodeType(slice!.content, "image")).toBe(true);

    setTextSelection(mounted.view, imageFrom + "![a".length, imageFrom + "![alt](./pic".length);
    expect(getSourceProjectionClipboardSlice(mounted.view.state)).toBeNull();
  });

  it("pastes a slice into projected source when the clipboard carries no plain text", async () => {
    const mounted = await mountEditor("[word](./doc.md) tail");

    enterProjection(mounted, "a");

    const tailFrom = getEditorTextPosition(mounted, "tail");
    const slice = mounted.view.state.doc.slice(tailFrom, tailFrom + "tail".length);
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;

    Object.defineProperty(event, "clipboardData", { value: createClipboardData() });
    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "[word](./doc.md)") + "[wor".length,
    );

    const handled = mounted.view.someProp("handlePaste", (handler) =>
      handler(mounted.view, event, slice),
    );

    expect(handled).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("[wortaild](./doc.md) tail");
  });

  it("pastes no line break for a node the projected source cannot hold", async () => {
    mockTauriApiCommand("resolveMarkdownImageTarget", () => ({ kind: "remoteBlocked" }));

    const mounted = await mountEditor("[word](./doc.md) ![alt](https://example.com/pic.png)");

    enterProjection(mounted, "a");

    const imagePosition = getEditorNodePosition(mounted, "image");
    const slice = mounted.view.state.doc.slice(imagePosition, imagePosition + 1);
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;

    Object.defineProperty(event, "clipboardData", { value: createClipboardData() });
    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "[word](./doc.md)") + "[wor".length,
    );

    expect(
      mounted.view.someProp("handlePaste", (handler) => handler(mounted.view, event, slice)),
    ).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("[word](./doc.md) ");
  });
});
