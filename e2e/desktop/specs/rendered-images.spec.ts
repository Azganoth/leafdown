import { $, expect } from "@wdio/globals";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

interface ElementBox {
  height: number;
  width: number;
}

const getBox = async (element: ReturnType<typeof $>): Promise<ElementBox> => {
  const result = await element.execute((node) => {
    const { height, width } = node.getBoundingClientRect();

    return { height, width };
  });

  return result as ElementBox;
};

describe("desktop rendered images", () => {
  it("keeps decoded SVGs visible and tiny images on an editor surface", async () => {
    const { images } = await getDesktopE2ERunContext();

    await openRecentPath(images.path);

    const visibleImage = $('img[alt="Visible SVG"]');
    const linkedImage = $('img[alt="Linked SVG"]');
    const tinyImage = $('img[alt="Tiny transparent SVG"]');
    const missingPlaceholder = $(".leafdown-image-placeholder");

    await expect(visibleImage).toBeDisplayed();
    await expect(linkedImage).toBeDisplayed();
    await expect(tinyImage).toBeDisplayed();
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
  });
});
