import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

const math = (value: string) =>
  $(`[data-type="math"][data-value="${value.replaceAll("\\", "\\\\")}"]`);
const projected = () => $('[data-leafdown-source~="math"]');
const preview = () => $(".leafdown-math-preview");

const pressMath = (element: ReturnType<typeof math>) =>
  element.execute((node) =>
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true })),
  );

describe("desktop rendered math", () => {
  it("renders math under the app's CSP, previews source edits, and saves the source", async () => {
    const { math: fixture } = await getDesktopE2ERunContext();
    const original = await readFile(fixture.path, "utf8");
    await browser.execute(() => {
      const violations: string[] = [];
      (window as unknown as { mathCspViolations: string[] }).mathCspViolations = violations;
      document.addEventListener("securitypolicyviolation", (event) => {
        violations.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    await openRecentPath(fixture.path);

    const inline = math("$x^2$");
    await expect(inline).toHaveAttribute("data-math-rendered", "true");
    expect(
      await inline.execute((node) => ({
        label: node.querySelector("math")?.getAttribute("aria-label"),
        tex: node.querySelector("annotation")?.textContent,
        visualHidden: node.querySelector(".katex-html")?.getAttribute("aria-hidden"),
      })),
    ).toEqual({ label: "x^2", tex: "x^2", visualHidden: "true" });

    const display = $('[data-type="math"][data-math-flow="block"]');
    await expect(display).toHaveAttribute("data-math-rendered", "true");
    expect(
      await display.execute((node) => {
        const katex = node.querySelector<HTMLElement>(".katex-display > .katex")!;
        return {
          display: getComputedStyle(node).display,
          textAlign: getComputedStyle(katex).textAlign,
        };
      }),
    ).toEqual({ display: "block", textAlign: "center" });

    expect(
      await browser.execute(async () => {
        await document.fonts.ready;
        const variable = document.querySelector<HTMLElement>('[data-type="math"] .mathnormal')!;
        return {
          family: getComputedStyle(variable).fontFamily,
          loaded: [...document.fonts].some(
            (font) => font.family.includes("KaTeX_Math") && font.status === "loaded",
          ),
          requests: performance
            .getEntriesByType("resource")
            .map(({ name }) => name)
            .filter((name) => name.includes("KaTeX_"))
            .map((name) => ({
              sameOrigin: name.startsWith(location.origin),
              woff2: name.endsWith(".woff2"),
            })),
        };
      }),
    ).toEqual({
      family: expect.stringContaining("KaTeX_Math"),
      loaded: true,
      requests: expect.arrayContaining([{ sameOrigin: true, woff2: true }]),
    });

    expect(
      await browser.execute(() => {
        const rendered = [...document.querySelectorAll('[data-type="math"]')];
        return {
          urls: rendered.flatMap((node) => [...node.querySelectorAll("[href], [src], [id]")])
            .length,
          probes: rendered
            .flatMap((node) => [...node.querySelectorAll("[class], [style]")])
            .filter((node) =>
              `${node.getAttribute("class")} ${node.getAttribute("style")}`.includes(
                "leafdown-probe",
              ),
            ).length,
          inert: rendered
            .filter((node) => (node as HTMLElement).dataset.value?.startsWith("$\\h"))
            .map((node) => node.querySelector(".katex-html")?.textContent),
        };
      }),
    ).toEqual({
      urls: 0,
      probes: 0,
      inert: [expect.stringContaining("\\href"), expect.stringContaining("\\htmlClass")],
    });

    const broken = math("$\\frac{a$");
    await expect(broken).toHaveAttribute("data-math-rendered", "false");
    await expect(broken).toHaveText("$\\frac{a$");
    await expect(broken).toHaveAttribute("aria-description", /^Math error: /u);
    expect(
      await math("$x\\|y$").execute((node) => node.querySelector("annotation")?.textContent),
    ).toBe("x|y");

    await pressMath(inline);
    await expect(projected()).toHaveText("$x^2$");
    expect(
      await projected().execute((node) => {
        const selection = window.getSelection();
        if (
          !selection?.isCollapsed ||
          !selection.focusNode ||
          !node.contains(selection.focusNode)
        ) {
          throw new Error("Expected a caret inside projected math source");
        }
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(selection.focusNode, selection.focusOffset);
        return range.toString().length;
      }),
    ).toBe(1);
    expect(
      await browser.execute(() => {
        const source = document
          .querySelector('[data-leafdown-source~="math"]')!
          .getBoundingClientRect();
        const rendered = document.querySelector(".leafdown-math-preview")!.getBoundingClientRect();
        return (
          rendered.left >= source.right - 1 &&
          rendered.top < source.bottom &&
          rendered.bottom > source.top
        );
      }),
    ).toBe(true);
    expect(await preview().execute((node) => node.querySelector("annotation")?.textContent)).toBe(
      "x^2",
    );

    expect(
      await browser.execute(() => document.activeElement?.classList.contains("ProseMirror")),
    ).toBe(true);
    await $(".ProseMirror").addValue("z");
    expect(await projected().execute((node) => node.textContent)).toBe("$zx^2$");
    expect(await preview().execute((node) => node.querySelector("annotation")?.textContent)).toBe(
      "zx^2",
    );
    await browser.keys([Key.Ctrl, "s", Key.NULL]);
    const edited = original.replace("$x^2$", "$zx^2$");
    await browser.waitUntil(async () => (await readFile(fixture.path, "utf8")) === edited);
    await expect(math("$zx^2$")).toHaveAttribute("data-math-rendered", "true");

    await pressMath(display);
    await expect(preview()).toHaveAttribute("class", /\bleafdown-math-preview--block\b/u);
    expect(
      await browser.execute(() => {
        const source = document
          .querySelector('[data-leafdown-source~="math"]')!
          .getBoundingClientRect();
        const rendered = document.querySelector(".leafdown-math-preview")!.getBoundingClientRect();
        return rendered.top >= source.bottom - 1;
      }),
    ).toBe(true);

    expect(
      await browser.execute(
        () => (window as unknown as { mathCspViolations: string[] }).mathCspViolations,
      ),
    ).toEqual([]);
  });
});
