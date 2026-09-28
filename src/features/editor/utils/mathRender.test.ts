// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { readMathTex, renderMath } from "./mathRender";

const PROBE = "leafdown-probe";
const PROBE_URL = "https://example.invalid/leafdown-probe.png";
const URL_ATTRIBUTES = ["href", "src", "srcset", "xlink:href", "action", "formaction", "poster"];

const renderElement = (source: string) => {
  const result = renderMath(source, false);
  if (result.error !== null) {
    throw new Error(`Expected ${source} to render, got: ${result.error}`);
  }
  return result.element;
};

const getAttributes = (element: Element) =>
  [element, ...element.querySelectorAll("*")].flatMap((node) =>
    [...node.attributes].map(({ name, value }) => ({ name, value })),
  );

describe("math rendering", () => {
  it.each([
    [String.raw`$\href{${PROBE_URL}}{x}$`, String.raw`\href`],
    [String.raw`$\url{${PROBE_URL}}$`, String.raw`\url`],
    [String.raw`$\includegraphics[height=1em]{${PROBE_URL}}$`, String.raw`\includegraphics`],
    [String.raw`$\htmlClass{${PROBE}}{x}$`, String.raw`\htmlClass`],
    [String.raw`$\htmlId{${PROBE}}{x}$`, String.raw`\htmlId`],
    [String.raw`$\htmlStyle{background: url(${PROBE_URL})}{x}$`, String.raw`\htmlStyle`],
    [String.raw`$\htmlData{${PROBE}=${PROBE}}{x}$`, String.raw`\htmlData`],
  ])("renders %s as inert error text", (source, command) => {
    const element = renderElement(source);
    const attributes = getAttributes(element);

    expect(attributes.filter(({ name }) => URL_ATTRIBUTES.includes(name))).toEqual([]);
    expect(attributes.filter(({ name }) => name === "id" || name.startsWith("data-"))).toEqual([]);
    expect(
      attributes.filter(
        ({ name, value }) =>
          (name === "class" || name === "style") &&
          (value.includes(PROBE) || value.includes("url(")),
      ),
    ).toEqual([]);
    expect(element.querySelector("a, img, [href], [src]")).toBeNull();
    const html = element.querySelector(".katex-html")!;
    expect(html).toHaveAttribute("aria-hidden", "true");
    expect(
      [...html.querySelectorAll<HTMLElement>("*")].some(
        (node) => node.style.color === "#cc0000" && node.textContent === command,
      ),
    ).toBe(true);
  });

  it("renders markup inside text as characters", () => {
    const element = renderElement(String.raw`$\text{<img src=x onerror=alert(1)>}$`);

    expect(element.querySelector("img")).toBeNull();
    expect(element.querySelector(".katex-html")).toHaveTextContent("<img src=x onerror=alert(1)>");
  });

  it("accepts a color and refuses one carrying further styles", () => {
    expect(
      renderElement(String.raw`$\color{red}x$`).querySelector<HTMLElement>(".mord")!.style.color,
    ).toBe("red");
    expect(
      renderMath(String.raw`$\color{red;background:url(${PROBE_URL})}x$`, false).error,
    ).toMatch(/Invalid color/u);
  });

  it("keeps a macro defined by one span out of the next", () => {
    expect(renderMath(String.raw`$\gdef\leak{1}\leak$`, false).error).toBeNull();
    expect(renderMath(String.raw`$\def\local{1}\local$`, false).error).toBeNull();
    expect(renderMath(String.raw`$\leak$`, false).error).toMatch(/Undefined control sequence/u);
    expect(renderMath(String.raw`$\local$`, false).error).toMatch(/Undefined control sequence/u);
  });

  it("bounds macro expansion and sizes", () => {
    expect(renderMath(String.raw`$\def\a{\a}\a$`, false).error).toMatch(/Too many expansions/u);
    const rule = renderElement(String.raw`$\rule{1000em}{1em}\kern{1000em}$`);
    const styles = getAttributes(rule)
      .filter(({ name }) => name === "style")
      .map(({ value }) => value)
      .join(";");

    expect(styles).toContain("50em");
    expect(styles).not.toContain("1000em");
  });

  it("names the MathML with its TeX and hides the visual copy", () => {
    const element = renderElement("$x^2$");

    expect(element.querySelector("math")?.getAttribute("aria-label")).toBe("x^2");
    expect(element.querySelector("annotation")).toHaveTextContent("x^2");
    expect(element.querySelector(".katex-html")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a double dollar span in display mode", () => {
    expect(renderElement("$$x$$")).toHaveClass("katex-display");
    expect(renderElement("$x$")).not.toHaveClass("katex-display");
  });

  it("reports the parse message of TeX that does not render", () => {
    expect(renderMath(String.raw`$\frac{a$`, false)).toEqual({
      element: null,
      error: expect.stringMatching(/^Unexpected end of input/u),
    });
  });

  it.each([
    ["$x$", false, "x"],
    ["$$\n  a\n$$", false, "\n  a\n"],
    ["$`x < y`$", false, "x < y"],
    ["$`$", false, "`"],
    [String.raw`$x\|y$`, false, String.raw`x\|y`],
    [String.raw`$x\|y$`, true, "x|y"],
    [String.raw`$\\|a\\\|b$`, true, String.raw`\\|a\\|b`],
  ])("reads %j in a table cell: %s as %j", (source, inTableCell, tex) => {
    expect(readMathTex(source, inTableCell)).toBe(tex);
  });
});
