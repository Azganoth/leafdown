import type { ResolvedPos } from "@milkdown/kit/prose/model";
import { type KatexOptions, ParseError, render } from "katex";

import { t } from "@/lib/i18n";

import { isDisplayMathSource } from "./mathSyntax";

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

// The TeX a span renders: its content inside the delimiters, without the backticks of GitHub's
// `` $`...`$ `` form. A table cell drops its `\|` escapes before anything inside it is read, as GFM
// does for a code span, so the TeX there holds a pipe where the file holds `\|`.
export const readMathTex = (source: string, inTableCell: boolean) => {
  const delimiterSize = isDisplayMathSource(source) ? 2 : 1;
  const content = source.slice(delimiterSize, source.length - delimiterSize);
  const tex =
    delimiterSize === 1 && content.length >= 2 && content.startsWith("`") && content.endsWith("`")
      ? content.slice(1, -1)
      : content;
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

export const renderMath = (source: string, inTableCell: boolean): MathRenderResult => {
  const tex = readMathTex(source, inTableCell);
  const container = document.createElement("span");

  try {
    render(tex, container, {
      ...MATH_RENDER_OPTIONS,
      displayMode: isDisplayMathSource(source),
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

export const describeMathError = (error: string) => t("editor.math.error", { message: error });

// A render costing more than this is one typing would wait on, so its preview waits for typing to
// pause instead of following each keystroke.
const MATH_PREVIEW_RENDER_BUDGET_MS = 8;
const MATH_PREVIEW_IDLE_DELAY_MS = 300;

// Each edit to projected source draws a new preview. One that replaces a preview still on screen
// continues the same session, so while renders are costly it takes over the previous rendering and
// catches up once typing pauses. Every other preview renders at once.
export const createMathPreviewRenderer = () => {
  let current: HTMLElement | null = null;
  let renderCost = 0;
  let pendingRender: ReturnType<typeof setTimeout> | undefined;

  const fill = (element: HTMLElement, source: string, inTableCell: boolean) => {
    const start = performance.now();
    const rendered = renderMath(source, inTableCell);
    renderCost = performance.now() - start;
    element.dataset.mathRendered = String(rendered.error === null);
    element.replaceChildren(rendered.element ?? describeMathError(rendered.error));
  };

  return (source: string, inTableCell: boolean) => {
    const element = document.createElement("span");
    element.contentEditable = "false";
    const previous = current;
    current = element;
    clearTimeout(pendingRender);

    if (previous?.isConnected && renderCost > MATH_PREVIEW_RENDER_BUDGET_MS) {
      element.dataset.mathRendered = previous.dataset.mathRendered;
      element.replaceChildren(...previous.childNodes);
      pendingRender = setTimeout(() => {
        if (element.isConnected) fill(element, source, inTableCell);
      }, MATH_PREVIEW_IDLE_DELAY_MS);
    } else {
      fill(element, source, inTableCell);
    }

    return element;
  };
};
