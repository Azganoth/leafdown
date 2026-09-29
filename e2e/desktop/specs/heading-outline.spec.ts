import { $, $$, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath, selectFileMenuItem } from "../support/ui.js";

const outlineRows = () => $$('[data-testid="heading-outline-host"] button[data-outline-position]');
const selectedHeading = () =>
  browser.execute(
    () =>
      document.getSelection()?.anchorNode?.parentElement?.closest("h1,h2,h3,h4,h5,h6")
        ?.textContent ?? "",
  );
const getPlacement = () =>
  browser.execute(() => {
    const sidebar = document.querySelector('[data-testid="heading-outline-host"]');
    const editor = document.querySelector('[data-testid="document-surface-host"]');
    const viewport = document.querySelector(
      '[data-testid="document-surface-scroll-area"] [data-slot="scroll-area-viewport"]',
    );
    const heading = document.getSelection()?.anchorNode?.parentElement?.closest("h1");
    if (!sidebar || !editor || !viewport || !heading)
      throw new Error("Outline geometry is missing.");
    return {
      separated: sidebar.getBoundingClientRect().right <= editor.getBoundingClientRect().left,
      visible:
        heading.getBoundingClientRect().top >= viewport.getBoundingClientRect().top &&
        heading.getBoundingClientRect().bottom <= viewport.getBoundingClientRect().bottom,
      scrollTop: viewport.scrollTop,
    };
  });

describe("desktop heading outline", () => {
  it("navigates exact headings from a folderless document at a narrow window width", async () => {
    const { outline } = await getDesktopE2ERunContext();
    const original = await readFile(outline.path, "utf8");
    await $("aria/New document").click();
    await expect($('[data-testid="heading-outline-host"] p')).toHaveText(
      "No headings in this document.",
    );
    await expect($('[aria-label="Sidebar views"]')).not.toExist();

    await openRecentPath(outline.path);
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            document.querySelector(".ProseMirror")?.textContent?.includes("Paragraph 20") ?? false,
        ),
      { timeout: 15_000, timeoutMsg: "The saved document did not replace the untitled editor." },
    );
    await expect($(".ProseMirror")).toBeDisplayed();
    await $('[aria-label="Sidebar views"] button:last-child').click();
    await expect($('[data-testid="heading-outline-host"]')).toBeDisplayed();
    await browser.setWindowSize(640, 600);

    await browser.waitUntil(async () => (await outlineRows().length) === 4, {
      timeoutMsg: "The document outline did not show all four headings.",
    });
    const rows = await outlineRows().getElements();
    expect(await rows[0].getAttribute("aria-label")).toContain("Heading 1: Same");
    expect(await rows[1].getAttribute("aria-label")).toContain("Heading 3: Quoted");
    expect(await rows[2].getAttribute("aria-label")).toContain("Unordered list");
    expect(await rows[3].getAttribute("aria-label")).toContain("Heading 1: Same");
    expect(await rows[0].getAttribute("data-outline-position")).not.toBe(
      await rows[3].getAttribute("data-outline-position"),
    );

    await rows[3].click();
    expect(await selectedHeading()).toBe("Same");
    expect(await rows[3].getAttribute("aria-current")).toBe("location");
    await browser.waitUntil(async () => (await getPlacement()).visible, {
      timeoutMsg: "The selected heading was not scrolled into the document viewport.",
    });
    const placement = await getPlacement();
    expect(placement.separated).toBe(true);
    expect(placement.visible).toBe(true);
    expect(placement.scrollTop).toBeGreaterThan(0);

    const quotedPosition = await rows[1].getAttribute("data-outline-position");
    await browser.execute((position) => {
      document.querySelector<HTMLElement>(`[data-outline-position="${position}"]`)?.focus();
    }, quotedPosition);
    await browser.keys("Enter");
    await browser.waitUntil(async () => (await selectedHeading()) === "Quoted", {
      timeoutMsg: "Keyboard activation did not move the caret to the quoted heading.",
    });
    expect(await rows[1].getAttribute("aria-current")).toBe("location");
    const firstPosition = await rows[0].getAttribute("data-outline-position");
    await browser.execute((position) => {
      document.querySelector<HTMLElement>(`[data-outline-position="${position}"]`)?.focus();
    }, firstPosition);
    await browser.keys(" ");
    await browser.waitUntil(
      async () => (await rows[0].getAttribute("aria-current")) === "location",
      {
        timeoutMsg: "Space did not activate the first heading.",
      },
    );
    expect(await readFile(outline.path, "utf8")).toBe(original);

    await selectFileMenuItem("New");
    await expect($('[data-testid="heading-outline-host"] p')).toHaveText(
      "No headings in this document.",
    );
  });
});
