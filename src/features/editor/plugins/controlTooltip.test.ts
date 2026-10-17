// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { TOOLTIP_DELAY, TOOLTIP_INSTANT_TIMEOUT } from "@/components/ui/tooltip";
import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { dispatchKeyDown, dispatchMouseDown, dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";

import type { ControlTooltipRequest } from "./controlTooltip";
import { toggleHeadingFold } from "./headingFold";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const CODE_BLOCK = ["```js", "code", "```"].join("\n");

const mountWithTooltips = async (markdown: string) => {
  const requests: ControlTooltipRequest[] = [];
  const onClose = vi.fn();
  const mounted = await mountEditor(markdown, {
    onControlTooltipClosed: onClose,
    onControlTooltipRequested: (request) => requests.push(request),
  });

  return { mounted, onClose, requests };
};

// Fake time starts after mounting, which waits on real timers, and past any instant phase an
// earlier test left behind.
const useTooltipTime = () => {
  vi.useFakeTimers();
  vi.advanceTimersByTime(TOOLTIP_INSTANT_TIMEOUT);
};

const pointAt = (target: Element, init: MouseEventInit = {}) =>
  dispatchMouseEvent(target, "mouseover", init);

const restOn = (target: Element) => {
  pointAt(target);
  vi.advanceTimersByTime(TOOLTIP_DELAY);
};

const getCodeControls = (root: ParentNode) => {
  const [, softWrap, lineNumbers] =
    root.querySelectorAll<HTMLButtonElement>(".leafdown-code-control");

  if (!softWrap || !lineNumbers) throw new Error("Expected the code block controls.");

  return { lineNumbers, softWrap };
};

const findHeadingPosition = (mounted: MountedMilkdownEditor, text: string) => {
  let position: number | null = null;

  mounted.view.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.textContent === text) position = pos;
    return position === null;
  });

  if (position === null) throw new Error(`Expected a heading reading ${text}.`);

  return position;
};

describe("editor control tooltips", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("names a code block control once the pointer rests on it, and the next one at once", async () => {
    const { mounted, onClose, requests } = await mountWithTooltips(CODE_BLOCK);
    const { lineNumbers, softWrap } = getCodeControls(mounted.view.dom);
    useTooltipTime();

    pointAt(softWrap);
    vi.advanceTimersByTime(TOOLTIP_DELAY - 1);

    expect(requests).toHaveLength(0);

    vi.advanceTimersByTime(1);

    expect(requests).toEqual([{ anchor: softWrap, label: softWrap.getAttribute("aria-label") }]);

    pointAt(lineNumbers);

    expect(requests.at(-1)).toEqual({
      anchor: lineNumbers,
      label: lineNumbers.getAttribute("aria-label"),
    });

    pointAt(mounted.view.dom);

    expect(onClose).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(TOOLTIP_INSTANT_TIMEOUT);
    pointAt(softWrap);

    expect(requests).toHaveLength(2);

    vi.advanceTimersByTime(TOOLTIP_DELAY);

    expect(requests).toHaveLength(3);
  });

  it("waits again while the pointer keeps moving, and not for a control it left", async () => {
    const { mounted, requests } = await mountWithTooltips(CODE_BLOCK);
    const { softWrap } = getCodeControls(mounted.view.dom);
    useTooltipTime();

    pointAt(softWrap);
    vi.advanceTimersByTime(TOOLTIP_DELAY - 100);
    dispatchMouseEvent(softWrap, "mousemove");
    vi.advanceTimersByTime(TOOLTIP_DELAY - 100);

    expect(requests).toHaveLength(0);

    vi.advanceTimersByTime(100);

    expect(requests).toHaveLength(1);

    pointAt(mounted.view.dom);
    vi.advanceTimersByTime(TOOLTIP_INSTANT_TIMEOUT);
    pointAt(softWrap);
    pointAt(mounted.view.dom);
    vi.advanceTimersByTime(TOOLTIP_DELAY);

    expect(requests).toHaveLength(1);
  });

  it("names a focused control at once", async () => {
    const { mounted, requests } = await mountWithTooltips(CODE_BLOCK);
    const { softWrap } = getCodeControls(mounted.view.dom);
    useTooltipTime();
    vi.spyOn(softWrap, "matches").mockImplementation((selector) => selector === ":focus-visible");

    softWrap.focus();

    expect(requests).toEqual([{ anchor: softWrap, label: softWrap.getAttribute("aria-label") }]);
  });

  it("gives no tooltip to controls whose glyph or place says what they do", async () => {
    const { mounted, requests } = await mountWithTooltips(
      [
        "## Install",
        "",
        "Step one",
        "",
        CODE_BLOCK,
        "",
        "???+ note",
        "    Body",
        "",
        "| A | B |",
        "| - | - |",
        "| 1 | 2 |",
      ].join("\n"),
    );
    toggleHeadingFold(mounted.view, findHeadingPosition(mounted, "Install"));
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        [
          "[data-leafdown-block-handle]",
          "[data-leafdown-table-grip]",
          "[data-leafdown-table-insert]",
          "[data-leafdown-callout-type]",
          ".leafdown-callout-toggle",
          ".leafdown-code-collapse",
          "[data-leafdown-block-insert]",
          ".leafdown-fold-indicator",
        ].join(", "),
      ),
    ];
    useTooltipTime();

    expect(controls.length).toBeGreaterThanOrEqual(9);

    for (const control of controls) {
      expect(control.getAttribute("aria-label")).toBeTruthy();
      expect(control).not.toHaveAttribute("data-leafdown-tooltip");
      expect(control).not.toHaveAttribute("title");
      restOn(control);
    }

    expect(requests).toHaveLength(0);
  });

  it("stays closed during a press or drag and closes on a press or Escape", async () => {
    const { mounted, onClose, requests } = await mountWithTooltips(CODE_BLOCK);
    const { softWrap } = getCodeControls(mounted.view.dom);
    useTooltipTime();

    pointAt(softWrap, { buttons: 1 });
    vi.advanceTimersByTime(TOOLTIP_DELAY);

    expect(requests).toHaveLength(0);

    restOn(softWrap);
    dispatchMouseDown(softWrap, { button: 0 });

    expect(onClose).toHaveBeenCalledTimes(1);

    pointAt(document.body);
    restOn(softWrap);
    dispatchKeyDown(document.body, "Escape");

    expect(requests).toHaveLength(2);
    expect(onClose).toHaveBeenCalledTimes(2);

    pointAt(document.body);
    vi.advanceTimersByTime(TOOLTIP_INSTANT_TIMEOUT);
    pointAt(softWrap);
    dispatchMouseDown(softWrap, { button: 0 });
    vi.advanceTimersByTime(TOOLTIP_DELAY);

    expect(requests).toHaveLength(2);
  });

  it("answers only for its own editor's controls", async () => {
    const first = await mountWithTooltips(CODE_BLOCK);
    const second = await mountWithTooltips(CODE_BLOCK);
    const firstControl = getCodeControls(first.mounted.view.dom).softWrap;
    const secondControl = getCodeControls(second.mounted.view.dom).softWrap;
    useTooltipTime();

    restOn(secondControl);

    expect(first.requests).toHaveLength(0);
    expect(second.requests.map(({ anchor }) => anchor)).toEqual([secondControl]);

    pointAt(firstControl);

    expect(first.requests.map(({ anchor }) => anchor)).toEqual([firstControl]);
    expect(second.requests).toHaveLength(1);
  });
});
