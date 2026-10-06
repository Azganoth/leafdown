import { $, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import {
  findTreeItem,
  getSaveMenuItem,
  openRecentPath,
  selectFileMenuItem,
} from "../support/ui.js";

const VIEWPORT = '[data-testid="document-surface-scroll-area"] [data-slot="scroll-area-viewport"]';

const viewportGeometry = () =>
  browser.execute((selector) => {
    const viewport = document.querySelector<HTMLElement>(selector)!;
    const firstBlock = document.querySelector(".ProseMirror > :first-child")!;
    const viewportRect = viewport.getBoundingClientRect();
    const blockRect = firstBlock.getBoundingClientRect();
    return {
      scrollTop: viewport.scrollTop,
      overflow: viewport.scrollHeight - viewport.clientHeight,
      firstBlockVisible:
        blockRect.top >= viewportRect.top && blockRect.bottom <= viewportRect.bottom,
    };
  }, VIEWPORT);

const scrollDocument = async () => {
  const offset = await browser.execute((selector) => {
    const viewport = document.querySelector<HTMLElement>(selector)!;
    viewport.scrollTop = 800;
    viewport.dispatchEvent(new Event("scroll"));
    return viewport.scrollTop;
  }, VIEWPORT);
  expect(offset).toBeGreaterThan(0);
};

const expectDocumentAtTop = async (marker: string) => {
  await expect($(".ProseMirror")).toHaveText(expect.stringContaining(marker));
  await browser.waitUntil(async () => (await viewportGeometry()).firstBlockVisible, {
    timeoutMsg: "The replacement document's first block was outside its viewport.",
  });
  expect((await viewportGeometry()).scrollTop).toBe(0);
};

const selectedHeadingGeometry = () =>
  browser.execute((selector) => {
    const viewport = document.querySelector(selector)!;
    const heading = document.getSelection()?.anchorNode?.parentElement?.closest("h1");
    if (!heading) return null;
    const viewportRect = viewport.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return {
      text: heading.textContent,
      visible: headingRect.top >= viewportRect.top && headingRect.bottom <= viewportRect.bottom,
      scrollTop: viewport.scrollTop,
    };
  }, VIEWPORT);

describe("desktop document lifecycle", () => {
  it("starts replacement documents at the top and preserves explicit navigation and reloads", async () => {
    const { document: fixture } = await getDesktopE2ERunContext();
    const replacementPath = path.join(path.dirname(fixture.path), "viewport-replacement.md");
    const filler = Array.from(
      { length: 80 },
      (_, index) => `Viewport paragraph ${index + 1}.`,
    ).join("\n\n");
    const original = `# First viewport document\n\n${filler}\n\n# Scroll target\n`;
    await writeFile(fixture.scrollPath, original);
    await writeFile(
      replacementPath,
      `# Second viewport document\n\n[[document-scroll#Scroll target|Jump to target]]\n\n${filler}\n`,
    );

    await openRecentPath(fixture.scrollPath);
    await expectDocumentAtTop("First viewport document");
    expect((await viewportGeometry()).overflow).toBeGreaterThan(800);
    await scrollDocument();
    await (await findTreeItem("viewport-replacement.md")).click();
    await expectDocumentAtTop("Second viewport document");
    expect((await viewportGeometry()).overflow).toBeGreaterThan(800);

    await scrollDocument();
    await openRecentPath(fixture.scrollPath);
    await expectDocumentAtTop("First viewport document");
    await scrollDocument();
    await (await findTreeItem("document-lifecycle.md")).click();
    await expectDocumentAtTop(fixture.initialMarker);

    await openRecentPath(replacementPath);
    await expectDocumentAtTop("Second viewport document");
    await scrollDocument();
    await openRecentPath(fixture.path);
    await expectDocumentAtTop(fixture.initialMarker);

    await openRecentPath(replacementPath);
    await expectDocumentAtTop("Second viewport document");
    await $('[data-type="wiki-link"]').execute((target) => {
      target.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0, cancelable: true, ctrlKey: true }),
      );
    });
    await browser.waitUntil(
      async () => {
        const heading = await selectedHeadingGeometry();
        return heading?.text === "Scroll target" && heading.visible;
      },
      { timeoutMsg: "The cross-document heading link did not reveal its target." },
    );
    expect(await selectedHeadingGeometry()).toMatchObject({ text: "Scroll target", visible: true });
    expect((await selectedHeadingGeometry())!.scrollTop).toBeGreaterThan(800);

    await writeFile(fixture.scrollPath, `${original}\nReloaded viewport marker.\n`);
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            document
              .querySelector(".ProseMirror")
              ?.textContent?.includes("Reloaded viewport marker.") ?? false,
        ),
      { timeoutMsg: "The external reload did not replace the editor's text." },
    );
    await browser.waitUntil(async () => (await selectedHeadingGeometry())?.visible === true, {
      timeoutMsg: "The external reload did not restore the caret's heading into view.",
    });
    expect(await selectedHeadingGeometry()).toMatchObject({ text: "Scroll target", visible: true });
    expect((await selectedHeadingGeometry())!.scrollTop).toBeGreaterThan(800);
    await selectFileMenuItem("Close document");
  });

  it("opens, edits, saves, and reopens a fixture through real IPC", async () => {
    const { document } = await getDesktopE2ERunContext();

    await openRecentPath(document.path);

    const editor = $('[contenteditable="true"]');
    await expect(editor).toBeDisplayed();
    await expect(editor).toHaveText(expect.stringContaining(document.initialMarker));

    const cleanSaveItem = await getSaveMenuItem();
    await expect(cleanSaveItem).toHaveAttribute("data-disabled");
    await browser.keys("Escape");

    await editor.click();
    await browser.keys([Key.Ctrl, "a"]);
    await browser.keys(Key.NULL);
    await editor.addValue(document.savedMarker);

    const dirtySaveItem = await getSaveMenuItem();
    await expect(dirtySaveItem).not.toHaveAttribute("data-disabled");
    await browser.keys("Escape");

    await editor.click();
    await browser.keys([Key.Ctrl, "s", Key.NULL]);

    await browser.waitUntil(
      async () => (await readFile(document.path, "utf8")) === document.savedMarkdown,
      {
        timeoutMsg: "The saved fixture did not reach the expected on-disk contents.",
      },
    );

    const savedSaveItem = await getSaveMenuItem();
    await expect(savedSaveItem).toHaveAttribute("data-disabled");
    await browser.keys("Escape");

    await selectFileMenuItem("Close document");
    await expect($('[contenteditable="true"]')).not.toExist();

    await openRecentPath(document.path);
    const reopenedEditor = $('[contenteditable="true"]');
    await expect(reopenedEditor).toHaveText(expect.stringContaining(document.savedMarker));

    await reopenedEditor.click();
    await browser.keys([Key.Ctrl, Key.End, Key.NULL]);
    await reopenedEditor.addValue(" Unsent edit");
    await expect(reopenedEditor).toHaveText(expect.stringContaining("Unsent edit"));
    const unsavedSaveItem = await getSaveMenuItem();
    await expect(unsavedSaveItem).not.toHaveAttribute("data-disabled");
    await browser.keys("Escape");
    await reopenedEditor.click();
    await browser.keys([Key.Ctrl, "w", Key.NULL]);

    const prompt = $('[data-slot="dialog-content"][data-open]');
    await expect(prompt).toBeDisplayed();
    await expect(prompt).toHaveAttribute("aria-labelledby");
    await expect($("aria/Unsaved changes")).toBeDisplayed();
    await expect($("aria/Keep editing")).toBeDisplayed();
    await expect($("aria/Discard changes")).toBeDisplayed();
    await $("#leafdown-titlebar [data-tauri-drag-region]").click();
    await expect(prompt).toBeDisplayed();
    expect(
      await browser.execute(() =>
        Boolean(globalThis.document.activeElement?.closest('[role="dialog"]')),
      ),
    ).toBe(true);
    await $("aria/Maximize window").click();
    await expect(prompt).toBeDisplayed();
    await browser.waitUntil(
      () =>
        browser.execute(() =>
          Boolean(globalThis.document.activeElement?.closest('[role="dialog"]')),
        ),
      { timeoutMsg: "Focus did not return to the dialog after using a window control." },
    );

    await browser.keys(Key.Tab);
    expect(
      await browser.execute(() =>
        Boolean(globalThis.document.activeElement?.closest('[role="dialog"]')),
      ),
    ).toBe(true);

    await browser.keys("Escape");
    await expect(prompt).not.toExist();
    await expect(reopenedEditor).toBeDisplayed();
    await expect(reopenedEditor).toHaveText(expect.stringContaining("Unsent edit"));
    await browser.waitUntil(
      () =>
        browser.execute(() =>
          Boolean(globalThis.document.activeElement?.closest('[contenteditable="true"]')),
        ),
      { timeoutMsg: "Focus did not return to the editor after dismissing the prompt." },
    );

    await browser.keys([Key.Ctrl, "w", Key.NULL]);
    const secondPrompt = $('[data-slot="dialog-content"][data-open]');
    await expect(secondPrompt).toBeDisplayed();
    await $("aria/Discard changes").click();
    await expect(reopenedEditor).not.toExist();
    expect(await readFile(document.path, "utf8")).toBe(document.savedMarkdown);
  });
});
