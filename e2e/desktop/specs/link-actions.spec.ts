import { $, browser, expect } from "@wdio/globals";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, getSaveMenuItem, openMenu, openRecentPath } from "../support/ui.js";

const EDITOR = "[data-testid=active-document-host] .ProseMirror";
const POPUP = "[data-testid=editor-context-popup]";

interface CopyRecordingWindow extends Window {
  leafdownCopiedText?: string[];
}

const editorText = () => $(EDITOR).getText();

const placeCaretIn = (text: string, offset = 1) =>
  browser.execute(
    (selector, needle, needleOffset) => {
      const editor = document.querySelector<HTMLElement>(selector)!;
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();

      while (node && !node.textContent!.includes(needle)) node = walker.nextNode();

      editor.focus();
      window.getSelection()!.collapse(node, node!.textContent!.indexOf(needle) + needleOffset);
      document.dispatchEvent(new Event("selectionchange"));
    },
    EDITOR,
    text,
    offset,
  );

// The embedded driver drops Shift from F10, so raise the chord on the focused editor.
const openContextPopupFromKeyboard = async () => {
  await $(EDITOR).execute((editor) => {
    editor.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "F10", shiftKey: true }),
    );
  });
  await expect($(POPUP)).toBeDisplayed();
};

const focusedLabel = () =>
  browser.execute(() => document.activeElement?.getAttribute("aria-label") ?? null);

const pressKey = (key: string, init: KeyboardEventInit = {}) =>
  browser.execute(
    (eventKey, eventInit) => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: eventKey,
          ...eventInit,
        }),
      );
    },
    key,
    init,
  );

const chooseLinkFileFromEditMenu = async () => {
  await openMenu("Edit");
  await (await findMenuItem((text) => text === "Link")).click();
  await (await findMenuItem((text) => text === "Choose file...")).click();
};

describe("desktop link actions", () => {
  it("copies, repoints, and removes links from the popup, Edit menu, and palette", async () => {
    const { dialogResponsePath, linkActions } = await getDesktopE2ERunContext();
    const answerFileDialog = (answer: string | null) =>
      writeFile(dialogResponsePath, JSON.stringify(answer));

    await openRecentPath(linkActions.path);
    await expect($(EDITOR)).toHaveText(expect.stringContaining("the old plan"));

    // The host clipboard is shared by every window on the machine, so the copy is read where the
    // page hands it over.
    await browser.execute(() => {
      const copied: string[] = [];

      (window as CopyRecordingWindow).leafdownCopiedText = copied;
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: async (text: string) => {
          copied.push(text);
        },
      });
    });

    await placeCaretIn("old plan");
    await browser.waitUntil(async () => (await editorText()).includes("](old-plan.md#draft"), {
      timeoutMsg: "The caret did not open the link's source.",
    });

    await openContextPopupFromKeyboard();
    await browser.waitUntil(async () => (await focusedLabel()) === "Paste", {
      timeoutMsg: "The keyboard-opened popup did not take focus.",
    });

    for (const label of ["Copy destination", "Remove link", "Choose file..."]) {
      await pressKey("ArrowDown");
      expect(await focusedLabel()).toBe(label);
    }

    await pressKey("ArrowUp");
    await pressKey("ArrowUp");
    expect(await focusedLabel()).toBe("Copy destination");
    await $(`${POPUP} [aria-label="Copy destination"]`).click();

    await browser.waitUntil(
      async () =>
        (
          await browser.execute(() => (window as CopyRecordingWindow).leafdownCopiedText ?? [])
        ).includes("old-plan.md#draft"),
      { timeoutMsg: "Copy destination did not hand the link's destination to the clipboard." },
    );

    await answerFileDialog(null);
    await chooseLinkFileFromEditMenu();
    await browser.waitUntil(() => !existsSync(dialogResponsePath), {
      timeoutMsg: "Choose file did not ask for a file.",
    });
    await expect($(EDITOR)).toHaveText(expect.stringContaining("](old-plan.md#draft"));

    await answerFileDialog(linkActions.chosenPath);
    await chooseLinkFileFromEditMenu();
    await browser.waitUntil(() => !existsSync(dialogResponsePath), {
      timeoutMsg: "Choose file did not ask for the second file.",
    });

    await placeCaretIn("shared notes");
    await openContextPopupFromKeyboard();
    await expect($(`${POPUP} [aria-label="Choose file..."]`)).not.toExist();
    await $(`${POPUP} [aria-label="Remove link"]`).click();
    await expect($(POPUP)).not.toExist();

    await placeCaretIn(" too.", 0);
    await pressKey("p", { ctrlKey: true, shiftKey: true });

    const query = $('input[aria-label="Search commands"]');

    await expect(query).toBeFocused();
    await query.setValue("Remove link");
    await expect($('[role="option"][aria-selected="true"]')).toHaveText(
      expect.stringContaining("Edit › Link › Remove link"),
    );
    await pressKey("Enter");
    await expect(query).not.toExist();

    await (await getSaveMenuItem()).click();

    const expected = [
      "# Link actions",
      "",
      'Read [the old plan](code-collapse.md "Plan") before starting.',
      "",
      "See the shared notes and the target too.",
      "",
      "[notes]: https://example.com/notes",
      "",
    ].join("\n");

    await browser.waitUntil(async () => (await readFile(linkActions.path, "utf8")) === expected, {
      timeoutMsg: "The repointed link and the two removed links were not saved.",
    });
  });
});
