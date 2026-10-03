import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, openMenu, openRecentPath, selectFileMenuItem } from "../support/ui.js";

const block = () => $(".leafdown-frontmatter");

describe("desktop frontmatter", () => {
  it("edits and validates metadata, inserts one block, and keeps all formats across documents", async () => {
    const { frontmatter } = await getDesktopE2ERunContext();
    await openRecentPath(frontmatter.yamlPath);

    await expect(block()).toHaveAttribute("data-format", "yaml");
    await expect(block()).toHaveAttribute("data-validation", "valid");
    await expect($(".leafdown-frontmatter-delimiter")).toHaveText("---");
    await expect($(".leafdown-frontmatter code")).toHaveText(
      expect.stringContaining("title: Garden report"),
    );

    await openMenu("Insert");
    await expect(await findMenuItem((text) => text === "Frontmatter")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await browser.keys(Key.Escape);

    const originalWindowSize = await browser.getWindowSize();
    await browser.setWindowSize(640, 720);
    const geometry = (await block().execute((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth };
    })) as { left: number; right: number; viewport: number };
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
    const screenshotPath = path.resolve(
      "e2e",
      "desktop",
      "artifacts",
      process.env.LEAFDOWN_E2E_ARTIFACT_RUN ?? "manual",
      process.env.LEAFDOWN_E2E_WORKER ?? "worker-1",
      "frontmatter-narrow.png",
    );
    await browser.saveScreenshot(screenshotPath);
    await browser.setWindowSize(originalWindowSize.width, originalWindowSize.height);

    await browser.execute(() => {
      document.querySelector<HTMLElement>(".ProseMirror")!.focus();
      const code = document.querySelector(".leafdown-frontmatter code")!;
      const range = document.createRange();
      range.selectNodeContents(code);
      range.collapse(false);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await browser.keys(Key.Enter);
    await $(".leafdown-frontmatter code").addValue("broken: [");
    await expect($(".leafdown-frontmatter code")).toHaveText(expect.stringContaining("broken: ["));
    await expect(block()).toHaveAttribute("data-validation", "invalid");
    await expect($(".leafdown-frontmatter-status")).toBeDisplayed();
    await browser.keys([Key.Ctrl, "s", Key.NULL]);
    await browser.waitUntil(async () =>
      (await readFile(frontmatter.yamlPath, "utf8")).includes("broken: ["),
    );

    await openRecentPath(frontmatter.tomlPath);
    await expect(block()).toHaveAttribute("data-format", "toml");
    await expect($(".leafdown-frontmatter code")).toHaveText(expect.stringContaining("tags ="));
    await openRecentPath(frontmatter.jsonPath);
    await expect(block()).toHaveAttribute("data-format", "json");
    await expect($(".leafdown-frontmatter code")).toHaveText(expect.stringContaining('"title"'));

    await openRecentPath(frontmatter.yamlPath);
    await expect(block()).toHaveAttribute("data-validation", "invalid");
    await expect($(".leafdown-frontmatter code")).toHaveText(expect.stringContaining("broken: ["));

    await selectFileMenuItem("New");
    await openMenu("Insert");
    await (await findMenuItem((text) => text === "Frontmatter")).click();
    await (await findMenuItem((text) => text === "JSON")).click();
    await expect(block()).toHaveAttribute("data-format", "json");
    expect(
      await browser.execute(() => {
        const code = document.querySelector(".leafdown-frontmatter code")!;
        return code.contains(window.getSelection()?.anchorNode ?? null);
      }),
    ).toBe(true);
    await openMenu("Edit");
    await (await findMenuItem((text) => text.startsWith("Undo"))).click();
    await expect(block()).not.toExist();

    await $(".ProseMirror").addValue("+++\ntitle = 'Typed'\n+++");
    await expect(block()).toHaveAttribute("data-format", "toml");

    await selectFileMenuItem("New");
    await $("aria/Discard changes").click();
    await $(".ProseMirror").addValue("---\ntitle: Typed\n---");
    await expect(block()).toHaveAttribute("data-format", "yaml");

    await selectFileMenuItem("New");
    await $("aria/Discard changes").click();
    await $(".ProseMirror").addValue(';;;\n{"title":"Typed"}\n;;;');
    await expect(block()).toHaveAttribute("data-format", "json");
  });
});
