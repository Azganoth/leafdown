import { $, $$, browser, expect } from "@wdio/globals";
import { Key } from "webdriverio";

import { waitForDiagnosticRecord } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { getSaveMenuItem, openMenu, openRecentPath } from "../support/ui.js";

describe("desktop Help pages", () => {
  it("reads bundled pages in a narrow window and restores focus", async () => {
    const { document: fixtureDocument } = await getDesktopE2ERunContext();
    await openRecentPath(fixtureDocument.path);
    const editor = $('[data-testid=active-document-host] [contenteditable="true"]');
    await editor.click();
    await browser.keys([Key.Ctrl, Key.End, Key.NULL]);
    await editor.addValue(" Help draft");
    const selectionBeforeHelp = await browser.execute(() => ({
      offset: document.getSelection()?.anchorOffset,
      text: document.getSelection()?.anchorNode?.textContent,
    }));
    await expect(await getSaveMenuItem()).not.toHaveAttribute("data-disabled");
    await browser.keys("Escape");

    await browser.setWindowSize(640, 480);
    await openMenu("Help");
    await $("aria/Getting started").click();

    await expect($("[role='dialog']")).toBeDisplayed();
    await expect($("[data-slot='dialog-title']")).toHaveText("Getting started");
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const viewport = document
            .querySelector("[role='dialog'] article")
            ?.closest('[role="dialog"]')
            ?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
          return Boolean(
            viewport && viewport.clientHeight > 0 && viewport.scrollHeight > viewport.clientHeight,
          );
        }),
      { timeoutMsg: "Help content did not become scrollable." },
    );
    const layout = await browser.execute(() => {
      const dialog = document
        .querySelector("[role='dialog'] article")
        ?.closest<HTMLElement>('[role="dialog"]');
      const viewport = dialog?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      return {
        dialogBottom: dialog?.getBoundingClientRect().bottom ?? 0,
        viewportHeight: viewport?.clientHeight ?? 0,
        contentHeight: viewport?.scrollHeight ?? 0,
        windowHeight: window.innerHeight,
      };
    });
    expect(layout.dialogBottom).toBeLessThanOrEqual(layout.windowHeight);
    expect(layout.viewportHeight).toBeGreaterThan(0);
    expect(layout.contentHeight).toBeGreaterThan(layout.viewportHeight);
    const scrolling = await browser.execute(() => {
      const viewport = document
        .querySelector("[role='dialog'] article")
        ?.closest('[role="dialog"]')
        ?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (!viewport) {
        return null;
      }
      const before = viewport.scrollTop;
      viewport.scrollTop = viewport.scrollHeight;
      return {
        before,
        after: viewport.scrollTop,
        clientHeight: viewport.clientHeight,
        scrollHeight: viewport.scrollHeight,
        overflowY: getComputedStyle(viewport).overflowY,
        parentOverflowY: getComputedStyle(viewport.parentElement!).overflowY,
      };
    });
    if (!scrolling || scrolling.after <= 0) {
      throw new Error(`Help did not scroll: ${JSON.stringify(scrolling)}`);
    }

    await $("article").$("button=Markdown reference").click();
    await expect($("[data-slot='dialog-title']")).toHaveText("Markdown reference");
    await expect($("article pre")).toBeDisplayed();
    expect(await browser.getUrl()).not.toContain("github.com");

    await $("article").$("button=Specification").scrollIntoView();
    await $("article").$("button=Specification").click();
    await waitForDiagnosticRecord(
      (record) =>
        record.event === "desktopE2eOpenerSuppressed" &&
        record.command === "openUrl" &&
        record.request === "https://github.com/Azganoth/leafdown/blob/main/docs/specification.md",
    );
    expect(await browser.getUrl()).not.toContain("github.com");

    await browser.keys("Escape");
    await expect($("article")).not.toExist();
    expect(await browser.execute(() => document.activeElement?.textContent?.trim())).toBe("Help");
    await expect(editor).toHaveText(expect.stringContaining("Help draft"));
    await expect(await getSaveMenuItem()).not.toHaveAttribute("data-disabled");
    await browser.keys("Escape");
    const selectionAfterHelp = await browser.execute(() => {
      document
        .querySelector<HTMLElement>('[data-testid=active-document-host] [contenteditable="true"]')
        ?.focus();
      return {
        offset: document.getSelection()?.anchorOffset,
        text: document.getSelection()?.anchorNode?.textContent,
      };
    });
    expect(selectionAfterHelp).toEqual(selectionBeforeHelp);
    await browser.keys([Key.Ctrl, "z", Key.NULL]);
    await expect(editor).not.toHaveText(expect.stringContaining("Help draft"));
  });

  for (const dark of [false, true]) {
    for (const width of [640, 1280]) {
      for (const page of [
        "Getting started",
        "Markdown reference",
        "File and folder workflows",
        "Settings reference",
      ]) {
        it(`keeps ${page} illustrations and examples within the page at ${width}px in ${dark ? "dark" : "light"} appearance`, async () => {
          const originallyDark = await browser.execute(() =>
            document.documentElement.classList.contains("dark"),
          );
          try {
            await browser.execute(
              (enabled) => document.documentElement.classList.toggle("dark", enabled),
              dark,
            );
            await browser.setWindowSize(width, 800);
            await openMenu("Help");
            await $(`aria/${page}`).click();
            for await (const example of $$("article [data-help-example]")) {
              await example.scrollIntoView();
              await browser.waitUntil(
                () =>
                  browser.execute((element) => {
                    const diagram = element.querySelector<HTMLImageElement>(
                      '[data-language="mermaid"] .leafdown-code-mermaid-image',
                    );
                    return (
                      Boolean(element.querySelector('[data-ready="true"]')) &&
                      (!diagram ||
                        (diagram.complete &&
                          diagram.naturalWidth > 0 &&
                          diagram.getBoundingClientRect().height > 0))
                    );
                  }, example),
                { timeoutMsg: `An example in ${page} did not finish rendering.` },
              );
              const dimensions = await browser.execute((element) => {
                const card = element.getBoundingClientRect();
                const article = element.closest("article")!.getBoundingClientRect();
                const panels = element.querySelectorAll(":scope > div > div");
                return {
                  editable: Boolean(element.querySelector('[contenteditable="true"]')),
                  height: card.height,
                  left: card.left,
                  right: card.right,
                  articleLeft: article.left,
                  articleRight: article.right,
                  sourceTop: panels[0].getBoundingClientRect().top,
                  resultTop: panels[1].getBoundingClientRect().top,
                };
              }, example);
              expect(dimensions.editable).toBe(false);
              expect(dimensions.height).toBeGreaterThan(0);
              expect(dimensions.left).toBeGreaterThanOrEqual(dimensions.articleLeft);
              expect(dimensions.right).toBeLessThanOrEqual(dimensions.articleRight + 1);
              if (width === 640) expect(dimensions.resultTop).toBeGreaterThan(dimensions.sourceTop);
              else expect(dimensions.resultTop).toEqual(dimensions.sourceTop);
            }
            const overflow = await browser.execute(() => {
              const article = document.querySelector("article")!;
              return article.scrollWidth - article.clientWidth;
            });
            expect(overflow).toBeLessThanOrEqual(1);
          } finally {
            await browser.keys("Escape");
            await browser.execute(
              (enabled) => document.documentElement.classList.toggle("dark", enabled),
              originallyDark,
            );
          }
        });
      }
    }
  }
});
