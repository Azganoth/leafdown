import { $, $$, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath, selectFileMenuItem } from "../support/ui.js";

const OUTLINE = '[data-testid="heading-outline"]';
const outlineRows = () => $$(`${OUTLINE} button[data-outline-position]`);
const isOutlineOpen = () =>
  browser.execute(
    (selector) => document.querySelector(selector)?.hasAttribute("data-open") ?? false,
    OUTLINE,
  );
const selectedHeading = () =>
  browser.execute(
    () =>
      document.getSelection()?.anchorNode?.parentElement?.closest("h1,h2,h3,h4,h5,h6")
        ?.textContent ?? "",
  );
// The WebDriver harness turns a pointer move into a bare `mousemove`, so hovering is dispatched as
// the pointer events a real mouse produces.
const hoverRow = (position: string | null) =>
  browser.execute((value) => {
    const row = document.querySelector(`[data-outline-position="${value}"]`);
    if (!row) throw new Error("Outline row is missing.");
    const rect = row.getBoundingClientRect();
    const init = {
      bubbles: true,
      composed: true,
      pointerType: "mouse",
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    row.dispatchEvent(new PointerEvent("pointerover", init));
    row.dispatchEvent(new PointerEvent("pointermove", init));
  }, position);
const leaveOutline = () =>
  browser.execute((selector) => {
    document.querySelector(`${selector} nav`)?.dispatchEvent(
      new PointerEvent("pointerout", {
        bubbles: true,
        composed: true,
        pointerType: "mouse",
        relatedTarget: document.querySelector(".ProseMirror"),
      }),
    );
  }, OUTLINE);
const getPlacement = () =>
  browser.execute((selector) => {
    const outline = document.querySelector(`${selector} nav`);
    const surface = document.querySelector('[data-testid="document-surface-host"]');
    const viewport = document.querySelector(
      '[data-testid="document-surface-scroll-area"] [data-slot="scroll-area-viewport"]',
    );
    const heading = document.getSelection()?.anchorNode?.parentElement?.closest("h1");
    if (!outline || !surface || !viewport || !heading)
      throw new Error("Outline geometry is missing.");
    const outlineRect = outline.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const headingTop = heading.getBoundingClientRect().top - viewportRect.top;
    return {
      insideSurface:
        outlineRect.left >= surfaceRect.left &&
        outlineRect.right <= surfaceRect.right &&
        outlineRect.top >= surfaceRect.top &&
        outlineRect.bottom <= surfaceRect.bottom,
      headingNearTop: headingTop >= 0 && headingTop <= 48,
      scrollTop: viewport.scrollTop,
    };
  }, OUTLINE);

describe("desktop heading outline", () => {
  it("navigates exact headings from the floating outline at a narrow window width", async () => {
    const { outline } = await getDesktopE2ERunContext();
    const original = await readFile(outline.path, "utf8");
    await $("aria/New document").click();
    await expect($(".ProseMirror")).toBeDisplayed();
    await expect($(OUTLINE)).not.toExist();

    await openRecentPath(outline.path);
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            document.querySelector(".ProseMirror")?.textContent?.includes("Paragraph 20") ?? false,
        ),
      { timeout: 15_000, timeoutMsg: "The saved document did not replace the untitled editor." },
    );
    await browser.setWindowSize(640, 600);

    await browser.waitUntil(async () => (await outlineRows().length) === 4, {
      timeoutMsg: "The document outline did not list all four headings.",
    });
    const rows = await outlineRows().getElements();
    expect(await rows[0].getAttribute("aria-label")).toBe("Heading 1: Same");
    expect(await rows[1].getAttribute("aria-label")).toContain("Heading 3: Quoted");
    expect(await rows[2].getAttribute("aria-label")).toContain("Unordered list");
    expect(await rows[3].getAttribute("aria-label")).toBe("Heading 1: Same");
    expect(await rows[0].getAttribute("data-outline-position")).not.toBe(
      await rows[3].getAttribute("data-outline-position"),
    );
    expect(await rows[0].getAttribute("aria-current")).toBe("location");

    await hoverRow(await rows[3].getAttribute("data-outline-position"));
    await browser.waitUntil(isOutlineOpen, { timeoutMsg: "Hovering did not open the outline." });
    await browser.waitUntil(async () => (await rows[3].getSize("width")) > 100, {
      timeoutMsg: "The open outline did not show heading titles.",
    });
    await rows[3].click();
    expect(await selectedHeading()).toBe("Same");
    await browser.waitUntil(
      async () => (await rows[3].getAttribute("aria-current")) === "location",
      { timeoutMsg: "The chosen heading did not become current." },
    );
    const placement = await getPlacement();
    expect(placement.insideSurface).toBe(true);
    expect(placement.headingNearTop).toBe(true);
    expect(placement.scrollTop).toBeGreaterThan(0);

    await leaveOutline();
    await browser.waitUntil(async () => !(await isOutlineOpen()), {
      timeoutMsg: "The outline did not close after the pointer left it.",
    });
    const quotedPosition = await rows[1].getAttribute("data-outline-position");
    await browser.execute((position) => {
      document.querySelector<HTMLElement>(`[data-outline-position="${position}"]`)?.focus();
    }, quotedPosition);
    await browser.waitUntil(isOutlineOpen, { timeoutMsg: "Focus did not open the outline." });
    // Synthesized keys are untrusted and never activate a button, so the focused row is chosen
    // with a click; component tests cover Enter.
    await rows[1].click();
    await browser.waitUntil(async () => (await selectedHeading()) === "Quoted", {
      timeoutMsg: "Choosing the focused row did not move the caret to the quoted heading.",
    });

    await hoverRow(await rows[0].getAttribute("data-outline-position"));
    await browser.waitUntil(isOutlineOpen, { timeoutMsg: "Hovering did not reopen the outline." });
    await $(`${OUTLINE} [aria-label="Show headings down to level 1"]`).click();
    await browser.waitUntil(async () => (await outlineRows().length) === 2, {
      timeoutMsg: "Choosing level 1 did not hide the deeper headings.",
    });
    await $(`${OUTLINE} [aria-label="Show headings down to level 3"]`).click();
    await browser.waitUntil(async () => (await outlineRows().length) === 4, {
      timeoutMsg: "Choosing level 3 did not list the deeper headings again.",
    });
    await leaveOutline();
    await browser.waitUntil(async () => !(await isOutlineOpen()), {
      timeoutMsg: "The outline did not close after the pointer left it.",
    });
    expect(await readFile(outline.path, "utf8")).toBe(original);

    await selectFileMenuItem("New");
    await expect($(OUTLINE)).not.toExist();
  });
});
