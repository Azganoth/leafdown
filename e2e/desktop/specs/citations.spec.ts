import { $, $$, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, openMenu, openRecentPath, selectFileMenuItem } from "../support/ui.js";

const GROUP = "[see @doe2026, pp. 4-6]";
const MULTILINE_GROUP = "[-@roe2024;\n@smith2025]";

const citations = () => $$('[data-type="citation"]');

// Projected citation source is split into pieces by its marker and key styling, so its text and the
// caret's offset in it are read across every piece.
const readProjection = () =>
  browser.execute(() => {
    const pieces = [...document.querySelectorAll('[data-leafdown-source~="citation"]')];
    const selection = window.getSelection();
    const focus = selection?.focusNode;
    let caret: number | null = null;
    if (pieces[0] && selection?.isCollapsed && focus && pieces[0].closest("p")?.contains(focus)) {
      const range = document.createRange();
      range.setStart(pieces[0], 0);
      range.setEnd(focus, selection.focusOffset);
      caret = Math.min(
        range.toString().length,
        pieces.map((piece) => piece.textContent).join("").length,
      );
    }
    return { caret, text: pieces.map((piece) => piece.textContent).join("") };
  });

const waitForProjection = (text: string) =>
  browser.waitUntil(async () => (await readProjection()).text === text, {
    timeoutMsg: `Projected citation source did not become ${text}.`,
  });

const pressCitation = (index: number) =>
  browser.execute((position) => {
    const node = document.querySelectorAll('[data-type="citation"]')[position];
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }));
  }, index);

// The harness's keys are untrusted, so native caret motion never runs; the caret is placed where an
// arrow key would leave it, and the selection change is what the editor answers.
const placeCaretBeside = (index: number, side: "before" | "after") =>
  browser.execute(
    (position, edge) => {
      const node = document.querySelectorAll('[data-type="citation"]')[position];
      const neighbour = edge === "before" ? node.previousSibling! : node.nextSibling!;
      const range = document.createRange();
      range.setStart(neighbour, edge === "before" ? neighbour.textContent!.length : 0);
      range.collapse(true);
      node.closest<HTMLElement>(".ProseMirror")!.focus();
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    },
    index,
    side,
  );

const leaveProjection = () =>
  browser.execute(() => {
    const paragraph = document.querySelectorAll(".ProseMirror > p")[1];
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });

const save = () => browser.keys([Key.Ctrl, "s", Key.NULL]);

const waitForFile = (path: string, content: string, timeoutMsg: string) =>
  browser.waitUntil(async () => (await readFile(path, "utf8")) === content, { timeoutMsg });

describe("desktop citations", () => {
  it("names each group as a citation and leaves escaped text alone", async () => {
    const { citations: fixture } = await getDesktopE2ERunContext();
    await openRecentPath(fixture.path);

    await expect(citations()).toBeElementsArrayOfSize(2);
    expect(
      await browser.execute(() =>
        [...document.querySelectorAll<HTMLElement>('[data-type="citation"]')].map((node) => ({
          label: node.getAttribute("aria-label"),
          role: node.getAttribute("role"),
          text: node.textContent,
          whiteSpace: getComputedStyle(node).whiteSpace,
        })),
      ),
    ).toEqual([
      {
        label: `Citation ${GROUP}`,
        role: "doc-biblioref",
        text: GROUP,
        whiteSpace: "pre-wrap",
      },
      {
        label: "Citation [-@roe2024; @smith2025]",
        role: "doc-biblioref",
        text: MULTILINE_GROUP,
        whiteSpace: "pre-wrap",
      },
    ]);
    expect(await $(".ProseMirror").getText()).toContain("Literal [@doe2026] stays text.");
  });

  it("enters a group from either side and from a press, and restores it untouched", async () => {
    await placeCaretBeside(0, "before");
    await waitForProjection(GROUP);
    expect((await readProjection()).caret).toBe(0);
    await leaveProjection();
    await expect(citations()).toBeElementsArrayOfSize(2);

    await placeCaretBeside(0, "after");
    await waitForProjection(GROUP);
    expect((await readProjection()).caret).toBe(GROUP.length);
    await leaveProjection();

    await pressCitation(1);
    await waitForProjection(MULTILINE_GROUP);
    await leaveProjection();
    await expect(citations()).toBeElementsArrayOfSize(2);
  });

  it("saves an edit, then Undo and a second save restore the file", async () => {
    const { citations: fixture } = await getDesktopE2ERunContext();
    const original = await readFile(fixture.path, "utf8");

    await pressCitation(0);
    await waitForProjection(GROUP);
    await $(".ProseMirror").addValue("z");
    await waitForProjection("[zsee @doe2026, pp. 4-6]");
    await save();
    const edited = original.replace(GROUP, "[zsee @doe2026, pp. 4-6]");
    await waitForFile(fixture.path, edited, "The edited citation was not saved as its source.");

    await leaveProjection();
    await openMenu("Edit");
    await (await findMenuItem((text) => text.startsWith("Undo"))).click();
    // Undo returns the group to the source it was written as, open where the edit was made.
    await waitForProjection(GROUP);
    await save();
    await waitForFile(fixture.path, original, "Undo did not save the original source back.");
    await leaveProjection();
    await expect(citations()).toBeElementsArrayOfSize(2);
    expect(
      await browser.execute(() => document.querySelector('[data-type="citation"]')?.textContent),
    ).toBe(GROUP);
  });

  it("keeps a broken group as literal text through save and reopen", async () => {
    const { citations: fixture } = await getDesktopE2ERunContext();
    const original = await readFile(fixture.path, "utf8");

    await pressCitation(0);
    await waitForProjection(GROUP);
    await browser.keys(Key.Backspace);
    await leaveProjection();
    await expect(citations()).toBeElementsArrayOfSize(1);
    await save();
    const literal = original.replace(GROUP, GROUP.slice(1));
    await waitForFile(fixture.path, literal, "The broken group was not saved as literal text.");

    await selectFileMenuItem("Close document");
    await openRecentPath(fixture.path);
    await expect(citations()).toBeElementsArrayOfSize(1);
    expect(await readFile(fixture.path, "utf8")).toBe(literal);
  });
});
