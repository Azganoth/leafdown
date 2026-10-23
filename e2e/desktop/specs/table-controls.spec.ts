import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import {
  closeAllDocuments,
  dismissToasts,
  getSaveMenuItem,
  openRecentPath,
  selectFileMenuItem,
} from "../support/ui.js";

const TABLE_SELECTOR = "[data-testid=active-document-host] .ProseMirror table";
const ROW_GRIP_SELECTOR = '[data-leafdown-table-grip][data-axis="row"]';
const COLUMN_GRIP_SELECTOR = '[data-leafdown-table-grip][data-axis="column"]';
const ROW_INSERT_SELECTOR = '[data-leafdown-table-insert][data-axis="row"]';

interface Point {
  x: number;
  y: number;
}

const cellTexts = () =>
  browser.execute(
    (selector) =>
      Array.from(document.querySelector(selector)?.querySelectorAll("tr") ?? [], (row) =>
        Array.from(row.querySelectorAll("th, td"), (cell) => cell.textContent?.trim() ?? ""),
      ),
    TABLE_SELECTOR,
  );

const tableRect = () =>
  browser.execute((selector) => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    if (!rect) throw new Error("Table was not found.");
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, TABLE_SELECTOR);

// The center of a cell, counted from the header row.
const cellPoint = (row: number, col: number) =>
  browser.execute(
    (selector, rowIndex, colIndex) => {
      const rows = document.querySelector(selector)?.querySelectorAll("tr");
      const cell = rows?.[rowIndex]?.querySelectorAll("th, td")[colIndex];
      if (!cell) throw new Error(`Cell ${String(rowIndex)}, ${String(colIndex)} was not found.`);
      const rect = cell.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        right: rect.right,
      };
    },
    TABLE_SELECTOR,
    row,
    col,
  );

const controlPoint = (selector: string) =>
  browser.execute((controlSelector) => {
    const control = document.querySelector<HTMLElement>(controlSelector);
    if (!control || control.hidden) return null;
    const rect = control.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  }, selector);

const hover = (point: Point) =>
  browser
    .action("pointer")
    .move({ duration: 0, origin: "viewport", ...point })
    .perform();

const waitForControl = async (selector: string) => {
  let point: Point | null = null;
  await browser.waitUntil(async () => (point = await controlPoint(selector)) !== null, {
    timeoutMsg: `Table control did not show: ${selector}`,
  });
  return point!;
};

// The harness synthesizes pointer moves without a pressed button, so a press, a drag, and a
// release are dispatched on whatever is under each point, as a real mouse would hit it.
const dispatchPointerSequence = (steps: { type: string; point: Point; buttons: number }[]) =>
  browser.execute((sequence) => {
    for (const { type, point, buttons } of sequence) {
      const target = document.elementFromPoint(point.x, point.y) ?? document.body;
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons,
          clientX: point.x,
          clientY: point.y,
        }),
      );
    }
  }, steps);

const columnAlignments = () =>
  browser.execute(
    (selector) =>
      Array.from(document.querySelector(selector)?.querySelectorAll("tr") ?? [], (row) =>
        Array.from(row.querySelectorAll("th, td"), (cell) => getComputedStyle(cell).textAlign),
      ),
    TABLE_SELECTOR,
  );

const waitForColumnAlignments = (expected: string[], timeoutMsg: string) =>
  browser.waitUntil(
    async () =>
      (await columnAlignments()).every((row) => row.every((value, col) => value === expected[col])),
    { timeoutMsg },
  );

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

const runPaletteCommand = async (query: string, label: string) => {
  const input = $('input[aria-label="Search commands"]');
  expect(await pressKey("p", { ctrlKey: true, shiftKey: true })).toBe(true);
  await expect(input).toBeFocused();
  await input.setValue(query);
  await expect($('[role="option"]')).toHaveText(expect.stringContaining(label));
  await pressKey("Enter");
  await expect(input).not.toExist();
};

const clickGrip = async (cell: Point, selector: string) => {
  await hover(cell);
  const grip = await waitForControl(selector);
  await dispatchPointerSequence([
    { type: "mousedown", point: grip, buttons: 1 },
    { type: "mouseup", point: grip, buttons: 0 },
  ]);
};

describe("desktop table controls", () => {
  it("selects from a grip, reorders by dragging one, and inserts at a boundary", async () => {
    const { blocks } = await getDesktopE2ERunContext();
    await openRecentPath(blocks.path);
    await expect($(TABLE_SELECTOR)).toBeDisplayed();
    await dismissToasts();
    await browser.execute((selector) => {
      document.querySelector(selector)?.scrollIntoView({ block: "center" });
    }, TABLE_SELECTOR);
    expect(await cellTexts()).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);

    const before = await tableRect();
    await hover(await cellPoint(1, 0));
    const rowGrip = await waitForControl(ROW_GRIP_SELECTOR);
    await waitForControl(COLUMN_GRIP_SELECTOR);
    expect(await tableRect()).toEqual(before);
    expect(
      await browser.execute(
        (selectors) =>
          selectors.map((selector) => document.querySelector<HTMLElement>(selector)?.tabIndex),
        [ROW_GRIP_SELECTOR, COLUMN_GRIP_SELECTOR, ROW_INSERT_SELECTOR],
      ),
    ).toEqual([-1, -1, -1]);

    await dispatchPointerSequence([
      { type: "mousedown", point: rowGrip, buttons: 1 },
      { type: "mouseup", point: rowGrip, buttons: 0 },
    ]);
    await expect($("[data-testid='editor-context-popup']")).toBeDisplayed();
    await expect(
      $("[data-testid='editor-context-popup'] [aria-label='Delete row']"),
    ).toBeDisplayed();
    const popup = $("[data-testid='editor-context-popup']");
    await expect(popup.$("button=Row 1")).toHaveAttribute("aria-pressed", "true");
    await expect(popup.$("[aria-label='Add row below']")).toHaveText("");
    const dividerGap = await browser.execute(() => {
      const button = document.querySelector(
        "[data-testid='editor-context-popup'] [aria-label='Delete table']",
      );
      const divider =
        button?.parentElement?.parentElement?.querySelector("[data-slot='separator']");
      if (!button || !divider)
        throw new Error("The table delete control or its divider was not found.");
      return button.getBoundingClientRect().left - divider.getBoundingClientRect().right;
    });
    expect(dividerGap).toBeGreaterThanOrEqual(8);
    await popup.$("button=Columns 1–2").click();
    await expect(popup.$("[aria-label='Delete column']")).toBeDisplayed();
    await expect(popup.$("[aria-label='Delete row']")).not.toExist();
    await popup.$("button=Row 1").click();
    await expect(popup.$("[aria-label='Delete row']")).toBeDisplayed();
    expect(await tableRect()).toEqual(before);
    expect(
      await browser.execute(
        (selector) => document.querySelector(selector)?.querySelectorAll(".selectedCell").length,
        TABLE_SELECTOR,
      ),
    ).toBe(2);
    await browser.keys(Key.Escape);
    await expect($("[data-testid='editor-context-popup']")).not.toExist();

    await hover(await cellPoint(1, 0));
    const columnGrip = await waitForControl(COLUMN_GRIP_SELECTOR);
    const lastColumn = await cellPoint(1, 1);
    const drop = { x: Math.round(lastColumn.right - 4), y: lastColumn.y };
    await dispatchPointerSequence([
      { type: "mousedown", point: columnGrip, buttons: 1 },
      { type: "mousemove", point: { x: columnGrip.x + 20, y: columnGrip.y }, buttons: 1 },
      { type: "mousemove", point: drop, buttons: 1 },
      { type: "mouseup", point: drop, buttons: 0 },
    ]);
    await browser.waitUntil(async () => (await cellTexts())[0]?.[0] === "B", {
      timeoutMsg: "Dragging the column grip did not move the column.",
    });
    expect(await cellTexts()).toEqual([
      ["B", "A"],
      ["D", "C"],
    ]);
    await expect($("[data-testid='editor-context-popup']")).not.toExist();

    const lastRow = await cellPoint(1, 0);
    const table = await tableRect();
    await hover({ x: lastRow.x, y: Math.round(table.top + table.height - 4) });
    const rowInsert = await waitForControl(ROW_INSERT_SELECTOR);
    expect(Math.abs(rowInsert.y - (table.top + table.height))).toBeLessThanOrEqual(1);
    await dispatchPointerSequence([
      { type: "mousedown", point: rowInsert, buttons: 1 },
      { type: "mouseup", point: rowInsert, buttons: 0 },
      { type: "click", point: rowInsert, buttons: 0 },
    ]);
    await browser.waitUntil(async () => (await cellTexts()).length === 3, {
      timeoutMsg: "The row insertion button did not add a row.",
    });
    expect(await cellTexts()).toEqual([
      ["B", "A"],
      ["D", "C"],
      ["", ""],
    ]);
  });

  it("aligns columns from the popup and the command palette and saves the delimiter row", async () => {
    const { tableAlignment } = await getDesktopE2ERunContext();
    await closeAllDocuments();
    await openRecentPath(tableAlignment.path);
    await expect($(TABLE_SELECTOR)).toBeDisplayed();
    await dismissToasts();
    expect(await cellTexts()).toEqual([
      ["Plant", "Pots", "Notes"],
      ["Basil", "2", "Sunny"],
    ]);

    const popup = $("[data-testid='editor-context-popup']");

    // A whole row intersects every column, and row scope offers no alignment of its own.
    await clickGrip(await cellPoint(1, 0), ROW_GRIP_SELECTOR);
    await expect(popup.$("[aria-label='Delete row']")).toBeDisplayed();
    await expect(popup.$("[aria-label='Align center']")).not.toExist();
    await browser.keys(Key.Escape);
    await expect(popup).not.toExist();
    await runPaletteCommand("column alignment center", "Center");
    await waitForColumnAlignments(
      ["center", "center", "center"],
      "Center from the palette did not align every column of the selected row.",
    );

    await clickGrip(await cellPoint(1, 1), COLUMN_GRIP_SELECTOR);
    await expect(popup.$("[aria-label='Align center']")).toHaveAttribute("aria-pressed", "true");
    await expect(popup.$("[aria-label='Align right']")).toHaveAttribute("aria-pressed", "false");
    await popup.$("[aria-label='Align right']").click();
    await expect(popup).not.toExist();
    await waitForColumnAlignments(
      ["center", "right", "center"],
      "Align right did not align the column the grip selected.",
    );

    // Pressing the checked alignment again returns the column to the default.
    await clickGrip(await cellPoint(1, 1), COLUMN_GRIP_SELECTOR);
    await expect(popup.$("[aria-label='Align right']")).toHaveAttribute("aria-pressed", "true");
    await popup.$("[aria-label='Align right']").click();
    await expect(popup).not.toExist();
    await waitForColumnAlignments(
      ["center", "left", "center"],
      "Pressing the checked alignment did not return the column to the default.",
    );

    await browser.execute((selector) => {
      const cell = document.querySelector(selector)?.querySelectorAll("tr")[1]?.children[2];
      const editor = document.querySelector<HTMLElement>(
        "[data-testid=active-document-host] .ProseMirror",
      );
      if (!cell || !editor) throw new Error("The last body cell was not found.");
      const range = document.createRange();
      range.selectNodeContents(cell);
      range.collapse(false);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
    }, TABLE_SELECTOR);
    await runPaletteCommand("column alignment right", "Right");
    await waitForColumnAlignments(
      ["center", "left", "right"],
      "Right from the palette did not align the column holding the caret.",
    );

    const delimiterRow = /^\| :-+: \| -+ \| -+: \|$/mu;
    await (await getSaveMenuItem()).click();
    await browser.waitUntil(
      async () => delimiterRow.test(await readFile(tableAlignment.path, "utf8")),
      { timeoutMsg: "The saved delimiter row did not hold the chosen alignments." },
    );
    const saved = await readFile(tableAlignment.path, "utf8");
    expect(saved).toContain("Basil");
    expect(saved).toContain("Sunny");

    await selectFileMenuItem("Close document");
    await openRecentPath(tableAlignment.path);
    await expect($(TABLE_SELECTOR)).toBeDisplayed();
    await waitForColumnAlignments(
      ["center", "left", "right"],
      "The reopened table did not show the saved alignments.",
    );
  });
});
