// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { dispatchKeyDown, dispatchMouseDown, dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";

import type { ControlTooltipRequest } from "./controlTooltip";
import { toggleHeadingFold } from "./headingFold";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const mountWithTooltips = async (markdown: string) => {
  const requests: ControlTooltipRequest[] = [];
  const onClose = vi.fn();
  const mounted = await mountEditor(markdown, {
    onControlTooltipClosed: onClose,
    onControlTooltipRequested: (request) => requests.push(request),
  });

  return { mounted, onClose, requests };
};

const pointAt = (target: Element, init: MouseEventInit = {}) =>
  dispatchMouseEvent(target, "mouseover", init);

const getHandle = () =>
  document.querySelector<HTMLButtonElement>("[data-leafdown-block-handle]") ??
  (() => {
    throw new Error("Expected a block handle.");
  })();

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
  it("names a block handle in the gutter while the pointer is on it", async () => {
    const { mounted, onClose, requests } = await mountWithTooltips("Intro paragraph");
    const handle = getHandle();

    expect(handle).not.toHaveAttribute("title");

    pointAt(handle);

    expect(requests).toEqual([{ anchor: handle, label: handle.getAttribute("aria-label") }]);

    pointAt(mounted.view.dom);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("names the code block toggles, callout controls, and the folded-section indicator", async () => {
    const { mounted, requests } = await mountWithTooltips(
      ["## Install", "", "Step one", "", "```js", "code", "```", "", "???+ note", "    Body"].join(
        "\n",
      ),
    );
    const controls = [
      ...mounted.view.dom.querySelectorAll<HTMLButtonElement>(
        ".leafdown-code-control, .leafdown-code-collapse",
      ),
      mounted.view.dom.querySelector<HTMLButtonElement>("[data-leafdown-callout-type]")!,
      mounted.view.dom.querySelector<HTMLButtonElement>(".leafdown-callout-toggle")!,
    ];

    expect(controls.length).toBeGreaterThanOrEqual(4);

    for (const control of controls) {
      expect(control).not.toHaveAttribute("title");
      pointAt(control);
      expect(requests.at(-1)).toEqual({
        anchor: control,
        label: control.getAttribute("aria-label"),
      });
    }

    toggleHeadingFold(mounted.view, findHeadingPosition(mounted, "Install"));
    const indicator = mounted.view.dom.querySelector(".leafdown-fold-indicator")!;
    pointAt(indicator);

    expect(requests.at(-1)).toEqual({ anchor: indicator, label: "Unfold section" });
  });

  it("stays closed during a press or drag and closes on a press or Escape", async () => {
    const { onClose, requests } = await mountWithTooltips("Intro paragraph");
    const handle = getHandle();

    pointAt(handle, { buttons: 1 });

    expect(requests).toHaveLength(0);

    pointAt(handle);
    dispatchMouseDown(handle, { button: 0 });

    expect(onClose).toHaveBeenCalledTimes(1);

    pointAt(document.body);
    pointAt(handle);
    dispatchKeyDown(document.body, "Escape");

    expect(requests).toHaveLength(2);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("answers only for its own editor's controls", async () => {
    const first = await mountWithTooltips("First paragraph");
    const second = await mountWithTooltips("Second paragraph");
    const [firstHandle, secondHandle] = document.querySelectorAll<HTMLButtonElement>(
      "[data-leafdown-block-handle]",
    );

    pointAt(secondHandle);

    expect(first.requests).toHaveLength(0);
    expect(second.requests.map(({ anchor }) => anchor)).toEqual([secondHandle]);

    pointAt(firstHandle);

    expect(first.requests.map(({ anchor }) => anchor)).toEqual([firstHandle]);
    expect(second.requests).toHaveLength(1);
  });
});
