import { $, browser, expect } from "@wdio/globals";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

const block = () => $("[data-testid=active-document-host] .ProseMirror pre");

const centerOf = async (selector: string) =>
  (await $(selector).execute((node) => {
    const rect = node.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })) as { x: number; y: number };

const click = async (point: { x: number; y: number }) => {
  await browser
    .action("pointer")
    .move({ duration: 0, origin: "viewport", ...point })
    .down({ button: 0 })
    .up({ button: 0 })
    .perform();
};

// The caret's line within the code, counted from the code's start to the native selection.
const caretLine = () =>
  browser.execute(() => {
    const code = document.querySelector(
      "[data-testid=active-document-host] .ProseMirror pre code",
    )!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(code, 0);
    range.setEnd(selection.focusNode!, selection.focusOffset);
    return range.toString().split("\n").length;
  });

describe("desktop code block collapse", () => {
  it("shows eight lines, expands under the arrow keys, and collapses from its chevron", async () => {
    const { codeCollapse: fixture } = await getDesktopE2ERunContext();
    await openRecentPath(fixture.path);
    await expect(block()).toHaveAttribute("data-leafdown-code-collapse", "collapsed");

    const shownLines = (await block().execute((pre) => {
      const code = pre.querySelector("code")!;
      return (
        code.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(code).lineHeight)
      );
    })) as number;
    expect(Math.round(shownLines)).toBe(8);
    await expect($("pre .leafdown-code-expand")).toBeDisplayed();
    await expect($("pre .leafdown-code-collapse")).not.toBeDisplayed();

    await browser.execute(() => {
      const code = document.querySelector<HTMLElement>(
        "[data-testid=active-document-host] .ProseMirror pre code",
      )!;
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      while (text && !text.textContent!.includes("08")) text = walker.nextNode();
      code.closest<HTMLElement>(".ProseMirror")!.focus();
      window.getSelection()!.collapse(text, 0);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await browser.waitUntil(async () => (await caretLine()) === 8, {
      timeoutMsg: "The caret did not reach the last shown line.",
    });

    await browser.keys("ArrowDown");

    await expect(block()).toHaveAttribute("data-leafdown-code-collapse", "expanded");
    await browser.waitUntil(async () => (await caretLine()) === 9, {
      timeoutMsg: "ArrowDown did not land on the first revealed line.",
    });

    await click(await centerOf("pre .leafdown-code-collapse"));

    await expect(block()).toHaveAttribute("data-leafdown-code-collapse", "collapsed");
    await browser.waitUntil(async () => (await caretLine()) === 8, {
      timeoutMsg: "Collapsing did not move the caret to the last shown line.",
    });

    await click(await centerOf("pre .leafdown-code-expand"));

    await expect(block()).toHaveAttribute("data-leafdown-code-collapse", "expanded");
    expect(await caretLine()).toBe(8);
  });
});
