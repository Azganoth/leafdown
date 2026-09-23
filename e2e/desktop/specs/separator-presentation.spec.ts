import { $, browser, expect } from "@wdio/globals";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

describe("desktop separator presentation", () => {
  it("fills a paragraph-height row and uses the block selection wash", async () => {
    const { separator: fixture } = await getDesktopE2ERunContext();
    await openRecentPath(fixture.path);
    const separator = $(".ProseMirror hr");
    await expect(separator).toBeDisplayed();

    const geometry = (await separator.execute((node) => {
      const pos = node.getAttribute("data-leafdown-block-pos");
      const handle = document.querySelector<HTMLElement>(
        `[data-leafdown-block-handle][data-leafdown-block-pos="${pos}"]`,
      );
      if (!handle) throw new Error("Expected a separator block handle.");

      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const line = getComputedStyle(node, "::before");
      return {
        alignItems: style.alignItems,
        blockHeight: rect.height,
        firstLineHeight: Number.parseFloat(
          getComputedStyle(handle).getPropertyValue("--leafdown-block-first-line"),
        ),
        handleHeight: handle.getBoundingClientRect().height,
        lineHeight: line.height,
        lineWidth: Number.parseFloat(line.width),
        marginBottom: style.marginBottom,
        marginTop: style.marginTop,
        point: {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        },
        pos,
        rowWidth: rect.width,
      };
    })) as {
      lineWidth: number;
      point: { x: number; y: number };
      pos: string;
      rowWidth: number;
    };
    expect(geometry).toMatchObject({
      alignItems: "center",
      blockHeight: 28,
      firstLineHeight: 28,
      handleHeight: 28,
      lineHeight: "2px",
      marginBottom: "20px",
      marginTop: "20px",
    });
    expect(geometry.lineWidth).toBeCloseTo(geometry.rowWidth, 1);

    await browser
      .action("pointer")
      .move({ duration: 0, origin: "viewport", ...geometry.point })
      .down({ button: 0 })
      .up({ button: 0 })
      .perform();
    await expect(separator).toHaveElementClass("ProseMirror-selectednode");
    const directSelection = (await separator.execute((node) => {
      const style = getComputedStyle(node);
      return {
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle,
      };
    })) as { backgroundImage: string; boxShadow: string; outlineStyle: string };
    expect(directSelection.backgroundImage).not.toBe("none");
    expect(directSelection.outlineStyle).toBe("none");

    const handle = $(`[data-leafdown-block-handle][data-leafdown-block-pos="${geometry.pos}"]`);
    const handlePoint = (await handle.execute((node) => {
      const rect = node.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
    })) as { x: number; y: number };
    await browser
      .action("pointer")
      .move({ duration: 0, origin: "viewport", ...handlePoint })
      .down({ button: 0 })
      .up({ button: 0 })
      .perform();
    await expect(separator).toHaveElementClass("leafdown-selected-block");
    const blockSelection = await separator.execute((node) => {
      const style = getComputedStyle(node);
      return { backgroundImage: style.backgroundImage, boxShadow: style.boxShadow };
    });
    expect(blockSelection).toEqual({
      backgroundImage: directSelection.backgroundImage,
      boxShadow: directSelection.boxShadow,
    });
  });
});
