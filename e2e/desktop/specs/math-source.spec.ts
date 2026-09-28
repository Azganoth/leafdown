import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

describe("desktop math source", () => {
  it("shows authored source, edits from a click, and saves without changing other math", async () => {
    const { math } = await getDesktopE2ERunContext();
    const original = await readFile(math.path, "utf8");
    await openRecentPath(math.path);

    const inline = $('[data-type="math"][data-value="$x^2$"]');
    const display = $('[data-type="math"][data-math-flow="block"]');
    await expect(inline).toHaveText("$x^2$");
    await expect(display).toHaveText("$$\n  a\n    b\n$$");
    expect(
      await display.execute((node) => ({
        display: getComputedStyle(node).display,
        whiteSpace: getComputedStyle(node).whiteSpace,
      })),
    ).toEqual({ display: "block", whiteSpace: "pre-wrap" });

    await inline.execute((node) =>
      node.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }),
      ),
    );
    const projected = $('[data-leafdown-source~="math"]');
    await expect(projected).toHaveText("$x^2$");
    expect(
      await projected.execute((node) => {
        const selection = window.getSelection();
        if (
          !selection?.isCollapsed ||
          !selection.focusNode ||
          !node.contains(selection.focusNode)
        ) {
          throw new Error("Expected a caret inside projected math source");
        }
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(selection.focusNode, selection.focusOffset);
        return range.toString().length;
      }),
    ).toBe(1);

    expect(
      await browser.execute(() => document.activeElement?.classList.contains("ProseMirror")),
    ).toBe(true);
    await $(".ProseMirror").addValue("z");
    expect(await projected.execute((node) => node.textContent)).toBe("$zx^2$");
    await browser.keys([Key.Ctrl, "s", Key.NULL]);
    const edited = original.replace("$x^2$", "$zx^2$");
    await browser.waitUntil(async () => (await readFile(math.path, "utf8")) === edited);
    await expect($('[data-type="math"][data-value="$zx^2$"]')).toBeDisplayed();
    await expect(display).toHaveText("$$\n  a\n    b\n$$");
  });
});
