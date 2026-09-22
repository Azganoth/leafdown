import { $, $$, browser, expect } from "@wdio/globals";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { ARTIFACTS_DIR } from "../support/artifacts.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

interface GutterGeometry {
  barHeight: number;
  barTop: number;
  barWidth: number;
  blockHeight: number;
  blockLeft: number;
  blockTop: number;
  blockTag: string;
  blockText: string;
  handleLeft: number;
  handleHeight: number;
  handleOpacity: string;
  handleRight: number;
  firstLineHeight: number;
  label: string | null;
  pos: string;
  tabIndex: number;
}

const handleGeometry = () =>
  browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("[data-leafdown-block-handle]")).map(
      (handle) => {
        const pos = handle.dataset.leafdownBlockPos ?? "";
        const block = document.querySelector<HTMLElement>(
          `.ProseMirror [data-leafdown-block-pos="${CSS.escape(pos)}"]`,
        );

        if (!block) throw new Error(`Rendered block ${pos} was not found.`);
        const handleRect = handle.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();
        const barStyle = getComputedStyle(handle, "::before");

        return {
          barHeight: Number.parseFloat(barStyle.height),
          barTop: Number.parseFloat(barStyle.insetBlockStart),
          barWidth: Number.parseFloat(barStyle.width),
          blockHeight: blockRect.height,
          blockLeft: blockRect.left,
          blockTop: blockRect.top,
          blockTag: block.tagName,
          blockText: block.textContent?.trim() ?? "",
          handleLeft: handleRect.left,
          handleHeight: handleRect.height,
          handleOpacity: getComputedStyle(handle).opacity,
          handleRight: handleRect.right,
          firstLineHeight: Number.parseFloat(
            getComputedStyle(handle).getPropertyValue("--leafdown-block-first-line"),
          ),
          label: handle.getAttribute("aria-label"),
          pos,
          tabIndex: handle.tabIndex,
        };
      },
    ),
  ) as Promise<GutterGeometry[]>;

const getGeometryForText = async (text: string) => {
  const geometry = (await handleGeometry()).find(({ blockText }) => blockText === text);

  if (!geometry) throw new Error(`Block handle was not found for: ${text}`);
  return geometry;
};

const getHandleSelectorForText = async (text: string) => {
  const geometry = await getGeometryForText(text);
  return `[data-leafdown-block-handle][data-leafdown-block-pos="${geometry.pos}"]`;
};

const getHandlePoint = async (handle: ReturnType<typeof $>) =>
  (await handle.execute((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  })) as { x: number; y: number };

const moveToHandle = async (handle: ReturnType<typeof $>) => {
  const point = await getHandlePoint(handle);

  await browser
    .action("pointer")
    .move({ duration: 0, origin: "viewport", x: point.x, y: point.y })
    .perform();
};

const dispatchHandleGesture = async (handle: ReturnType<typeof $>, shiftKey = false) => {
  if (shiftKey) {
    await handle.execute((node) => {
      for (const type of ["mousedown", "mouseup"] as const) {
        node.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            button: 0,
            cancelable: true,
            shiftKey: true,
          }),
        );
      }
    });
    return;
  }

  const point = await getHandlePoint(handle);
  await browser
    .action("pointer")
    .move({ duration: 0, origin: "viewport", x: point.x, y: point.y })
    .down({ button: 0 })
    .up({ button: 0 })
    .perform();
};

describe("desktop block selection", () => {
  it("renders and operates hierarchical gutters in the assembled app", async () => {
    const { blocks } = await getDesktopE2ERunContext();
    await openRecentPath(blocks.path);
    await expect($(".ProseMirror")).toBeDisplayed();
    await browser.action("pointer").move({ origin: "viewport", x: 1, y: 1 }).perform();

    const wideGeometry = await handleGeometry();
    expect(wideGeometry.length).toBeGreaterThanOrEqual(9);
    expect(wideGeometry.every(({ handleRight, blockLeft }) => handleRight <= blockLeft + 0.5)).toBe(
      true,
    );
    expect(wideGeometry.every(({ label, tabIndex }) => Boolean(label) && tabIndex === -1)).toBe(
      true,
    );
    expect(wideGeometry.every(({ handleOpacity }) => handleOpacity === "0")).toBe(true);

    const listItemLefts = new Set(
      wideGeometry.filter(({ blockTag }) => blockTag === "LI").map(({ blockLeft }) => blockLeft),
    );
    expect(listItemLefts.size).toBeGreaterThanOrEqual(2);

    await browser.setWindowSize(640, 720);
    await browser.waitUntil(async () =>
      (await handleGeometry()).every(
        ({ blockLeft, handleLeft, handleRight }) =>
          handleLeft >= 0 && handleRight <= blockLeft + 0.5 && blockLeft < 640,
      ),
    );

    const multilineGeometry = await getGeometryForText("Root paragraph with projected source.");
    await $(`.ProseMirror [data-leafdown-block-pos="${multilineGeometry.pos}"]`).moveTo();
    await browser.waitUntil(async () => {
      const geometry = await handleGeometry();
      return geometry.find(({ pos }) => pos === multilineGeometry.pos)?.handleOpacity === "1";
    });
    const collapsedMultiline = await getGeometryForText("Root paragraph with projected source.");
    expect(collapsedMultiline.handleHeight).toBe(collapsedMultiline.blockHeight);
    expect(collapsedMultiline.blockHeight).toBeGreaterThan(collapsedMultiline.firstLineHeight);
    expect(collapsedMultiline.barHeight).toBe(16);
    expect(
      Math.abs(
        collapsedMultiline.barTop +
          collapsedMultiline.barHeight / 2 -
          collapsedMultiline.firstLineHeight / 2,
      ),
    ).toBeLessThan(0.5);

    const firstGeometry = await getGeometryForText("Nested first");
    await $(`.ProseMirror [data-leafdown-block-pos="${firstGeometry.pos}"]`).moveTo();
    await browser.waitUntil(async () => {
      const geometry = await handleGeometry();
      return geometry.find(({ pos }) => pos === firstGeometry.pos)?.handleOpacity === "1";
    });

    const hoveredGeometry = await handleGeometry();
    expect(
      hoveredGeometry.every(({ handleOpacity, pos }) =>
        pos === firstGeometry.pos ? handleOpacity === "1" : handleOpacity === "0",
      ),
    ).toBe(true);

    const first = $(await getHandleSelectorForText("Nested first"));
    await moveToHandle(first);
    await first.execute((handle) =>
      handle.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })),
    );
    await browser.waitUntil(async () => {
      const geometry = await handleGeometry();
      const hovered = geometry.find(({ pos }) => pos === firstGeometry.pos);
      return (
        hovered !== undefined &&
        Math.abs(hovered.barHeight - hovered.blockHeight) < 0.5 &&
        hovered.barWidth === 3
      );
    });

    await dispatchHandleGesture(first);
    await expect($("[data-testid='editor-context-popup']")).toBeDisplayed();
    const selectedFirstGeometry = await getGeometryForText("Nested first");
    expect(Math.abs(selectedFirstGeometry.blockLeft - firstGeometry.blockLeft)).toBeLessThan(0.5);
    await expect($("aria/Bold")).not.toExist();
    expect(
      await browser.execute(() => document.activeElement?.classList.contains("ProseMirror")),
    ).toBe(true);
    await expect($("[role='status']")).toHaveText("List item selected");

    const second = $(await getHandleSelectorForText("Nested second"));
    await dispatchHandleGesture(second, true);

    await browser.waitUntil(
      async () => (await $$(".leafdown-selected-block").getElements()).length === 2,
    );
    await expect($("[role='status']")).toHaveText("2 blocks selected");

    const rootHandle = $(await getHandleSelectorForText("Root paragraph with projected source."));
    await dispatchHandleGesture(rootHandle);
    const selectedRootGeometry = await getGeometryForText("Root paragraph with projected source.");
    expect(Math.abs(selectedRootGeometry.blockLeft - multilineGeometry.blockLeft)).toBeLessThan(
      0.5,
    );
    await browser.keys("Escape");
    await expect($("[data-testid='editor-context-popup']")).not.toExist();

    const secondHyphen = $(await getHandleSelectorForText("Second hyphen item"));
    const plus = $(await getHandleSelectorForText("Plus item starts another list"));
    await secondHyphen.execute((node) => {
      for (const type of ["mousedown", "mouseup"] as const) {
        node.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, cancelable: true }));
      }
    });
    await dispatchHandleGesture(plus, true);

    await browser.waitUntil(async () => {
      const selected = await browser.execute(() =>
        Array.from(document.querySelectorAll<HTMLElement>(".leafdown-selected-block")).map(
          (block) => ({ tag: block.tagName, text: block.textContent?.trim() ?? "" }),
        ),
      );
      return (
        selected.length === 2 &&
        selected.every(({ tag }) => tag === "LI") &&
        selected[0]?.text === "Second hyphen item" &&
        selected[1]?.text === "Plus item starts another list"
      );
    });
    await browser.execute(() => {
      const selected = document.querySelectorAll<HTMLElement>("li.leafdown-selected-block");
      selected[0]?.scrollIntoView({ block: "center" });
    });

    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "block-selection.png"));
  });
});
