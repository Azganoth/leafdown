import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import {
  findMenuItem,
  getSaveMenuItem,
  openMenu,
  openRecentPath,
  selectFileMenuItem,
} from "../support/ui.js";

describe("desktop callouts", () => {
  it("renders, edits, folds, saves, and reopens each supported form", async () => {
    const { callouts } = await getDesktopE2ERunContext();
    await openRecentPath(callouts.path);

    const github = '.leafdown-callout[data-dialect="github"]';
    const mkdocs = '.leafdown-callout[data-dialect="mkdocs"]';
    const docusaurus = '.leafdown-callout[data-dialect="docusaurus"]';
    const vitepress = '.leafdown-callout[data-dialect="vitepress"]';
    for (const callout of [github, mkdocs, docusaurus, vitepress]) {
      await expect($(callout)).toBeDisplayed();
    }
    await expect($(`${github} .leafdown-callout-toggle`)).not.toBeDisplayed();
    await expect($(`${github} .leafdown-callout-header span`)).toHaveText("Note");
    await expect($(`${mkdocs} .leafdown-callout-body`)).not.toBeDisplayed();
    await expect($(`${vitepress} .leafdown-callout-body`)).not.toBeDisplayed();
    await expect($(`${docusaurus} .leafdown-callout-body`)).toHaveText("Docusaurus body.");

    const presentation = (await $(mkdocs).execute((node) => {
      const style = getComputedStyle(node);
      const body = node.querySelector<HTMLElement>(".leafdown-callout-body");
      const icon = node.querySelector<HTMLElement>(".leafdown-callout-type");
      const iconStyle = icon ? getComputedStyle(icon, "::before") : null;
      return {
        borderWidth: style.borderLeftWidth,
        radius: style.borderTopLeftRadius,
        background: style.backgroundColor,
        bodyHidden: body?.hidden,
        iconMask: iconStyle?.maskImage ?? "",
        iconWidth: iconStyle?.width ?? "",
      };
    })) as {
      borderWidth: string;
      radius: string;
      background: string;
      bodyHidden: boolean;
      iconMask: string;
      iconWidth: string;
    };
    expect(presentation).toMatchObject({ borderWidth: "0px", bodyHidden: true });
    expect(presentation.radius).not.toBe("0px");
    expect(presentation.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(presentation.iconMask).toContain("callout-warning.svg");
    expect(presentation.iconWidth).not.toBe("0px");

    await $(`${mkdocs} .leafdown-callout-toggle`).click();
    await expect($(`${mkdocs} .leafdown-callout-body`)).toBeDisplayed();
    await expect($(`${mkdocs} .leafdown-callout-body strong`)).toHaveText("bold");
    await $(`${vitepress} .leafdown-callout-toggle`).click();
    await expect($(`${vitepress} .leafdown-callout-body`)).toHaveText("VitePress body.");

    const headers = (await browser.execute(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".leafdown-callout"), (node) => {
        const type = node
          .querySelector<HTMLElement>(".leafdown-callout-type")!
          .getBoundingClientRect();
        const label = node.querySelector<HTMLElement>(".leafdown-callout-label")!;
        const title = node.querySelector<HTMLElement>(".leafdown-callout-title")!;
        const textStart = label.hidden
          ? title.getBoundingClientRect().left + parseFloat(getComputedStyle(title).paddingLeft)
          : label.getBoundingClientRect().left;
        return {
          dialect: node.dataset.dialect,
          typeWidth: type.width,
          typeHeight: type.height,
          bodyOffset:
            node.querySelector<HTMLElement>(".leafdown-callout-body")!.getBoundingClientRect()
              .left - textStart,
        };
      }),
    )) as { dialect: string; typeWidth: number; typeHeight: number; bodyOffset: number }[];
    expect(headers.map(({ dialect }) => dialect)).toEqual([
      "github",
      "mkdocs",
      "docusaurus",
      "vitepress",
    ]);
    for (const header of headers) {
      expect(header.typeWidth).toBe(header.typeHeight);
      expect(Math.abs(header.bodyOffset)).toBeLessThan(0.5);
    }

    const screenshotPath = path.resolve(
      "e2e",
      "desktop",
      "artifacts",
      process.env.LEAFDOWN_E2E_ARTIFACT_RUN ?? "manual",
      process.env.LEAFDOWN_E2E_WORKER ?? "worker-1",
      "callouts.png",
    );
    await browser.saveScreenshot(screenshotPath);

    await browser.execute(() => {
      const paragraph = document.querySelector<HTMLElement>(
        '.leafdown-callout[data-dialect="docusaurus"] .leafdown-callout-body p',
      )!;
      const editor = document.querySelector<HTMLElement>(
        "[data-testid=active-document-host] .ProseMirror",
      )!;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(false);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
    });
    await $('[data-testid=active-document-host] [contenteditable="true"]').addValue(
      " Edited body.",
    );
    await expect($(`${docusaurus} .leafdown-callout-body`)).toHaveText(
      "Docusaurus body. Edited body.",
    );

    await $(`${docusaurus} .leafdown-callout-title`).setValue("Edited title");
    await expect($(`${docusaurus} .leafdown-callout-title`)).toHaveValue("Edited title");

    await (await getSaveMenuItem()).click();
    await browser.waitUntil(
      async () => {
        const saved = await readFile(callouts.path, "utf8");
        return (
          saved.includes("> [!NOTE]") &&
          saved.includes('??? warning "Fold me"') &&
          saved.includes(":::tip[Edited title]") &&
          saved.includes("Docusaurus body. Edited body.") &&
          saved.includes("::: details Hidden details")
        );
      },
      { timeoutMsg: "The edited callouts were not saved in their original dialects." },
    );

    await selectFileMenuItem("Close document");
    await openRecentPath(callouts.path);
    await expect(
      $('.leafdown-callout[data-dialect="docusaurus"] .leafdown-callout-title'),
    ).toHaveValue("Edited title");
    await expect(
      $('.leafdown-callout[data-dialect="docusaurus"] .leafdown-callout-body'),
    ).toHaveText("Docusaurus body. Edited body.");
    await expect(
      $('.leafdown-callout[data-dialect="mkdocs"] .leafdown-callout-body'),
    ).not.toBeDisplayed();
  });

  it("chooses a new callout's dialect through nested Insert menus", async () => {
    const active = "[data-testid=active-document-host]";

    for (const [dialect, label, type] of [
      ["github", null, "Caution"],
      ["docusaurus", "Docusaurus", "Danger"],
      ["vitepress", "VitePress", "Danger"],
      ["mkdocs", "MkDocs", "Bug"],
    ] as const) {
      await selectFileMenuItem("New");
      await openMenu("Insert");
      await (await findMenuItem((text) => text === "Callout")).click();

      if (label) {
        await (await findMenuItem((text) => text === label)).click();
      }

      await (await findMenuItem((text) => text === type)).click();
      await expect($(`${active} .leafdown-callout`)).toHaveAttribute("data-dialect", dialect);
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const body = document.querySelector(
              "[data-testid=active-document-host] .leafdown-callout-body",
            )!;
            return (
              body.contains(window.getSelection()?.anchorNode ?? null) &&
              document.activeElement?.classList.contains("ProseMirror")
            );
          }),
        { timeoutMsg: "Choosing a callout dialect did not return focus to its body." },
      );
    }

    // The embedded driver drops Shift from F10, so raise the chord on the focused editor.
    await $(`${active} .ProseMirror`).execute((editor) => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "F10",
          shiftKey: true,
        }),
      );
    });
    const popup = $("[data-testid=editor-context-popup]");
    await expect(popup).toBeDisplayed();
    await popup.$("aria/Insert").click();
    await (await findMenuItem((text) => text === "Callout")).click();
    await (await findMenuItem((text) => text === "VitePress")).click();
    const details = await findMenuItem((text) => text === "Details");
    await expect(details.$("[data-slot=callout-type-icon]")).toBeDisplayed();
    await details.click();

    await expect($(`${active} .leafdown-callout[data-dialect=mkdocs]`)).toBeDisplayed();
    await expect($(`${active} .leafdown-callout[data-dialect=vitepress]`)).toBeDisplayed();
    await browser.keys(Key.Escape);
    await openMenu("Insert");
    await (await findMenuItem((text) => text === "Callout")).click();
    await expect(await findMenuItem((text) => text === "Caution")).toBeDisplayed();
    await browser.keys([Key.Escape, Key.Escape]);
  });
});
