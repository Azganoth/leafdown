// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  setSelectionInTableCell,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

const mountEditor = setupMilkdownEditorMount();

const TWO_TABLE_MARKDOWN = [
  "Intro",
  "| Name | Notes |\n| - | - |\n| a | b |",
  "Between",
  "| Key | Longer value |\n| - | - |\n| c | d |",
].join("\n\n");

// A cell sizes itself to its text unless its table holds a fit, in which case it reports the
// fitted width. Each read records how many tables were fitted at that moment.
let scale = 1;
let fittedTablesAtReads: number[] = [];

const getNaturalWidth = (cell: Element) => scale * (40 + 10 * (cell.textContent ?? "").length);

beforeEach(() => {
  scale = 1;
  fittedTablesAtReads = [];
  const getBoundingClientRect = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (!(this instanceof HTMLTableCellElement)) {
      return getBoundingClientRect.call(this);
    }

    fittedTablesAtReads.push(document.querySelectorAll("table colgroup").length);
    const col = this.closest("table")?.querySelector("colgroup")?.children[this.cellIndex];
    const width = col instanceof HTMLElement ? parseFloat(col.style.width) : getNaturalWidth(this);

    return new DOMRect(0, 0, width, 28);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const getTables = (mounted: MountedMilkdownEditor) => [
  ...mounted.view.dom.querySelectorAll("table"),
];

const getFittedWidths = (table: HTMLTableElement) =>
  table.hasAttribute("data-leafdown-table-columns")
    ? [...(table.querySelector("colgroup")?.children ?? [])].map(
        (col) => (col as HTMLElement).style.width,
      )
    : null;

const getNaturalWidths = (table: HTMLTableElement) =>
  [...(table.querySelector("tbody tr")?.children ?? [])].map(
    (cell) => `${String(getNaturalWidth(cell))}px`,
  );

const settleAnimationFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

describe("table columns plugin", () => {
  it("fits every table to its first row, reading all of them before fitting any", async () => {
    const mounted = await mountEditor(TWO_TABLE_MARKDOWN);
    const [first, second] = getTables(mounted);

    expect(getFittedWidths(first)).toEqual(["80px", "90px"]);
    expect(getFittedWidths(second)).toEqual(["70px", "160px"]);
    expect(fittedTablesAtReads).toEqual([0, 0, 0, 0]);
  });

  it("holds the table with the caret and refits it once the caret leaves", async () => {
    const mounted = await mountEditor(TWO_TABLE_MARKDOWN);
    const [first, second] = getTables(mounted);
    const fittedSecond = getFittedWidths(second);

    mounted.view.focus();
    setSelectionInTableCell(mounted, 0, 0);
    typeText(mounted.view, "123");

    expect(getNaturalWidths(first)).toEqual(["110px", "90px"]);
    expect(getFittedWidths(first)).toEqual(["80px", "90px"]);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Intro"));

    expect(getFittedWidths(first)).toEqual(["110px", "90px"]);
    expect(getFittedWidths(second)).toEqual(fittedSecond);
  });

  it("refits every table but the held one when the editor resizes", async () => {
    const observers: { callback: () => void; observed: Set<Element> }[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private readonly entry: (typeof observers)[number];

        constructor(callback: () => void) {
          this.entry = { callback, observed: new Set() };
          observers.push(this.entry);
        }

        observe(element: Element) {
          this.entry.observed.add(element);
        }

        unobserve(element: Element) {
          this.entry.observed.delete(element);
        }

        disconnect() {
          this.entry.observed.clear();
        }
      },
    );
    const mounted = await mountEditor(`${TWO_TABLE_MARKDOWN}\n\n| X | Y |\n| - | - |\n| e | f |`);
    const [first, second, third] = getTables(mounted);
    mounted.view.focus();
    setSelectionInTableCell(mounted, 0, 0);
    Object.defineProperty(mounted.view.dom, "clientWidth", { configurable: true, value: 800 });
    scale = 2;
    fittedTablesAtReads = [];

    for (const { callback, observed } of observers) {
      if (observed.has(mounted.view.dom)) callback();
    }
    await settleAnimationFrame();

    expect(getFittedWidths(first)).toEqual(["80px", "90px"]);
    expect(getFittedWidths(second)).toEqual(getNaturalWidths(second));
    expect(getFittedWidths(third)).toEqual(getNaturalWidths(third));
    expect(getFittedWidths(second)).toEqual(["140px", "320px"]);
    expect(fittedTablesAtReads).toEqual([1, 1, 1, 1]);
  });
});
