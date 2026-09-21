import { $, expect } from "@wdio/globals";

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
    const [projectionBox, projectionRect, projectedRect, linkedAfter, retainedImage] =
      await Promise.all([
        getBox(projection),
        getRect(projection),
        getRect(projectedImage),
        getRect(linkedImage),
        projectedImage.execute(
          (node) =>
            (window as Window & { leafdownRetainedImage?: Element }).leafdownRetainedImage === node,
        ),
      ]);

    expect(projectionBox.height).toBe(28);
    expect(projectionRect.y).toBeLessThan(projectedRect.y);
    expect(linkedAfter.y).toBeGreaterThan(linkedBefore.y);
    expect(retainedImage).toBe(true);
  });
});
