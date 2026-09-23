import { $, $$, expect } from "@wdio/globals";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

interface ElementBox {
  height: number;
  width: number;
}

interface ElementRect extends ElementBox {
  x: number;
  y: number;
}

const getBox = async (element: ReturnType<typeof $>): Promise<ElementBox> => {
  const result = await element.execute((node) => {
    const { height, width } = node.getBoundingClientRect();

    return { height, width };
  });

  return result as ElementBox;
};

const getRect = async (element: ReturnType<typeof $>): Promise<ElementRect> => {
  const result = await element.execute((node) => {
    const { height, width, x, y } = node.getBoundingClientRect();

    return { height, width, x, y };
  });

  return result as ElementRect;
};

describe("desktop rendered images", () => {
  it("keeps decoded SVGs visible and tiny images on an editor surface", async () => {
    const { images } = await getDesktopE2ERunContext();

    await openRecentPath(images.path);

    const visibleImage = $('img[alt="Visible SVG"]');
    const linkedImage = $('img[alt="Linked SVG"]');
    const tinyImage = $('img[alt="Tiny transparent SVG"]');

    await expect(visibleImage).toBeDisplayed();
    await expect(linkedImage).toBeDisplayed();
    await expect(tinyImage).toBeDisplayed();

    const missingPlaceholder = $(".leafdown-image-placeholder");

    await expect(missingPlaceholder).toBeDisplayed();

    const [visibleBox, linkedBox, tinyBox] = await Promise.all([
      getBox(visibleImage),
      getBox(linkedImage),
      getBox(tinyImage),
    ]);

    expect(visibleBox.width).toBeGreaterThan(0);
    expect(visibleBox.height).toBeGreaterThan(0);
    expect(linkedBox.width).toBeGreaterThan(0);
    expect(linkedBox.height).toBeGreaterThan(0);
    expect(tinyBox.width).toBeGreaterThan(0);
    expect(tinyBox.height).toBeGreaterThan(0);
    expect(tinyBox.width).toBeLessThanOrEqual(3);
    expect(tinyBox.height).toBeLessThanOrEqual(3);

    const tinyImageView = tinyImage.$("..");
    await expect(tinyImageView).toHaveElementClass("leafdown-image-view");
    const [selectionSurface, placeholderBox] = await Promise.all([
      getBox(tinyImageView),
      getBox(missingPlaceholder),
    ]);

    expect(selectionSurface.width).toBeGreaterThanOrEqual(32);
    expect(selectionSurface.height).toBe(28);
    expect(placeholderBox.height).toBe(28);

    expect(await missingPlaceholder.getText()).toBe("Image not found.");

    const linkedBefore = await getRect(linkedImage);

    await visibleImage.execute((node) => {
      (window as Window & { leafdownRetainedImage?: Element }).leafdownRetainedImage = node;
    });
    await visibleImage.execute((node) => {
      node.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );
    });

    const projection = $('.leafdown-source-projection[data-leafdown-source~="image"]');
    const projectedImage = $('img[alt="Visible SVG"]');

    await expect(projection).toBeDisplayed();
    await expect(projectedImage).toBeDisplayed();
    const [sourceLine, projectionRect, projectedRect, linkedAfter, retainedImage] =
      await Promise.all([
        projection.execute((node) =>
          Array.from(
            node.parentElement!.querySelectorAll(
              '.leafdown-source-projection[data-leafdown-source~="image"]',
            ),
            (fragment) => ({
              display: getComputedStyle(fragment).display,
              text: fragment.textContent,
              top: fragment.getBoundingClientRect().top,
            }),
          ),
        ) as Promise<{ display: string; text: string | null; top: number }[]>,
        getRect(projection),
        getRect(projectedImage),
        getRect(linkedImage),
        projectedImage.execute(
          (node) =>
            (window as Window & { leafdownRetainedImage?: Element }).leafdownRetainedImage === node,
        ),
      ]);

    expect(sourceLine.map(({ text }) => text).join("")).toBe("![Visible SVG](./leaf.svg)");
    expect(sourceLine.every(({ display }) => display === "inline")).toBe(true);
    expect(new Set(sourceLine.map(({ top }) => Math.round(top))).size).toBe(1);
    expect(projectionRect.y).toBeLessThan(projectedRect.y);
    expect(linkedAfter.y).toBeGreaterThan(linkedBefore.y);
    expect(retainedImage).toBe(true);
  });

  it("keeps a long projected image source on one scrollable line", async () => {
    const { images } = await getDesktopE2ERunContext();

    await openRecentPath(images.path);

    const longImage = $('img[alt^="Long description for a projected image source"]');
    await longImage.execute((node) => {
      node.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }),
      );
    });

    const fragments = $$('[data-leafdown-source~="image"]');
    await expect(fragments[0]).toBeDisplayed();
    const line = (await fragments[0].execute((node) => ({
      source: Array.from(
        node.parentElement!.querySelectorAll('[data-leafdown-source~="image"]'),
        (fragment) => fragment.textContent,
      ).join(""),
      fragmentTops: Array.from(
        node.parentElement!.querySelectorAll('[data-leafdown-source~="image"]'),
        (fragment) => fragment.getBoundingClientRect().top,
      ),
      overflowX: getComputedStyle(node.parentElement!).overflowX,
      scrollWidth: node.parentElement!.scrollWidth,
      visibleWidth: node.parentElement!.clientWidth,
    }))) as {
      source: string;
      fragmentTops: number[];
      overflowX: string;
      scrollWidth: number;
      visibleWidth: number;
    };

    expect(line.source).toContain("Long description for a projected image source");
    expect(new Set(line.fragmentTops.map(Math.round)).size).toBe(1);
    expect(line.overflowX).toBe("auto");
    expect(line.scrollWidth).toBeGreaterThan(line.visibleWidth);
  });

  it("keeps paragraph text beside a projected image wrappable", async () => {
    const { images } = await getDesktopE2ERunContext();

    await openRecentPath(images.path);

    const mixedImage = $('img[alt="Mixed SVG"]');
    await mixedImage.execute((node) => {
      node.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }),
      );
    });

    const source = $('[data-leafdown-source~="image"]');
    await expect(source).toBeDisplayed();
    const paragraphTextLines = (await source.execute((node) => {
      const paragraph = node.parentElement!;
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let trailingText = walker.nextNode();
      while (trailingText && !trailingText.textContent?.includes("surrounding paragraph")) {
        trailingText = walker.nextNode();
      }
      if (!trailingText) throw new Error("Expected prose after the image.");
      const range = document.createRange();
      range.selectNodeContents(trailingText);
      return range.getClientRects().length;
    })) as number;

    expect(paragraphTextLines).toBeGreaterThan(1);
  });
});
