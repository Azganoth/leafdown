import { $, $$, browser, expect } from "@wdio/globals";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Key } from "webdriverio";

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

const dispatchEditorKey = (key: string, init: KeyboardEventInit = {}) =>
  browser.execute(
    (eventKey, eventInit) => {
      const editor = document.querySelector<HTMLElement>(".ProseMirror");

      if (!editor) throw new Error("Editor was not found.");

      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: eventKey,
        ...eventInit,
      });
      editor.dispatchEvent(event);
      return event.defaultPrevented;
    },
    key,
    init,
  );

const cutSelectedBlocks = () =>
  browser.execute(() => {
    const clipboardData = new DataTransfer();
    const event = new ClipboardEvent("cut", { bubbles: true, cancelable: true, clipboardData });
    document.querySelector(".ProseMirror")?.dispatchEvent(event);
    return {
      text: clipboardData.getData("text/plain"),
      html: clipboardData.getData("text/html"),
    };
  });

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
    .perform();
  await browser.action("pointer").up({ button: 0 }).perform();
};

describe("desktop block selection", () => {
  it("inserts a nested sibling from the moving gutter control and cancels without editing", async () => {
    const { blocks } = await getDesktopE2ERunContext();
    const originalWindowSize = await browser.getWindowSize();
    await openRecentPath(blocks.path);
    await expect($(".ProseMirror")).toBeDisplayed();
    const target = await getGeometryForText("Nested first");
    const root = await getGeometryForText("Root paragraph with projected source.");
    const rootPoint = (await $(
      `.leafdown-block-gutter[data-leafdown-block-pos="${root.pos}"] .leafdown-block-gutter__insertion-slot`,
    ).execute((node) => {
      const rect = node.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + 4) };
    })) as { x: number; y: number };
    await browser
      .action("pointer")
      .move({ origin: "viewport", x: rootPoint.x, y: rootPoint.y })
      .perform();
    const button = $("[data-leafdown-block-insert]");
    await expect(button).toBeDisplayed();
    const rootButtonX = (await button.execute(
      (node) => node.getBoundingClientRect().left,
    )) as number;
    const selector = `.leafdown-block-gutter[data-leafdown-block-pos="${target.pos}"] .leafdown-block-gutter__insertion-slot`;
    const point = (await $(selector).execute((node) => {
      const rect = node.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + Math.min(rect.height - 2, 20)),
      };
    })) as { x: number; y: number };
    await browser.action("pointer").move({ origin: "viewport", x: point.x, y: point.y }).perform();
    await expect(button).toBeDisplayed();
    expect(await button.execute((node) => node.getBoundingClientRect().left)).toBeGreaterThan(
      rootButtonX,
    );
    expect(await button.getAttribute("tabindex")).toBe("-1");
    await button.moveTo();
    await expect($(".leafdown-block-insertion-indicator")).toBeDisplayed();
    await browser
      .action("pointer")
      .move({ origin: "viewport", x: point.x, y: Math.round(target.blockTop + 2) })
      .perform();
    const lineTop = (await $(".leafdown-block-insertion-indicator").execute(
      (node) => node.getBoundingClientRect().top,
    )) as number;
    expect(lineTop).toBeCloseTo(target.blockTop, 0);
    await browser.action("pointer").move({ origin: "viewport", x: point.x, y: point.y }).perform();
    await button.click();
    await expect($("[data-testid='editor-block-insertion-menu']")).toBeDisplayed();
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "block-insertion-menu.png"));
    await expect($("[data-testid='editor-block-insertion-menu'] [role='menuitem']")).toHaveText(
      "List item",
    );
    await browser.keys(Key.Escape);
    await expect($("[data-testid='editor-block-insertion-menu']")).not.toExist();

    await browser.setWindowSize(640, 720);
    await browser.execute(() => {
      const editor = document.querySelector<HTMLElement>(".ProseMirror");
      if (!editor) throw new Error("Editor was not found.");
      editor.dir = "rtl";
      window.dispatchEvent(new Event("resize"));
    });
    await browser.waitUntil(() =>
      browser.execute(
        (pos) =>
          document
            .querySelector(`.leafdown-block-gutter[data-leafdown-block-pos="${pos}"]`)
            ?.hasAttribute("data-rtl") ?? false,
        target.pos,
      ),
    );
    const rtlSlot = $(selector);
    const rtlPoint = (await rtlSlot.execute((node) => {
      const rect = node.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + 4) };
    })) as { x: number; y: number };
    await browser
      .action("pointer")
      .move({ origin: "viewport", x: rtlPoint.x, y: rtlPoint.y })
      .perform();
    await expect(button).toBeDisplayed();
    const rtlPlacement = await browser.execute((pos) => {
      const block = document.querySelector<HTMLElement>(
        `.ProseMirror [data-leafdown-block-pos="${pos}"]`,
      );
      const gutter = document.querySelector<HTMLElement>(
        `.leafdown-block-gutter[data-leafdown-block-pos="${pos}"]`,
      );
      if (!block || !gutter) throw new Error("Nested block and gutter were not found.");
      return {
        blockRight: block.getBoundingClientRect().right,
        gutterLeft: gutter.getBoundingClientRect().left,
      };
    }, target.pos);
    expect(rtlPlacement.gutterLeft).toBeGreaterThanOrEqual(rtlPlacement.blockRight - 0.5);
    await browser.execute(() => {
      document.querySelector<HTMLElement>(".ProseMirror")?.removeAttribute("dir");
      window.dispatchEvent(new Event("resize"));
    });
    await browser.waitUntil(() =>
      browser.execute(
        (pos) =>
          !document
            .querySelector(`.leafdown-block-gutter[data-leafdown-block-pos="${pos}"]`)
            ?.hasAttribute("data-rtl"),
        target.pos,
      ),
    );
    await browser.setWindowSize(originalWindowSize.width, originalWindowSize.height);
    expect((await handleGeometry()).filter(({ blockTag }) => blockTag === "LI")).toHaveLength(7);

    await browser.action("pointer").move({ origin: "viewport", x: point.x, y: point.y }).perform();
    await button.click();
    await $("[data-testid='editor-block-insertion-menu'] [role='menuitem']").click();
    await browser.waitUntil(
      async () => (await handleGeometry()).filter(({ blockTag }) => blockTag === "LI").length === 8,
    );
    expect(
      await browser.execute(() => document.activeElement?.classList.contains("ProseMirror")),
    ).toBe(true);
    await browser.keys([Key.Ctrl, "z", Key.NULL]);
    await browser.waitUntil(
      async () => (await handleGeometry()).filter(({ blockTag }) => blockTag === "LI").length === 7,
    );
    expect(await dispatchEditorKey("i", { ctrlKey: true, altKey: true })).toBe(true);
    await expect($("[data-testid='editor-block-insertion-menu']")).toBeDisplayed();
    expect(await browser.execute(() => document.activeElement?.getAttribute("role"))).toBe(
      "menuitem",
    );
    await browser.keys(Key.Escape);
    await expect($("[data-testid='editor-block-insertion-menu']")).not.toExist();
    await browser.waitUntil(() =>
      browser.execute(() => document.activeElement?.classList.contains("ProseMirror")),
    );
  });

  it("renders and operates hierarchical gutters in the assembled app", async () => {
    const { blocks } = await getDesktopE2ERunContext();
    await openRecentPath(blocks.path);
    await expect($("aria/Unsaved changes")).toBeDisplayed();
    await $("aria/Discard changes").click();
    await expect($(".ProseMirror")).toBeDisplayed();

    await browser.action("pointer").move({ origin: "viewport", x: 1, y: 1 }).perform();

    const wideGeometry = await handleGeometry();
    expect(wideGeometry.length).toBeGreaterThanOrEqual(9);
    const itemGap = (before: string, after: string) => {
      const first = wideGeometry.find(({ blockText }) => blockText === before);
      const second = wideGeometry.find(({ blockText }) => blockText === after);
      if (!first || !second) throw new Error(`List items were not found: ${before}, ${after}`);
      return second.blockTop - first.blockTop - first.blockHeight;
    };
    for (const [before, after] of [
      ["Nested first", "Nested second"],
      ["Hyphen item", "Second hyphen item"],
      ["Second hyphen item", "Plus item starts another list"],
      ["Plus item starts another list", "Asterisk item starts another list"],
    ]) {
      expect(Math.abs(itemGap(before, after) - 8)).toBeLessThan(0.5);
    }
    const paragraphToListGap = await browser.execute(() => {
      const paragraph = Array.from(document.querySelectorAll<HTMLElement>(".ProseMirror > p")).find(
        (node) => node.textContent?.startsWith("Root paragraph with"),
      );
      const list = paragraph?.nextElementSibling;
      if (!paragraph || !list || list.tagName !== "UL") {
        throw new Error("Root paragraph and adjacent list were not found.");
      }
      return list.getBoundingClientRect().top - paragraph.getBoundingClientRect().bottom;
    });
    expect(Math.abs(paragraphToListGap - 16)).toBeLessThan(0.5);
    expect(wideGeometry.every(({ handleRight, blockLeft }) => handleRight <= blockLeft + 0.5)).toBe(
      true,
    );
    expect(wideGeometry.every(({ label, tabIndex }) => Boolean(label) && tabIndex === -1)).toBe(
      true,
    );
    await browser.waitUntil(async () =>
      (await handleGeometry()).every(({ handleOpacity }) => handleOpacity === "0"),
    );

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

    await dispatchHandleGesture(first);
    expect(
      await browser.execute(() => document.activeElement?.classList.contains("ProseMirror")),
    ).toBe(true);
    expect(await dispatchEditorKey("a", { ctrlKey: true })).toBe(true);
    await expect($("[role='status']")).toHaveText("2 blocks selected");
    expect(await dispatchEditorKey("ArrowUp")).toBe(true);
    await expect($("[role='status']")).toHaveText("List item selected");
    expect(await dispatchEditorKey("ArrowDown", { shiftKey: true })).toBe(true);
    await expect($("[role='status']")).toHaveText("2 blocks selected");
    expect(await dispatchEditorKey("Enter")).toBe(true);
    await expect($$(".leafdown-selected-block")).toBeElementsArrayOfSize(0);

    await dispatchHandleGesture(first);
    await dispatchEditorKey("a", { ctrlKey: true });
    await dispatchEditorKey("a", { ctrlKey: true });
    await dispatchEditorKey("a", { ctrlKey: true });
    await expect($("[role='status']")).toHaveText("Document selected");

    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "block-selection.png"));

    await browser.keys(Key.Escape);
    await expect($("[data-testid='editor-context-popup']")).not.toExist();

    const operationHandle = $(await getHandleSelectorForText("Nested first"));
    await operationHandle.scrollIntoView();
    await operationHandle.execute((node) => {
      for (const type of ["mousedown", "mouseup"] as const) {
        node.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, cancelable: true }));
      }
    });
    await expect($("[data-testid='editor-context-popup']")).toBeDisplayed();
    await expect($("aria/Move block up")).toHaveAttribute("data-disabled");
    await expect($("aria/Move block down")).not.toHaveAttribute("data-disabled");
    await $("aria/Move block down").click();
    const movedTexts = (await handleGeometry())
      .filter(({ blockTag }) => blockTag === "LI")
      .map(({ blockText }) => blockText);
    expect(movedTexts.join(" | ")).toContain("Nested second | Nested first");
    await browser.waitUntil(() =>
      browser.execute(() => document.activeElement?.classList.contains("ProseMirror")),
    );
    await browser.keys([Key.Ctrl, "z", Key.NULL]);
    await browser.waitUntil(async () => {
      const texts = (await handleGeometry())
        .filter(({ blockTag }) => blockTag === "LI")
        .map(({ blockText }) => blockText);
      return texts.indexOf("Nested first") < texts.indexOf("Nested second");
    });

    await browser.keys([Key.Alt, Key.ArrowDown, Key.NULL]);
    const keyboardMovedTexts = (await handleGeometry())
      .filter(({ blockTag }) => blockTag === "LI")
      .map(({ blockText }) => blockText);
    expect(keyboardMovedTexts.join(" | ")).toContain("Nested second | Nested first");
    await browser.keys([Key.Ctrl, "z", Key.NULL]);
    await browser.waitUntil(async () => {
      const texts = (await handleGeometry())
        .filter(({ blockTag }) => blockTag === "LI")
        .map(({ blockText }) => blockText);
      return texts.indexOf("Nested first") < texts.indexOf("Nested second");
    });

    const dragHandle = $(await getHandleSelectorForText("Nested first"));
    await dragHandle.scrollIntoView();
    const start = await getHandlePoint(dragHandle);
    const target = await getGeometryForText("Nested second");
    await browser
      .action("pointer")
      .move({ origin: "viewport", x: start.x, y: start.y })
      .down({ button: 0 })
      .move({ origin: "viewport", x: start.x, y: start.y + 8, duration: 200 })
      .move({
        origin: "viewport",
        x: Math.round(target.blockLeft + 20),
        y: Math.round(target.blockTop + target.blockHeight - 3),
        duration: 400,
      })
      .up({ button: 0 })
      .perform();
    const textsAfterDrag = (await handleGeometry())
      .filter(({ blockTag }) => blockTag === "LI")
      .map(({ blockText }) => blockText);
    expect(textsAfterDrag.join(" | ")).toContain("Nested second | Nested first");

    await browser.keys([Key.Ctrl, "z", Key.NULL]);
    await browser.waitUntil(async () => {
      const texts = (await handleGeometry())
        .filter(({ blockTag }) => blockTag === "LI")
        .map(({ blockText }) => blockText);
      return texts.indexOf("Nested first") < texts.indexOf("Nested second");
    });

    const firstNested = $(await getHandleSelectorForText("Nested first"));
    const secondNested = $(await getHandleSelectorForText("Nested second"));
    await dispatchHandleGesture(firstNested);
    await dispatchHandleGesture(secondNested, true);
    await expect($("[role='status']")).toHaveText("2 blocks selected");
    const cutPayload = await cutSelectedBlocks();
    expect(cutPayload.text).toContain("Nested first");
    expect(cutPayload.text).toContain("Nested second");
    expect(cutPayload.html).toContain("Nested first");
    await browser.waitUntil(async () =>
      browser.execute(
        () => !document.querySelector(".ProseMirror")?.textContent?.includes("Nested first"),
      ),
    );
    await expect($(".ProseMirror")).toHaveText(expect.stringContaining("Parent item"));
    await expect($(".ProseMirror")).not.toHaveText(expect.stringContaining("Nested second"));
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "block-selection-cut.png"));

    await browser.keys([Key.Ctrl, "z", Key.NULL]);
    await browser.waitUntil(async () =>
      browser.execute(() =>
        document.querySelector(".ProseMirror")?.textContent?.includes("Nested second"),
      ),
    );
    await expect($$(".leafdown-selected-block")).toBeElementsArrayOfSize(2);
    await browser.execute(({ text, html }) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      clipboardData.setData("text/html", html);
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData });
      document.querySelector(".ProseMirror")?.dispatchEvent(event);
    }, cutPayload);
    await browser.waitUntil(async () =>
      browser.execute(() =>
        document.querySelector(".ProseMirror")?.textContent?.includes("Nested first"),
      ),
    );
    const pastedItems = (await handleGeometry())
      .filter(({ blockTag }) => blockTag === "LI")
      .map(({ blockText }) => blockText);
    expect(pastedItems.join(" | ")).toContain("Parent itemNested firstNested second");
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "block-selection-pasted.png"));

    const pastedFirst = $(await getHandleSelectorForText("Nested first"));
    await dispatchHandleGesture(pastedFirst);
    expect(await dispatchEditorKey("Delete")).toBe(true);
    await browser.waitUntil(async () =>
      browser.execute(
        () => !document.querySelector(".ProseMirror")?.textContent?.includes("Nested first"),
      ),
    );
    await expect($(".ProseMirror")).toHaveText(expect.stringContaining("Nested second"));
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "block-selection-deleted.png"));
    await browser.keys([Key.Ctrl, "z", Key.NULL]);
    await expect($(".ProseMirror")).toHaveText(expect.stringContaining("Nested first"));

    const crossParentStart = $(await getHandleSelectorForText("Second hyphen item"));
    const crossParentEnd = $(await getHandleSelectorForText("Plus item starts another list"));
    await dispatchHandleGesture(crossParentStart);
    await dispatchHandleGesture(crossParentEnd, true);
    await expect($("[role='status']")).toHaveText("2 blocks selected");
    const crossParentPayload = await cutSelectedBlocks();
    expect(crossParentPayload.text).toContain("Second hyphen item");
    expect(crossParentPayload.text).toContain("Plus item starts another list");
    expect(crossParentPayload.text).not.toContain("Hyphen item\n");
    expect(crossParentPayload.text).not.toContain("Asterisk item starts another list");
    await expect($(".ProseMirror")).toHaveText(expect.stringContaining("Hyphen item"));
    await expect($(".ProseMirror")).toHaveText(
      expect.stringContaining("Asterisk item starts another list"),
    );
    await expect($(".ProseMirror")).not.toHaveText(expect.stringContaining("Second hyphen item"));
    await expect($(".ProseMirror")).not.toHaveText(
      expect.stringContaining("Plus item starts another list"),
    );
    await browser.keys([Key.Ctrl, "z", Key.NULL]);
    await expect($(".ProseMirror")).toHaveText(
      expect.stringContaining("Plus item starts another list"),
    );
  });
});
