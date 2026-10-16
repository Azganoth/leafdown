// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { render, waitFor } from "@/test/utils/react";
import { countInvokeCalls, mockInvokeCommands } from "@/test/utils/tauri";

import { Titlebar } from "./titlebar";
import { SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND } from "./windowControls";

const WINDOW_CONTROLS = [
  { id: "minimize", label: "Minimize window" },
  { id: "maximize", label: "Maximize window" },
  { id: "close", label: "Close window" },
];
const WINDOW_CONTROL_LABELS = WINDOW_CONTROLS.map(({ label }) => label);

// Mirrors the DOM that tauri-plugin-frame injects.
const injectWindowControls = () => {
  const container = document.createElement("div");
  container.setAttribute("data-tauri-frame-tb", "");

  const dragRegion = document.createElement("div");
  dragRegion.setAttribute("data-tauri-drag-region", "");
  container.append(dragRegion);

  for (const { id, label } of WINDOW_CONTROLS) {
    const control = document.createElement("button");
    control.id = `frame-tb-${id}`;
    control.ariaLabel = label;
    container.append(control);
  }

  document.body.prepend(container);

  return container;
};

const getWindowControls = () => [
  ...document.querySelectorAll<HTMLElement>("[data-tauri-frame-tb] > button"),
];

const expectControlsOutOfTabSequence = async () => {
  await waitFor(() => {
    const controls = getWindowControls();

    expect(controls).toHaveLength(WINDOW_CONTROL_LABELS.length);
    for (const control of controls) {
      expect(control).toHaveAttribute("tabindex", "-1");
    }
  });
};

beforeEach(() => {
  mockInvokeCommands({ [SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND]: () => undefined });
});

afterEach(() => {
  document.querySelector("[data-tauri-frame-tb]")?.remove();
});

describe("Titlebar", () => {
  it("keeps window controls injected before mount out of the tab sequence", async () => {
    injectWindowControls();

    render(<Titlebar />);

    await expectControlsOutOfTabSequence();
  });

  it("keeps window controls injected after mount out of the tab sequence", async () => {
    render(<Titlebar />);

    injectWindowControls();

    await expectControlsOutOfTabSequence();
  });

  it("leaves the accessible names of the window controls intact", async () => {
    injectWindowControls();

    render(<Titlebar />);

    await expectControlsOutOfTabSequence();
    expect(getWindowControls().map((control) => control.ariaLabel)).toEqual(WINDOW_CONTROL_LABELS);
  });

  it("places the native maximize region once the window controls are injected", async () => {
    render(<Titlebar />);

    injectWindowControls();

    await waitFor(() => expect(countInvokeCalls(SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND)).toBe(1));
  });

  it("stops observing once the window controls are unmounted", async () => {
    const { unmount } = render(<Titlebar />);

    unmount();
    injectWindowControls();

    await waitFor(() => expect(getWindowControls()).toHaveLength(WINDOW_CONTROL_LABELS.length));
    for (const control of getWindowControls()) {
      expect(control).not.toHaveAttribute("tabindex");
    }
    expect(countInvokeCalls(SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND)).toBe(0);
  });
});
