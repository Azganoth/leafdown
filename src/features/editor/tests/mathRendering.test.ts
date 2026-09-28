// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorNodePosition, setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountEditor = setupMilkdownEditorMount();

const mountMath = async (markdown: string) => {
  const mounted = await mountEditor(`${markdown}\n\nEnd\n`);
  setSelectionAtDocumentEnd(mounted.view);
  return mounted;
};

const getMath = (root: HTMLElement, value: string) =>
  [...root.querySelectorAll<HTMLElement>('[data-type="math"]')].find(
    (math) => math.dataset.value === value,
  )!;

const getTex = (math: HTMLElement) => math.querySelector("annotation")?.textContent;

describe("math rendering", () => {
  it("renders inline math in the line", async () => {
    const mounted = await mountMath("Before $x^2$ after");
    const math = getMath(mounted.view.dom, "$x^2$");

    expect(math).toHaveAttribute("data-math-rendered", "true");
    expect(math).toHaveAttribute("data-math-flow", "inline");
    expect(math.querySelector(".katex")).not.toBeNull();
    expect(math.querySelector(".katex-display")).toBeNull();
    expect(getTex(math)).toBe("x^2");
  });

  it("renders display math alone in its paragraph as that paragraph's block", async () => {
    const source = "$$\n\\int_0^1 x\\,dx\n$$";
    const mounted = await mountMath(source);
    const math = getMath(mounted.view.dom, source);

    expect(math).toHaveAttribute("data-math-flow", "block");
    expect(math.querySelector(".katex-display")).not.toBeNull();
    expect(getTex(math)).toBe("\n\\int_0^1 x\\,dx\n");
  });

  it("renders display math sharing its paragraph in display style within the line", async () => {
    const mounted = await mountMath("Sum $$\\sum_i x_i$$ inline");
    const math = getMath(mounted.view.dom, "$$\\sum_i x_i$$");

    expect(math).toHaveAttribute("data-math-flow", "inline");
    expect(math.querySelector(".katex-display")).not.toBeNull();
  });

  it("renders GitHub's backtick form without its backticks", async () => {
    const mounted = await mountMath("Code form $`a < b`$ here");

    expect(getTex(getMath(mounted.view.dom, "$`a < b`$"))).toBe("a < b");
  });

  it("reads a table cell's TeX after the cell's pipe escapes", async () => {
    const mounted = await mountMath("| a |\n| - |\n| $x\\|y$ |");
    const math = getMath(mounted.view.dom, "$x\\|y$");

    expect(getTex(math)).toBe("x|y");
    expect(mounted.getMarkdown()).toContain("$x\\|y$");
  });

  it("shows TeX that does not parse as its source, describes the error, and stays editable", async () => {
    const mounted = await mountMath("Broken $\\frac{a$ here");
    const math = getMath(mounted.view.dom, "$\\frac{a$");

    expect(math).toHaveAttribute("data-math-rendered", "false");
    expect(math.textContent).toBe("$\\frac{a$");
    expect(math.getAttribute("aria-description")).toMatch(/^Math error: Unexpected end of input/u);

    const position = getEditorNodePosition(mounted, "math_inline");
    dispatchMouseEvent(math, "mousedown", { button: 0 });
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(position + 1);
  });

  it("drops the error description once edited source renders", async () => {
    const mounted = await mountMath("Broken $\\frac{a$ here");
    const position = getEditorNodePosition(mounted, "math_inline");
    mounted.view.dispatch(
      mounted.view.state.tr.setNodeAttribute(position, "value", "$\\frac{a}{b}$"),
    );
    const math = getMath(mounted.view.dom, "$\\frac{a}{b}$");

    expect(math).toHaveAttribute("data-math-rendered", "true");
    expect(math).not.toHaveAttribute("aria-description");
  });
});
