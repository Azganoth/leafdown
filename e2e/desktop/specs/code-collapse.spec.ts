import { $, browser, expect } from "@wdio/globals";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

const control = (name: string) => `pre .leafdown-code-control[aria-label="${name}"]`;

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

  it("shows its toggles above the code while the caret is in it, and they act on every block", async () => {
    const expandAll = control("Expand all code blocks");
    const lineNumbers = control("Display line numbers for code blocks");

    await browser.waitUntil(
      async () =>
        (await $("pre .leafdown-code-controls").execute(
          (controls) => getComputedStyle(controls).opacity,
        )) === "1",
      { timeoutMsg: "The toggles did not show with the caret in the block." },
    );
    const overlap = (await block().execute((pre) => {
      const code = pre.querySelector("code")!.getBoundingClientRect();
      return [...pre.querySelectorAll(".leafdown-code-control:not([hidden])")].map(
        (button) => button.getBoundingClientRect().bottom - code.top,
      );
    })) as number[];
    expect(overlap).toHaveLength(3);
    for (const depth of overlap) expect(depth).toBeLessThanOrEqual(0);

    await click(await centerOf(lineNumbers));

    await expect(block()).toHaveElementClass("leafdown-code-block--numbered");
    await expect($(lineNumbers)).toHaveAttribute("aria-pressed", "true");

    await click(await centerOf(lineNumbers));

    await expect(block()).not.toHaveElementClass("leafdown-code-block--numbered");
    await expect($(expandAll)).toHaveAttribute("aria-pressed", "true");

    await click(await centerOf(expandAll));

    await expect(block()).toHaveAttribute("data-leafdown-code-collapse", "collapsed");
    await expect($(expandAll)).toHaveAttribute("aria-pressed", "false");
    expect(await caretLine()).toBe(8);
  });
});
