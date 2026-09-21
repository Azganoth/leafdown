import { $, $$, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { getSaveMenuItem, openRecentPath } from "../support/ui.js";

const liveDiv = () => $('[data-html-rendered="true"] > div');
const liveSection = () => $('[data-html-rendered="true"] > section');
const source = () => $('[data-leafdown-source~="html"]');
const unsupported = () => $$('[data-html-rendered="false"]')[0];
const sectionSource = `<section>
Multiline safe HTML.
</section>`;
const sectionClickOffset = sectionSource.indexOf("HTML") + 2;

interface ElementGeometry {
  bottom: number;
  height: number;
  left: number;
  nextTop: number;
  top: number;
  width: number;
}

const measureWithNextBlock = (element: ReturnType<typeof source>) =>
  element.execute((node) => {
    const rect = node.getBoundingClientRect();
    const next = node.closest("p")!.nextElementSibling!.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      nextTop: next.top,
      top: rect.top,
      width: rect.width,
    };
  }) as Promise<ElementGeometry>;

const clickTextOffset = async (
  element: ReturnType<typeof source>,
  textContent: string,
  offset: number,
) => {
  await element.execute(
    (node, expectedTextValue, textOffsetValue) => {
      const expectedText = String(expectedTextValue);
      const textOffset = Number(textOffsetValue);
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      let renderedTextOffset = -1;
      while (text) {
        renderedTextOffset = (text.textContent ?? "").indexOf(expectedText);
        if (renderedTextOffset >= 0) break;
        text = walker.nextNode();
      }
      if (!text) throw new Error(`Rendered text was not found: ${expectedText}`);
      const caretOffset = renderedTextOffset + textOffset;
      const range = document.createRange();
      range.setStart(text, Math.max(0, caretOffset - 1));
      range.setEnd(text, caretOffset);
      const rect = range.getBoundingClientRect();
      node.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          cancelable: true,
          clientX: rect.right - 0.25,
          clientY: rect.top + rect.height / 2,
        }),
      );
    },
    textContent,
    offset,
  );
};

const getSelectionOffset = (element: ReturnType<typeof source>) =>
  element.execute((node) => {
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !selection.focusNode || !node.contains(selection.focusNode)) {
      throw new Error("Expected a collapsed selection inside projected HTML source");
    }
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(selection.focusNode, selection.focusOffset);
    return range.toString().length;
  }) as Promise<number>;

describe("desktop raw HTML", () => {
  it("renders safe block atoms, rejects unsafe trees, and saves multiline source edits", async () => {
    const { html } = await getDesktopE2ERunContext();
    const original = await readFile(html.path, "utf8");
    await openRecentPath(html.path);
    await expect(liveDiv()).toBeDisplayed();
    await expect(liveDiv().$("strong")).toHaveText("safe HTML");
    await expect(liveSection()).toBeDisplayed();
    await expect(liveSection()).toHaveText("Multiline safe HTML.");
    expect(await $$('[data-html-rendered="false"]').length).toBe(4);
    await expect(
      $('.ProseMirror img[src], .ProseMirror svg, .ProseMirror [style*="fixed"]'),
    ).not.toExist();
    const geometry = (await liveSection().execute((node) => {
      const block = node.getBoundingClientRect();
      const next = node
        .closest('[data-type="html"]')!
        .parentElement!.nextElementSibling!.getBoundingClientRect();
      return { height: block.height, bottom: block.bottom, nextTop: next.top };
    })) as { height: number; bottom: number; nextTop: number };
    expect(geometry.height).toBeGreaterThan(0);
    expect(geometry.height).toBeLessThan(40);
    expect(geometry.nextTop).toBeGreaterThanOrEqual(geometry.bottom);

    const unsupportedHtml = unsupported();
    const unsupportedBefore = await measureWithNextBlock(unsupportedHtml);
    await unsupportedHtml.execute((node) =>
      node.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }),
      ),
    );
    await expect(source()).toBeDisplayed();
    const unsupportedAfter = await measureWithNextBlock(source());
    for (const key of ["height", "left", "nextTop", "top", "width"] as const) {
      expect(Math.abs(unsupportedAfter[key] - unsupportedBefore[key])).toBeLessThanOrEqual(0.5);
    }
    await $(".ProseMirror > p:last-child").execute((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await expect(liveSection()).toBeDisplayed();

    await clickTextOffset(liveSection(), "Multiline safe HTML.", "Multiline safe HT".length);
    await expect(source()).toBeDisplayed();
    expect(
      await source().execute(() => ({
        collapsed: window.getSelection()?.isCollapsed,
        text: window.getSelection()?.toString(),
      })),
    ).toEqual({ collapsed: true, text: "" });
    expect(await getSelectionOffset(source())).toBe(sectionClickOffset);
    await expect($(".ProseMirror input")).not.toExist();
    await $(".ProseMirror > p:last-child").execute((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await expect(liveSection()).toBeDisplayed();
    await expect(await getSaveMenuItem()).toHaveAttribute("data-disabled");
    await browser.keys(Key.Escape);

    await clickTextOffset(liveSection(), "Multiline safe HTML.", "Multiline safe HT".length);
    await expect(source()).toBeDisplayed();
    expect(await getSelectionOffset(source())).toBe(sectionClickOffset);
    await browser.keys(Key.Enter);
    await expect(source()).toHaveText(expect.stringContaining("HT\nML"));
    await browser.keys([Key.Ctrl, "s", Key.NULL]);
    await browser.waitUntil(
      async () =>
        (await readFile(html.path, "utf8")) ===
        original.replace(sectionSource, sectionSource.replace("HTML", "HT\nML")),
    );
    expect(await liveSection().execute((node) => node.textContent?.trim())).toBe(
      "Multiline safe HT\nML.",
    );
    await browser.keys([Key.Ctrl, "z", Key.NULL]);
    await browser.keys([Key.Ctrl, "s", Key.NULL]);
    await browser.waitUntil(async () => (await readFile(html.path, "utf8")) === original);
  });
});
