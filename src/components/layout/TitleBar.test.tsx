import { afterEach, describe, expect, it } from "vitest";

import { render, waitFor } from "@/test/utils/react";

import { TitleBar } from "./TitleBar";

const WINDOW_CONTROL_LABELS = ["Minimize window", "Maximize window", "Close window"];

// Mirrors the DOM that tauri-plugin-frame injects.
const injectWindowControls = () => {
  const container = document.createElement("div");
  container.setAttribute("data-tauri-frame-tb", "");

  const dragRegion = document.createElement("div");
  dragRegion.setAttribute("data-tauri-drag-region", "");
  container.append(dragRegion);

  for (const label of WINDOW_CONTROL_LABELS) {
    const control = document.createElement("button");
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

afterEach(() => {
  document.querySelector("[data-tauri-frame-tb]")?.remove();
});

describe("TitleBar", () => {
  it("keeps window controls injected before mount out of the tab sequence", async () => {
    injectWindowControls();

    render(<TitleBar />);

    await expectControlsOutOfTabSequence();
  });

  it("keeps window controls injected after mount out of the tab sequence", async () => {
    render(<TitleBar />);

    injectWindowControls();

    await expectControlsOutOfTabSequence();
  });

  it("leaves the accessible names of the window controls intact", async () => {
    injectWindowControls();

    render(<TitleBar />);

    await expectControlsOutOfTabSequence();
    expect(getWindowControls().map((control) => control.ariaLabel)).toEqual(WINDOW_CONTROL_LABELS);
  });

  it("stops observing once the window controls are unmounted", async () => {
    const { unmount } = render(<TitleBar />);

    unmount();
    injectWindowControls();

    await waitFor(() => expect(getWindowControls()).toHaveLength(WINDOW_CONTROL_LABELS.length));
    for (const control of getWindowControls()) {
      expect(control).not.toHaveAttribute("tabindex");
    }
  });
});
