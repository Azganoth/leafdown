import type { ResolvedPos } from "@milkdown/kit/prose/model";
import { type KatexOptions, ParseError, render } from "katex";

import { t } from "@/lib/i18n";

import { getMathContentRange, isDisplayMathSource } from "./mathSyntax";

// Document math must never become application markup or network activity. Untrusted, KaTeX renders
// every command that would link, load, or attach an author-chosen class, id, style, or data
// attribute as inert error text. Sizes and macro expansion are bounded, and each render starts from
// an empty macro table so a `\gdef` in one span cannot reach another.
const MATH_RENDER_OPTIONS = {
  maxExpand: 1000,
  maxSize: 50,
  output: "htmlAndMathml",
  strict: "ignore",
  throwOnError: true,
  trust: false,
} as const satisfies KatexOptions;

const TABLE_CELL_ESCAPE_PATTERN = /\\([\\|])/gu;

// A table cell drops its `\|` escapes before anything inside it is read, as GFM does for a code
// span, so the TeX there holds a pipe where the file holds `\|`.
export const readMathTex = (source: string, inTableCell: boolean) => {
  const { from, to } = getMathContentRange(source);
  const tex = source.slice(from, to);
  return inTableCell
    ? tex.replace(TABLE_CELL_ESCAPE_PATTERN, (escape, character: string) =>
        character === "|" ? character : escape,
      )
    : tex;
};

export const isInTableCell = ($position: ResolvedPos) => {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const name = $position.node(depth).type.name;
    if (name === "table_cell" || name === "table_header") return true;
  }
  return false;
};

export type MathRenderResult =
  | { element: HTMLElement; error: null }
  | { element: null; error: string };

export const renderMathTex = (tex: string, displayMode: boolean): MathRenderResult => {
  const container = document.createElement("span");

  try {
    render(tex, container, {
      ...MATH_RENDER_OPTIONS,
      displayMode,
      macros: {},
    });
  } catch (error) {
    return {
      element: null,
      error:
        error instanceof ParseError
          ? error.rawMessage
          : error instanceof Error
            ? error.message
            : String(error),
    };
  }

  // KaTeX's visual copy is hidden from assistive technology, which reads the MathML. A reader that
  // does not support MathML reads this name instead; Chromium does not take one from `alttext`.
  container.querySelector("math")?.setAttribute("aria-label", tex);
  return { element: container.firstElementChild as HTMLElement, error: null };
};

export const renderMath = (source: string, inTableCell: boolean): MathRenderResult =>
  renderMathTex(readMathTex(source, inTableCell), isDisplayMathSource(source));

export const describeMathError = (error: string) => t("editor.math.error", { message: error });

// A render costing more than this is one typing would wait on, so its preview waits for typing to
// pause instead of following each keystroke.
const MATH_PREVIEW_RENDER_BUDGET_MS = 8;
const MATH_PREVIEW_IDLE_DELAY_MS = 300;

// Each edit to projected source draws the preview again. While the preview is still on screen the
// edit continues its session, and the same element is handed back rather than a new one: moving a
// rendering into a new element would lay all of it out again, which for a large expression costs
// more than rendering it. While renders are costly the element keeps its rendering until typing
// pauses.
export const createMathPreviewRenderer = () => {
  let element: HTMLElement | null = null;
  let renderCost = 0;
  let pendingRender: ReturnType<typeof setTimeout> | undefined;

  const fill = (target: HTMLElement, source: string, inTableCell: boolean) => {
    const start = performance.now();
    const rendered = renderMath(source, inTableCell);
    renderCost = performance.now() - start;
    target.dataset.mathRendered = String(rendered.error === null);
    target.replaceChildren(rendered.element ?? describeMathError(rendered.error));
  };

  return (source: string, inTableCell: boolean) => {
    clearTimeout(pendingRender);

    if (!element?.isConnected) {
      element = document.createElement("span");
      element.contentEditable = "false";
      fill(element, source, inTableCell);
    } else if (renderCost > MATH_PREVIEW_RENDER_BUDGET_MS) {
      const target = element;
      pendingRender = setTimeout(() => {
        if (target.isConnected) fill(target, source, inTableCell);
      }, MATH_PREVIEW_IDLE_DELAY_MS);
    } else {
      fill(element, source, inTableCell);
    }

    return element;
  };
};
