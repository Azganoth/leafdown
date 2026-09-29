import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { openRecentPath } from "../support/ui.js";

const math = (value: string) =>
  $(`[data-type="math"][data-value="${value.replaceAll("\\", "\\\\")}"]`);
const preview = () => $(".leafdown-math-preview");

// Projected math source is split into pieces by its marker and command styling, so its text, the
// caret's offset in it, and its bounds are read across every piece.
const readProjection = () =>
  browser.execute(() => {
    const pieces = [...document.querySelectorAll('[data-leafdown-source~="math"]')];
    const selection = window.getSelection();
    const focus = selection?.focusNode;
    let caret: number | null = null;
    if (pieces[0] && selection?.isCollapsed && focus && pieces[0].closest("p")?.contains(focus)) {
      const range = document.createRange();
      range.setStart(pieces[0], 0);
      range.setEnd(focus, selection.focusOffset);
      caret = Math.min(
        range.toString().length,
        pieces.map((piece) => piece.textContent).join("").length,
      );
    }
    const rects = pieces.map((piece) => piece.getBoundingClientRect());
    return {
      bottom: Math.max(...rects.map((rect) => rect.bottom)),
      caret,
      right: Math.max(...rects.map((rect) => rect.right)),
      text: pieces.map((piece) => piece.textContent).join(""),
      top: Math.min(...rects.map((rect) => rect.top)),
    };
  });

const waitForProjection = (text: string) =>
  browser.waitUntil(async () => (await readProjection()).text === text, {
    timeoutMsg: `Projected math source did not become ${text}.`,
  });

const readPreviewRect = () =>
  browser.execute(() => {
    const { bottom, left, top } = document
      .querySelector(".leafdown-math-preview")!
      .getBoundingClientRect();
    return { bottom, left, top };
  });

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
        const paragraph = node.parentElement!;
        const trailingBreak = paragraph.querySelector<HTMLElement>(
          ":scope > br.ProseMirror-trailingBreak",
        );
        const separator = paragraph.querySelector<HTMLElement>(
          ":scope > img.ProseMirror-separator",
        );
        return {
          display: getComputedStyle(node).display,
          bottomSpace:
            paragraph.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom,
          separatorPosition: separator ? getComputedStyle(separator).position : null,
          textAlign: getComputedStyle(katex).textAlign,
          topSpace: node.getBoundingClientRect().top - paragraph.getBoundingClientRect().top,
          trailingBreakDisplay: trailingBreak ? getComputedStyle(trailingBreak).display : null,
        };
      }),
    ).toEqual({
      display: "block",
      bottomSpace: 8,
      separatorPosition: "absolute",
      textAlign: "center",
      topSpace: 8,
      trailingBreakDisplay: "none",
    });

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
    await waitForProjection("$x^2$");
    const inlineSource = await readProjection();
    expect(inlineSource.caret).toBe(1);
    const inlinePreview = await readPreviewRect();
    expect(inlinePreview.left).toBeGreaterThanOrEqual(inlineSource.right - 1);
    expect(inlinePreview.top).toBeLessThan(inlineSource.bottom);
    expect(inlinePreview.bottom).toBeGreaterThan(inlineSource.top);
    expect(await preview().execute((node) => node.querySelector("annotation")?.textContent)).toBe(
      "x^2",
    );

    expect(
      await browser.execute(() => document.activeElement?.classList.contains("ProseMirror")),
    ).toBe(true);
    await $(".ProseMirror").addValue("z");
    expect((await readProjection()).text).toBe("$zx^2$");
    expect(await preview().execute((node) => node.querySelector("annotation")?.textContent)).toBe(
      "zx^2",
    );
    await browser.keys([Key.Ctrl, "s", Key.NULL]);
    const edited = original.replace("$x^2$", "$zx^2$");
    await browser.waitUntil(async () => (await readFile(fixture.path, "utf8")) === edited);
    await expect(math("$zx^2$")).toHaveAttribute("data-math-rendered", "true");

    await pressMath(display);
    await waitForProjection("$$\n  a\n    b\n$$");
    await expect(preview()).toHaveAttribute("class", /\bleafdown-math-preview--block\b/u);
    expect((await readPreviewRect()).top).toBeGreaterThanOrEqual(
      (await readProjection()).bottom - 1,
    );

    await pressMath(math("$50\\%$"));
    await waitForProjection("$50\\%$");
    expect(
      await browser.execute(() => {
        const pieces = [...document.querySelectorAll('[data-leafdown-source~="math"]')];
        const colorOf = (text: string) =>
          getComputedStyle(pieces.find((piece) => piece.textContent === text)!).color;
        const [delimiter, content, command] = [colorOf("$"), colorOf("50"), colorOf("\\%")];
        return {
          commandStandsApart: command !== delimiter && command !== content,
          contentIsNotMuted: content !== delimiter,
        };
      }),
    ).toEqual({ commandStandsApart: true, contentIsNotMuted: true });

    expect(
      await browser.execute(
        () => (window as unknown as { mathCspViolations: string[] }).mathCspViolations,
      ),
    ).toEqual([]);

    await browser.execute(() => {
      const node = document.querySelector<HTMLElement>('[data-type="math"][data-value="$zx^2$"]')!;
      const before = node.previousSibling!;
      const range = document.createRange();
      range.setStart(before, before.textContent!.length);
      range.collapse(true);
      node.closest<HTMLElement>(".ProseMirror")!.focus();
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await waitForProjection("$zx^2$");
    expect((await readProjection()).caret).toBe(0);
    await browser.keys(Key.ArrowRight);
    expect((await readProjection()).caret).toBe(1);
  });
});
