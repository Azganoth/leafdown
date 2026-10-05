import { $, $$, browser, expect } from "@wdio/globals";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { ARTIFACTS_DIR } from "../support/artifacts.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { dismissToasts, findMenuItem, openMenu, openRecentPath } from "../support/ui.js";

const panel = () => $('[data-testid="folder-search-panel"]');
const queryField = () =>
  $('[data-testid="folder-search-panel"] input[aria-label="Search in folder"]');
const replacementField = () =>
  $('[data-testid="folder-search-panel"] input[aria-label="Replace with"]');
const status = () => $('[data-testid="folder-search-status"]');
const replaceReport = () => $('[data-testid="folder-replace-report"]');
const resultRows = () => $$('[data-testid="folder-search-panel"] [role="treeitem"]');
const documentState = () => $('[data-testid="status-bar-document-state"]');
const unsavedPrompt = () => $('[data-slot="dialog-content"][data-open]');

// The WebDriver bridge drops held modifiers from synthetic keys, so chords are dispatched whole to
// the element that holds focus, where the application's listeners hear them as the keyboard's.
const pressKey = (key: string, init: KeyboardEventInit = {}) =>
  browser.execute(
    (eventKey, eventInit) => {
      const target = document.activeElement ?? document.body;
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: eventKey,
        ...eventInit,
      });

      target.dispatchEvent(event);

      return event.defaultPrevented;
    },
    key,
    init,
  );

const findInFolder = () => pressKey("F", { ctrlKey: true, shiftKey: true });

const replaceInFolder = () => pressKey("H", { ctrlKey: true, shiftKey: true });

const isFocused = (selector: string) =>
  browser.execute((target) => document.activeElement?.matches(target) ?? false, selector);

const focusedRowLabel = () =>
  browser.execute(() => {
    const row = document.activeElement?.closest(
      '[data-testid="folder-search-panel"] [role="treeitem"]',
    );

    return row ? (row.getAttribute("aria-label") ?? row.textContent ?? "") : null;
  });

// A chosen match is drawn while focus stays in the results, and has to lie inside the scrolled
// document view.
const getChosenMatch = () =>
  browser.execute(() => {
    const chosen = Array.from(document.querySelectorAll(".leafdown-search-match--chosen"));
    const viewport = document.querySelector(
      '[data-testid="document-surface-scroll-area"] [data-slot="scroll-area-viewport"]',
    );

    if (chosen.length === 0 || !viewport) {
      return null;
    }

    const first = chosen[0].getBoundingClientRect();
    const last = chosen.at(-1)!.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();

    return {
      inView: first.top >= view.top && last.bottom <= view.bottom,
      paragraph: chosen[0].closest("p")?.textContent ?? "",
      scrollTop: viewport.scrollTop,
      text: chosen.map((element) => element.textContent).join(""),
    };
  });

const waitForChosenMatch = async (paragraphText: string) => {
  await browser.waitUntil(
    async () => {
      const chosen = await getChosenMatch();

      return chosen?.inView === true && chosen.paragraph.includes(paragraphText);
    },
    { timeoutMsg: `The match in "${paragraphText}" was not chosen and scrolled into view.` },
  );

  return (await getChosenMatch())!;
};

// Rows are positioned by the virtual list, so two rows drawn at one height would read as one.
const expectRowsInPlace = async (screenshot: string) => {
  const rows = await browser.execute(() =>
    Array.from(
      document.querySelectorAll('[data-testid="folder-search-panel"] [role="treeitem"]'),
      (row) => ({ text: row.textContent ?? "", top: Math.round(row.getBoundingClientRect().top) }),
    ),
  );
  const tops = rows.map(({ top }) => top);

  if (new Set(tops).size !== tops.length) {
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, screenshot));
    throw new Error(`Folder search rows overlap: ${JSON.stringify(rows)}`);
  }
};

const searchFor = async (query: string, outcome: string) => {
  await queryField().setValue(query);
  await browser.waitUntil(async () => (await status().getText()) === outcome, {
    timeoutMsg: `The folder search did not settle on "${outcome}".`,
  });
};

describe("desktop folder search", () => {
  it("searches the folder from the keyboard and opens a match while focus stays in the results", async () => {
    const { folderSearch } = await getDesktopE2ERunContext();

    await openRecentPath(folderSearch.folderPath);
    await expect($('[role="tree"]')).toBeDisplayed();
    await dismissToasts();

    expect(await findInFolder()).toBe(true);
    await expect(panel()).toBeDisplayed();
    await browser.waitUntil(() => isFocused('input[aria-label="Search in folder"]'), {
      timeoutMsg: "The query field did not take focus.",
    });

    await searchFor("lantern", "4 results in 2 files");
    await expect($("aria/1 file skipped")).toBeDisplayed();

    const labels: (string | null)[] = [];

    for (const row of await resultRows().getElements()) {
      labels.push(await row.getAttribute("aria-label"));
    }

    expect(labels.filter(Boolean)).toEqual([
      `notes${path.sep}beta.md, 2 results`,
      "alpha.md, 2 results",
    ]);

    await pressKey("ArrowDown");
    expect(await focusedRowLabel()).toBe(`notes${path.sep}beta.md, 2 results`);

    await pressKey("ArrowDown");
    await pressKey("ArrowDown");
    await pressKey("Enter");

    await expect($('[contenteditable="true"]')).toBeDisplayed();

    const far = await waitForChosenMatch("The last lantern stands at the end.");

    expect(far.text).toBe("lantern");
    expect(far.scrollTop).toBeGreaterThan(0);
    expect(await focusedRowLabel()).toContain("The last lantern stands at the end.");

    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "folder-search-chosen-match.png"));

    await pressKey("Escape");
    await expect(panel()).not.toExist();
    await expect($('[role="tree"][aria-label="Articles"]')).toBeDisplayed();
    expect(await isFocused(".ProseMirror")).toBe(true);
    expect(await browser.execute(() => document.getSelection()?.toString() ?? "")).toBe("lantern");
  });

  it("keeps unsaved edits and the results when switching documents is declined", async () => {
    const { folderSearch } = await getDesktopE2ERunContext();
    const farMarkdown = await readFile(folderSearch.farPath, "utf8");

    // Where the typed text lands depends on the harness, so the editor's own text decides how many
    // matches the unsaved document holds.
    await $('[contenteditable="true"]').addValue("Unsaved ");
    await expect(documentState()).toHaveText("Unsaved");

    const editorText = await $('[contenteditable="true"]').getText();
    const unsavedMatches = editorText.match(/lantern/giu)?.length ?? 0;

    await findInFolder();
    await expect(panel()).toBeDisplayed();
    await expect(queryField()).toHaveValue("lantern");
    await browser.waitUntil(
      async () => (await status().getText()) === `${unsavedMatches + 2} results in 2 files`,
      { timeoutMsg: "The folder search did not count the unsaved document's text." },
    );

    await pressKey("ArrowDown");
    await pressKey("End");
    expect(await focusedRowLabel()).toContain("in two pieces.");

    const rowCount = await resultRows().length;

    await pressKey("Enter");
    await expect(unsavedPrompt()).toBeDisplayed();
    await browser.keys("Escape");
    await expect(unsavedPrompt()).not.toExist();

    await expect(documentState()).toHaveText("Unsaved");
    expect(await $('[contenteditable="true"]').getText()).toBe(editorText);
    expect(await resultRows().length).toBe(rowCount);

    await (await resultRows().getElements())[rowCount - 1].click();
    await expect(unsavedPrompt()).toBeDisplayed();
    await $("aria/Discard changes").click();

    const pieces = await waitForChosenMatch("in two pieces.");

    expect(pieces.text).toBe("lantern");
    await expect(documentState()).not.toExist();
    expect(await readFile(folderSearch.farPath, "utf8")).toBe(farMarkdown);

    // The discarded document is read from its file again, which adds back the match the edit took.
    await browser.waitUntil(async () => (await status().getText()) === "4 results in 2 files", {
      timeoutMsg: "The folder search did not read the discarded document from its file again.",
    });
    await expectRowsInPlace("folder-search-rows-after-switch.png");
  });

  it("fits a narrow window without scrolling sideways", async () => {
    const originalWindowSize = await browser.getWindowSize();

    try {
      await browser.setWindowSize(640, 720);
      await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "folder-search-narrow.png"));

      const layout = await browser.execute(() => {
        const searchPanel = document.querySelector<HTMLElement>(
          '[data-testid="folder-search-panel"]',
        );
        const query = document.querySelector('input[aria-label="Search in folder"]');
        const sidebar = document.querySelector('[data-testid="article-navigator-host"]');
        const rows = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-testid="folder-search-panel"] [role="treeitem"]',
          ),
        );

        if (!searchPanel || !query || !sidebar || rows.length === 0) {
          throw new Error("The folder search panel, its query, or its results are missing.");
        }

        return {
          overflows: searchPanel.scrollWidth > searchPanel.clientWidth,
          panelWidth: searchPanel.getBoundingClientRect().width,
          queryWidth: query.getBoundingClientRect().width,
          rowsFit: rows.every((row) => row.scrollWidth <= row.clientWidth + 1),
          sidebarWidth: sidebar.getBoundingClientRect().width,
          windowWidth: window.innerWidth,
        };
      });

      if (layout.overflows || !layout.rowsFit || layout.queryWidth < 80) {
        throw new Error(`The folder search view does not fit: ${JSON.stringify(layout)}`);
      }
    } finally {
      await browser.setWindowSize(originalWindowSize.width, originalWindowSize.height);
    }

    await pressKey("Escape");
    await expect(panel()).not.toExist();
  });

  it("replaces across the folder only once the preview is applied, through the open document's editor", async () => {
    const { folderSearch } = await getDesktopE2ERunContext();
    const nearMarkdown = await readFile(folderSearch.nearPath, "utf8");
    const farMarkdown = await readFile(folderSearch.farPath, "utf8");

    await dismissToasts();
    expect(await replaceInFolder()).toBe(true);
    await expect(panel()).toBeDisplayed();
    await expect(queryField()).toHaveValue("lantern");
    await browser.waitUntil(() => isFocused('input[aria-label="Replace with"]'), {
      timeoutMsg: "The replacement field did not take focus.",
    });

    await replacementField().setValue("lamp");
    await browser.waitUntil(
      async () => (await status().getText()) === "4 replacements in 2 files",
      { timeoutMsg: "The replacement was not planned." },
    );
    expect(await $('[data-testid="folder-search-panel"] del').getText()).toBe("lantern");
    expect(await $('[data-testid="folder-search-panel"] ins').getText()).toBe("lamp");
    expect(await readFile(folderSearch.nearPath, "utf8")).toBe(nearMarkdown);
    expect(await readFile(folderSearch.farPath, "utf8")).toBe(farMarkdown);

    await $('[data-testid="folder-search-panel"]').$("aria/Replace all").click();
    await browser.waitUntil(
      async () =>
        (await replaceReport().isExisting()) &&
        (await replaceReport().getText()).includes("Replaced 4 matches in 2 files."),
      { timeoutMsg: "The replacement did not report its outcome." },
    );

    // The open document, left on the near file by the previous case, is replaced in its editor and
    // saved. The bold half of the split match carries over, as Replace all keeps the formatting
    // the replaced text starts with.
    expect(await readFile(folderSearch.nearPath, "utf8")).toBe(
      "# Alpha\n\nThe lamp hangs by the door.\n\nA **lamp** in two pieces.\n",
    );
    // The far file is not open, so only its replaced lines change and it keeps the blank line it
    // ends with, which Save would drop.
    expect(await readFile(folderSearch.farPath, "utf8")).toBe(
      farMarkdown.replaceAll("lantern", "lamp"),
    );
    await expect(documentState()).not.toExist();
    expect(await $('[contenteditable="true"]').getText()).toContain("The lamp hangs by the door.");
    await browser.waitUntil(async () => (await status().getText()) === "Nothing to replace", {
      timeoutMsg: "The folder was not planned again after the replacement.",
    });

    // Leafdown's own writes are not taken for changes made outside it.
    await browser.pause(1_000);
    expect(await $("aria/Reloaded from disk").isExisting()).toBe(false);
    expect(await $("aria/File changed on disk").isExisting()).toBe(false);

    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "folder-replace-report.png"));

    await pressKey("Escape");
    await expect(panel()).not.toExist();
  });

  it("opens from the Edit menu with the query field focused", async () => {
    await openMenu("Edit");
    await (await findMenuItem((text) => text.startsWith("Find and replace"))).click();
    await (await findMenuItem((text) => text.startsWith("Find in folder..."))).click();

    await expect(panel()).toBeDisplayed();
    await browser.waitUntil(() => isFocused('input[aria-label="Search in folder"]'), {
      timeoutMsg: "The query field did not keep focus after the menu closed.",
    });

    await pressKey("Escape");
    await expect(panel()).not.toExist();
  });
});
