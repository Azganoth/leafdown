import { $, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import {
  closeAllDocuments,
  countDocumentTabs,
  findDocumentTab,
  findMenuItem,
  findTreeItem,
  getSaveMenuItem,
  openRecentPath,
  selectFileMenuItem,
} from "../support/ui.js";

const VIEWPORT =
  '[data-testid=active-document-host] [data-testid="document-surface-scroll-area"] [data-slot="scroll-area-viewport"]';

const expectActiveDocumentMarker = async (name: string) => {
  await browser.waitUntil(
    () =>
      browser.execute(() => {
        const row = document.querySelector('[role="treeitem"][aria-selected="true"]');
        const tab = document.querySelector('[role="tab"][aria-selected="true"]');
        return Boolean(
          row &&
          tab &&
          getComputedStyle(row).backgroundColor === getComputedStyle(tab).backgroundColor,
        );
      }),
    { timeoutMsg: "The active article row and tab did not settle on the same background." },
  );

  const appearance = await browser.execute(() => {
    const row = document.querySelector('[role="treeitem"][aria-selected="true"]');
    const tab = document.querySelector('[role="tab"][aria-selected="true"]');
    if (!row || !tab) return null;

    const markers = [row, tab].map((element) => {
      const style = getComputedStyle(element, "::before");
      return {
        width: Number.parseFloat(style.width),
        height: Number.parseFloat(style.height),
        left: Number.parseFloat(style.left),
        color: style.backgroundColor,
        pointerEvents: style.pointerEvents,
      };
    });

    return {
      row: { name: row.textContent, marker: markers[0] },
      tab: { name: tab.textContent, marker: markers[1] },
      sameBackground:
        getComputedStyle(row).backgroundColor === getComputedStyle(tab).backgroundColor,
      inactiveMarkers: Array.from(
        document.querySelectorAll(
          '[role="treeitem"][aria-selected="false"], [role="tab"][aria-selected="false"]',
        ),
      ).filter((element) => getComputedStyle(element, "::before").content !== "none").length,
    };
  });

  expect(appearance).not.toBeNull();
  expect(appearance!.row.name).toBe(name);
  expect(appearance!.tab.name).toBe(name);
  expect(appearance!.sameBackground).toBe(true);
  expect(appearance!.inactiveMarkers).toBe(0);
  expect(appearance!.row.marker).toEqual(appearance!.tab.marker);
  expect(appearance!.row.marker).toMatchObject({
    width: 3,
    height: 12,
    left: 3,
    pointerEvents: "none",
  });
};

const viewportGeometry = () =>
  browser.execute((selector) => {
    const viewport = document.querySelector<HTMLElement>(selector)!;
    const firstBlock = document.querySelector(
      "[data-testid=active-document-host] .ProseMirror > :first-child",
    )!;
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
  await expect($("[data-testid=active-document-host] .ProseMirror")).toHaveText(
    expect.stringContaining(marker),
  );
  await browser.waitUntil(async () => (await viewportGeometry()).firstBlockVisible, {
    timeoutMsg: "The newly opened document's first block was outside its viewport.",
  });
  expect((await viewportGeometry()).scrollTop).toBe(0);
};

const expectDocumentScrolled = async (marker: string) => {
  await expect($("[data-testid=active-document-host] .ProseMirror")).toHaveText(
    expect.stringContaining(marker),
  );
  await browser.waitUntil(async () => (await viewportGeometry()).scrollTop === 800, {
    timeoutMsg: "The tab did not keep the place it was scrolled to.",
  });
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

const editorBlocks = () =>
  browser.execute(() =>
    Array.from(
      document.querySelectorAll("[data-testid=active-document-host] .ProseMirror > :is(h1, p)"),
      (block) => `${block.tagName}:${block.textContent ?? ""}`,
    ),
  );

const waitForFile = (filePath: string, matches: (content: string) => boolean, timeoutMsg: string) =>
  browser.waitUntil(async () => matches(await readFile(filePath, "utf8")), { timeoutMsg });

const saveDocument = async () => {
  await (await getSaveMenuItem()).click();
};

const undo = async () => {
  await $("aria/Edit").click();
  await (await findMenuItem((text) => text.startsWith("Undo"))).click();
};

// The driver's pointer actions dispatch no mousedown at an arbitrary point, so the press the
// editor's empty space below its last block answers is dispatched where a real one would land.
const pressBelowLastBlock = () =>
  browser.execute(() => {
    const editor = document.querySelector<HTMLElement>(
      "[data-testid=active-document-host] .ProseMirror",
    )!;
    const lastBlock = editor.lastElementChild!.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: Math.round(lastBlock.left + 8),
      clientY: Math.round(lastBlock.bottom + 24),
    };
    const target = document.elementFromPoint(init.clientX, init.clientY);
    if (target !== editor) throw new Error("The space below the last block is not the editor's.");
    target.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
    target.dispatchEvent(new MouseEvent("mouseup", init));
    target.dispatchEvent(new MouseEvent("click", init));
  });

describe("desktop document lifecycle", () => {
  it("starts newly opened documents at the top and keeps each tab where it was left", async () => {
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
    await expectActiveDocumentMarker("viewport-replacement.md");
    await expect(await findDocumentTab("viewport-replacement.md")).toHaveAttribute(
      "aria-label",
      "viewport-replacement.md, preview",
    );
    // Kept, so the next article opened from the navigator does not replace it. The harness
    // synthesizes clicks without the dblclick a real double-click raises, so it is dispatched.
    await (await findTreeItem("viewport-replacement.md")).waitForDisplayed();
    await browser.execute(() => {
      const row = document.querySelector(
        '[role="treeitem"][data-navigator-path$="viewport-replacement.md"]',
      );
      row?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    await expect(await findDocumentTab("viewport-replacement.md")).toHaveAttribute(
      "aria-label",
      "viewport-replacement.md",
    );
    expect((await viewportGeometry()).overflow).toBeGreaterThan(800);
    await scrollDocument();

    await openRecentPath(fixture.scrollPath);
    await expectDocumentScrolled("First viewport document");
    await (await findTreeItem("document-lifecycle.md")).click();
    await expectDocumentAtTop(fixture.initialMarker);
    expect(await countDocumentTabs()).toBe(3);

    await (await findDocumentTab("viewport-replacement.md")).click();
    await expectDocumentScrolled("Second viewport document");
    await expectActiveDocumentMarker("viewport-replacement.md");
    await $("[data-testid=active-document-host] [data-type='wiki-link']").execute((target) => {
      target.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0, cancelable: true, ctrlKey: true }),
      );
    });
    await expect(await findDocumentTab("document-scroll.md")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await browser.waitUntil(
      async () => {
        const heading = await selectedHeadingGeometry();
        return heading?.text === "Scroll target" && heading.visible;
      },
      { timeoutMsg: "The cross-document heading link did not reveal its target." },
    );
    expect(await selectedHeadingGeometry()).toMatchObject({ text: "Scroll target", visible: true });
    expect((await selectedHeadingGeometry())!.scrollTop).toBeGreaterThan(800);
    expect(await countDocumentTabs()).toBe(3);

    await writeFile(fixture.scrollPath, `${original}\nReloaded viewport marker.\n`);
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            document
              .querySelector("[data-testid=active-document-host] .ProseMirror")
              ?.textContent?.includes("Reloaded viewport marker.") ?? false,
        ),
      { timeoutMsg: "The external reload did not replace the editor's text." },
    );
    await browser.waitUntil(async () => (await selectedHeadingGeometry())?.visible === true, {
      timeoutMsg: "The external reload did not restore the caret's heading into view.",
    });
    expect(await selectedHeadingGeometry()).toMatchObject({ text: "Scroll target", visible: true });
    expect((await selectedHeadingGeometry())!.scrollTop).toBeGreaterThan(800);
    await closeAllDocuments();
  });

  it("opens, edits, saves, and reopens a fixture through real IPC", async () => {
    const { document } = await getDesktopE2ERunContext();

    await openRecentPath(document.path);

    const editor = $('[data-testid=active-document-host] [contenteditable="true"]');
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
    await expect($('[data-testid=active-document-host] [contenteditable="true"]')).not.toExist();

    await openRecentPath(document.path);
    const reopenedEditor = $('[data-testid=active-document-host] [contenteditable="true"]');
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

  it("keeps the blank lines a file ends with through edits, Undo, and reopening", async () => {
    const { document: fixture } = await getDesktopE2ERunContext();
    const original = "# Trailing blank lines\n\nLast paragraph.\n\n\n";
    const blocks = ["H1:Trailing blank lines", "P:Last paragraph."];
    await writeFile(fixture.scrollPath, original);

    await openRecentPath(fixture.scrollPath);
    const editor = $('[data-testid=active-document-host] [contenteditable="true"]');
    await expect(editor).toHaveText(expect.stringContaining("Last paragraph."));
    expect(await editorBlocks()).toEqual(blocks);

    await editor.click();
    // One character, so one Undo step takes the whole edit back.
    await editor.addValue("X");
    await expect(editor).toHaveText(expect.stringContaining("X"));
    await saveDocument();
    await waitForFile(
      fixture.scrollPath,
      (content) => content.includes("X") && /[^\n]\n\n\n$/u.test(content),
      "The edited document was not saved with the two blank lines it ends with.",
    );

    await undo();
    await saveDocument();
    await waitForFile(
      fixture.scrollPath,
      (content) => content === original,
      "Undo and a second save did not write the original file back.",
    );

    await pressBelowLastBlock();
    await browser.waitUntil(async () => (await editorBlocks()).length === 3, {
      timeoutMsg: "Pressing below the last block did not add a paragraph.",
    });
    await saveDocument();
    await waitForFile(
      fixture.scrollPath,
      (content) => content === `${original}\n`,
      "The added empty paragraph was not saved as one more blank line.",
    );

    await undo();
    await browser.waitUntil(async () => (await editorBlocks()).length === 2, {
      timeoutMsg: "Undo did not remove the added paragraph.",
    });
    await saveDocument();
    await waitForFile(
      fixture.scrollPath,
      (content) => content === original,
      "Undoing the added paragraph did not save the original file back.",
    );

    await selectFileMenuItem("Close document");
    await expect(editor).not.toExist();
    await openRecentPath(fixture.scrollPath);
    await expect($('[data-testid=active-document-host] [contenteditable="true"]')).toHaveText(
      expect.stringContaining("Last paragraph."),
    );
    expect(await editorBlocks()).toEqual(blocks);
    expect(await readFile(fixture.scrollPath, "utf8")).toBe(original);
    await closeAllDocuments();
  });
});
