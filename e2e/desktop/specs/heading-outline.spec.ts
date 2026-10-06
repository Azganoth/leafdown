import { $, $$, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";

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
const markerState = () =>
  browser.execute(() => {
    const editor = document.querySelector(".ProseMirror");
    const heading = editor?.querySelector("h1");
    const selection = document.getSelection();
    return {
      focused: document.activeElement === editor,
      marker: heading?.getAttribute("data-leafdown-marker") ?? null,
      hover: heading?.hasAttribute("data-leafdown-marker-hover") ?? false,
      content: heading ? getComputedStyle(heading, "::before").content : null,
      anchorOffset: selection?.anchorOffset,
      focusOffset: selection?.focusOffset,
      anchorHeading:
        selection?.anchorNode?.parentElement?.closest("h1,h2,h3,h4,h5,h6")?.textContent ?? null,
      selectedMarker:
        selection?.anchorNode?.parentElement
          ?.closest("h1,h2,h3,h4,h5,h6")
          ?.getAttribute("data-leafdown-marker") ?? null,
      editorClass: editor?.className,
      documentFocused: document.hasFocus(),
    };
  });
const focusOpeningHeading = () =>
  browser.execute(() => document.querySelector<HTMLElement>(".ProseMirror")?.focus());
const blurEditor = () =>
  browser.execute(() =>
    document.querySelector<HTMLElement>('[data-slot="menubar-trigger"]')!.focus(),
  );
const movePointerAway = () => $("aria/File").moveTo();
const waitForHeadingText = (text: string) =>
  browser.waitUntil(
    () =>
      browser.execute(
        (value) => document.querySelector(".ProseMirror h1")?.textContent === value,
        text,
      ),
    { timeoutMsg: `The editor did not show the heading "${text}".` },
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
    const heading = document
      .getSelection()
      ?.anchorNode?.parentElement?.closest("h1,h2,h3,h4,h5,h6");
    if (!outline || !surface || !viewport || !heading)
      throw new Error("Outline geometry is missing.");
    const outlineRect = outline.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const headingTop = headingRect.top - viewportRect.top;
    return {
      insideSurface:
        outlineRect.left >= surfaceRect.left &&
        outlineRect.right <= surfaceRect.right &&
        outlineRect.top >= surfaceRect.top &&
        outlineRect.bottom <= surfaceRect.bottom,
      headingVisible: headingTop >= 0 && headingRect.bottom <= viewportRect.bottom,
      headingNearTop: headingTop >= 0 && headingTop <= 48,
      scrollTop: viewport.scrollTop,
    };
  }, OUTLINE);

describe("desktop heading outline", () => {
  beforeEach(async () => {
    await browser.tauri.execute(({ core }) =>
      core.invoke("plugin:window|set_focus", { label: "main" }),
    );
    await browser.waitUntil(() => browser.execute(() => document.hasFocus()), {
      timeoutMsg: "The desktop window did not receive focus.",
    });
  });

  it("keeps caret markers tied to focus across fresh opens and same-document reloads", async () => {
    const { outline } = await getDesktopE2ERunContext();
    const original = await readFile(outline.path, "utf8");
    try {
      await openRecentPath(outline.path);
      await expect($(".ProseMirror h1")).toHaveText("Same");
      await expect($('[data-slot="menubar-content"]')).not.toExist();
      await movePointerAway();
      await browser.waitUntil(async () => !(await markerState()).hover);

      expect(await markerState()).toMatchObject({ focused: false, marker: null, content: "none" });

      await focusOpeningHeading();
      await browser.waitUntil(async () => (await markerState()).marker === "H1", {
        timeoutMsg: `Focusing the editor did not show its heading marker: ${JSON.stringify(await markerState())}`,
      });
      const focusedSelection = await markerState();
      expect(focusedSelection).toMatchObject({ focused: true, anchorOffset: 0, focusOffset: 0 });

      await blurEditor();
      expect(await markerState()).toMatchObject({
        focused: false,
        marker: null,
        content: "none",
        anchorOffset: focusedSelection.anchorOffset,
        focusOffset: focusedSelection.focusOffset,
      });

      await focusOpeningHeading();
      await writeFile(outline.path, original.replace("# Same", "# Focused reload"));
      await browser.waitUntil(
        async () => (await $(".ProseMirror h1").getText()) === "Focused reload",
      );
      expect(await markerState()).toMatchObject({ focused: true, marker: "H1", anchorOffset: 0 });

      await blurEditor();
      await writeFile(outline.path, original.replace("# Same", "# Unfocused reload"));
      await browser.waitUntil(
        async () => (await $(".ProseMirror h1").getText()) === "Unfocused reload",
      );
      expect(await markerState()).toMatchObject({ focused: false, marker: null, content: "none" });

      await browser.execute(() => {
        const heading = document.querySelector(".ProseMirror h1")!;
        const rect = heading.getBoundingClientRect();
        heading.dispatchEvent(
          new MouseEvent("mousemove", {
            bubbles: true,
            clientX: rect.left - 20,
            clientY: rect.top + 10,
          }),
        );
      });
      await browser.waitUntil(async () => (await markerState()).hover);
      expect(await markerState()).toMatchObject({ focused: false, marker: null, content: '"H1"' });

      await browser.execute(() => {
        const heading = document.querySelector(".ProseMirror h1")!;
        const rect = heading.getBoundingClientRect();
        heading.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: rect.left - 20,
            clientY: rect.top + 10,
          }),
        );
      });
      await expect($(".ProseMirror h1")).toHaveAttribute("data-leafdown-fold", "folded");
      await blurEditor();
      await movePointerAway();
      await browser.waitUntil(async () => !(await markerState()).hover);
      expect(await markerState()).toMatchObject({ focused: false, marker: null, content: '"H1"' });
      await browser.execute(() =>
        document
          .querySelector(".leafdown-fold-indicator")!
          .dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
          ),
      );
      await expect($(".ProseMirror h1")).toHaveAttribute("data-leafdown-fold", "open");

      await expect($('[data-testid="status-bar-document-state"]')).not.toExist();
    } finally {
      await writeFile(outline.path, original);
    }
    await waitForHeadingText("Same");
  });

  it("navigates exact headings from the floating outline at a narrow window width", async () => {
    const { outline } = await getDesktopE2ERunContext();
    const original = await readFile(outline.path, "utf8");
    await browser.keys("Escape");
    await expect($('[data-slot="menubar-content"]')).not.toExist();
    await selectFileMenuItem("New");
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
    await browser.execute(
      (position) => {
        document.querySelector<HTMLElement>(`[data-outline-position="${position}"]`)!.click();
      },
      await rows[3].getAttribute("data-outline-position"),
    );
    expect(await selectedHeading()).toBe("Same");
    expect(await markerState()).toMatchObject({ focused: true, selectedMarker: "H1" });
    await browser.waitUntil(
      async () => (await rows[3].getAttribute("aria-current")) === "location",
      { timeoutMsg: "The chosen heading did not become current." },
    );
    // The last heading ends the document, so it cannot scroll up to the top of the view.
    const placement = await getPlacement();
    expect(placement.insideSurface).toBe(true);
    expect(placement.headingVisible).toBe(true);
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
    await browser.execute((position) => {
      document.querySelector<HTMLElement>(`[data-outline-position="${position}"]`)!.click();
    }, quotedPosition);
    await browser.waitUntil(async () => (await selectedHeading()) === "Quoted", {
      timeoutMsg: "Choosing the focused row did not move the caret to the quoted heading.",
    });
    await expect($(".ProseMirror h3")).toHaveAttribute("data-leafdown-marker", "H3");
    await browser.waitUntil(
      async () => (await rows[1].getAttribute("aria-current")) === "location",
      { timeoutMsg: "The quoted heading did not become current." },
    );
    expect((await getPlacement()).headingNearTop).toBe(true);

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
