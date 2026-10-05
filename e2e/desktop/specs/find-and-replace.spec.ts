import { $, $$, browser, expect } from "@wdio/globals";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { ARTIFACTS_DIR } from "../support/artifacts.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { dismissToasts, findMenuItem, openMenu, openRecentPath } from "../support/ui.js";

const panel = () => $('[data-testid="editor-search-panel"]');
const queryField = () => $('[data-testid="editor-search-panel"] input[aria-label="Find"]');
const replacementField = () =>
  $('[data-testid="editor-search-panel"] input[aria-label="Replace with"]');
const results = () => $('[data-testid="editor-search-results"]');
const documentState = () => $('[data-testid="status-bar-document-state"]');

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

const focusEditorAtStart = async () => {
  await $(".ProseMirror p").click();
  await pressKey("Home", { ctrlKey: true });
};

const isFocused = (selector: string) =>
  browser.execute((target) => document.activeElement?.matches(target) ?? false, selector);

const firstParagraphTop = () =>
  browser.execute(
    () => document.querySelector(".ProseMirror p")?.getBoundingClientRect().top ?? Number.NaN,
  );

const getSelectionText = () => browser.execute(() => document.getSelection()?.toString() ?? "");

const getOccurrenceTexts = () =>
  browser.execute(() =>
    Array.from(
      document.querySelectorAll(".leafdown-selection-occurrence"),
      (element) => element.textContent ?? "",
    ),
  );

// Selects the first `word` in the paragraph starting with `paragraphStart` through the DOM
// selection, which the editor reads as it reads a pointer or keyboard selection.
const selectWordInParagraph = (paragraphStart: string, word: string) =>
  browser.execute(
    (start, target) => {
      const paragraph = Array.from(document.querySelectorAll(".ProseMirror p")).find((element) =>
        element.textContent?.startsWith(start),
      );

      if (!paragraph) {
        return false;
      }

      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);

      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const offset = node.textContent?.indexOf(target) ?? -1;

        if (offset !== -1) {
          document.getSelection()?.setBaseAndExtent(node, offset, node, offset + target.length);
          return true;
        }
      }

      return false;
    },
    paragraphStart,
    word,
  );

const waitForOccurrenceCount = (count: number, timeoutMsg: string) =>
  browser.waitUntil(async () => (await getOccurrenceTexts()).length === count, { timeoutMsg });

// A selected match opens the source projection of the object it lies in, so the paragraph's text
// names which match holds the selection.
const getSelectedParagraphText = () =>
  browser.execute(
    () => document.getSelection()?.anchorNode?.parentElement?.closest("p")?.textContent ?? "",
  );

// The current match has to be inside the scrolled viewport and clear of the panel floating over it.
const getCurrentMatchPlacement = () =>
  browser.execute(() => {
    const current = document.querySelector(".leafdown-search-match--current");
    const viewport = document.querySelector(
      '[data-testid="document-surface-scroll-area"] [data-slot="scroll-area-viewport"]',
    );
    const searchPanel = document.querySelector('[data-testid="editor-search-panel"]');

    if (!current || !viewport || !searchPanel) {
      throw new Error("The current match, the document viewport, or the search panel is missing.");
    }

    const match = current.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    const surface = searchPanel.getBoundingClientRect();

    return {
      clearOfPanel: match.top >= surface.bottom || match.right <= surface.left,
      inView: match.top >= view.top && match.bottom <= view.bottom,
      scrollTop: viewport.scrollTop,
      text: current.textContent,
    };
  });

// A match is revealed on the frame after the move that made it current.
const waitForRevealedMatch = async () => {
  await browser.waitUntil(
    async () => {
      const placement = await getCurrentMatchPlacement();

      return placement.inView && placement.clearOfPanel;
    },
    { timeoutMsg: "The current match was not scrolled into view clear of the panel." },
  );

  return getCurrentMatchPlacement();
};

describe("desktop find and replace", () => {
  it("finds, steps, and closes from the keyboard, leaving the match selected", async () => {
    const { search } = await getDesktopE2ERunContext();

    await openRecentPath(search.path);
    await expect($(".ProseMirror")).toBeDisplayed();
    await dismissToasts();
    await focusEditorAtStart();

    const closedTop = await firstParagraphTop();

    expect(await pressKey("f", { ctrlKey: true })).toBe(true);
    await expect(panel()).toBeDisplayed();
    await browser.waitUntil(() => isFocused('input[aria-label="Find"]'), {
      timeoutMsg: "The query field did not take focus.",
    });
    expect(Math.abs((await firstParagraphTop()) - closedTop)).toBeLessThan(1);

    await queryField().setValue("lantern");
    await expect(results()).toHaveText("1 of 5");
    await expect($(".leafdown-search-match--current")).toHaveText("Lantern");

    await pressKey("Enter", { shiftKey: true });
    await expect(results()).toHaveText("5 of 5");

    const last = await waitForRevealedMatch();

    expect(last.text).toBe("lantern");
    expect(last.scrollTop).toBeGreaterThan(0);

    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "find-and-replace-last-match.png"));

    await pressKey("F3");
    await expect(results()).toHaveText("1 of 5");
    // The first match heads the document, so it can only clear the panel through the room the
    // open surface makes above the first line.
    expect((await waitForRevealedMatch()).text).toBe("Lantern");

    await pressKey("Enter");
    await pressKey("Enter");
    await expect(results()).toHaveText("3 of 5");
    expect(await isFocused('input[aria-label="Find"]')).toBe(true);

    await pressKey("Escape");
    await expect(panel()).not.toExist();
    expect(await isFocused(".ProseMirror")).toBe(true);
    expect(await getSelectionText()).toBe("lantern");
    expect(await getSelectedParagraphText()).toContain("**lantern**");
    await expect(documentState()).not.toExist();

    expect(await pressKey("F3")).toBe(true);
    await browser.waitUntil(
      async () =>
        (await getSelectedParagraphText()).includes("[lantern guide](https://example.com/lantern)"),
      { timeoutMsg: "Find next did not select the link's match with the surface closed." },
    );
    expect(await getSelectionText()).toBe("lantern");
    expect(await getSelectedParagraphText()).not.toContain("**lantern**");
    await expect(documentState()).not.toExist();
  });

  it("opens from the Edit menu with the query field focused", async () => {
    await openMenu("Edit");
    await (await findMenuItem((text) => text.startsWith("Find and replace"))).click();
    await (await findMenuItem((text) => text.startsWith("Find..."))).click();

    await expect(panel()).toBeDisplayed();
    await browser.waitUntil(() => isFocused('input[aria-label="Find"]'), {
      timeoutMsg: "The query field did not keep focus after the menu closed.",
    });
    await expect(queryField()).toHaveValue("lantern");

    await pressKey("Escape");
    await expect(panel()).not.toExist();
  });

  it("fits a narrow window without scrolling sideways", async () => {
    const originalWindowSize = await browser.getWindowSize();

    try {
      await browser.setWindowSize(640, 720);
      await focusEditorAtStart();
      await pressKey("h", { ctrlKey: true });
      await expect(replacementField()).toBeDisplayed();

      const layout = await browser.execute(() => {
        const searchPanel = document.querySelector<HTMLElement>(
          '[data-testid="editor-search-panel"]',
        );
        const surface = document.querySelector('[data-testid="document-surface-host"]');
        const query = document.querySelector('input[aria-label="Find"]');

        if (!searchPanel || !surface || !query) {
          throw new Error("The search panel or the document surface is missing.");
        }

        const panelRect = searchPanel.getBoundingClientRect();
        const surfaceRect = surface.getBoundingClientRect();

        return {
          fitsSurface: panelRect.left >= surfaceRect.left && panelRect.right <= surfaceRect.right,
          overflows: searchPanel.scrollWidth > searchPanel.clientWidth,
          queryWidth: query.getBoundingClientRect().width,
        };
      });

      expect(layout).toMatchObject({ fitsSurface: true, overflows: false });
      // Room for about a dozen characters of query.
      expect(layout.queryWidth).toBeGreaterThanOrEqual(96);

      await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "find-and-replace-narrow.png"));
      await pressKey("Escape");
    } finally {
      await browser.setWindowSize(originalWindowSize.width, originalWindowSize.height);
    }
  });

  it("highlights a selected word's other occurrences until Find takes over", async () => {
    await focusEditorAtStart();

    expect(await selectWordInParagraph("The first", "lantern")).toBe(true);
    await waitForOccurrenceCount(3, "The selected word's other occurrences were not highlighted.");
    expect(await getSelectionText()).toBe("lantern");
    expect(await getOccurrenceTexts()).toEqual(["lantern", "lantern", "lantern"]);
    // The selected word keeps the selection's own presentation.
    expect(
      await browser.execute(
        () =>
          Array.from(document.querySelectorAll(".ProseMirror p"))
            .find((element) => element.textContent?.startsWith("The first"))
            ?.querySelectorAll(".leafdown-selection-occurrence").length,
      ),
    ).toBe(0);

    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "find-and-replace-occurrences.png"));

    await pressKey("f", { ctrlKey: true });
    await expect(panel()).toBeDisplayed();
    await expect(results()).toHaveText("2 of 5");
    expect(await getOccurrenceTexts()).toEqual([]);
    await expect($$(".leafdown-search-match")).toBeElementsArrayOfSize(5);

    await pressKey("Escape");
    await expect(panel()).not.toExist();
    expect(await getSelectionText()).toBe("lantern");
    await waitForOccurrenceCount(3, "Closing Find did not restore the selection's occurrences.");

    await browser.execute(() => document.getSelection()?.collapseToEnd());
    await waitForOccurrenceCount(0, "Collapsing the selection did not clear its occurrences.");
    await expect(documentState()).not.toExist();
  });

  it("replaces one match and then every match as undoable edits", async () => {
    await focusEditorAtStart();
    await pressKey("h", { ctrlKey: true });
    await browser.waitUntil(() => isFocused('input[aria-label="Replace with"]'), {
      timeoutMsg: "The replacement field did not take focus.",
    });
    await expect(results()).toHaveText("1 of 5");

    await replacementField().setValue("beacon");
    await pressKey("Enter");
    await expect(results()).toHaveText("1 of 4");
    await expect($(".ProseMirror h1")).toHaveText("beacon notes");
    await expect(documentState()).toHaveText("Unsaved");

    await $('[data-testid="editor-search-panel"] button[aria-label="Replace all"]').click();
    await expect(results()).toHaveText("No results");
    expect((await $(".ProseMirror").getText()).toLowerCase()).not.toContain("lantern");
    await expect($(".ProseMirror a")).toHaveText("beacon guide");

    await pressKey("Escape");
    await pressKey("z", { ctrlKey: true });
    await browser.waitUntil(
      async () => (await $(".ProseMirror").getText()).includes("last lantern stands"),
      { timeoutMsg: "Undo did not restore every replaced match in one step." },
    );
    await expect($(".ProseMirror h1")).toHaveText("beacon notes");
  });
});
