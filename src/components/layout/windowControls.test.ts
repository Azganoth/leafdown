// @vitest-environment happy-dom

import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { countInvokeCalls, getLastInvokeArgs, mockInvokeCommands } from "@/test/utils/tauri";

import {
  SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND,
  trackMaximizeControl as startTrackingMaximizeControl,
  type MaximizeControlBounds,
} from "./windowControls";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const toRect = ({ left, top, width, height }: Box) =>
  DOMRect.fromRect({ x: left, y: top, width, height });

// The plugin's bar spans the window and lays out minimize, maximize, and close at its right edge.
const renderControls = (windowWidth: number, buttonWidth: number, buttonHeight: number) => {
  const bar = document.createElement("div");
  bar.setAttribute("data-tauri-frame-tb", "");
  const maximize = document.createElement("button");
  maximize.id = "frame-tb-maximize";
  bar.append(maximize);
  document.body.append(bar);

  const layout = { windowWidth, buttonWidth, buttonHeight };
  vi.spyOn(bar, "getBoundingClientRect").mockImplementation(() =>
    toRect({ left: 0, top: 0, width: layout.windowWidth, height: layout.buttonHeight }),
  );
  vi.spyOn(maximize, "getBoundingClientRect").mockImplementation(() =>
    toRect({
      left: layout.windowWidth - 2 * layout.buttonWidth,
      top: 0,
      width: layout.buttonWidth,
      height: layout.buttonHeight,
    }),
  );

  return { layout, maximize };
};

let stopTracking: (() => void)[] = [];

const trackMaximizeControl = (control: HTMLElement) => {
  const stop = startTrackingMaximizeControl(control);
  stopTracking.push(stop);
  return stop;
};

let animationFrames: FrameRequestCallback[] = [];
let resizeCallbacks: (() => void)[] = [];
let observedBoxes: (ResizeObserverBoxOptions | undefined)[] = [];

const flushAnimationFrames = () => {
  const frames = animationFrames;
  animationFrames = [];
  frames.forEach((frame) => frame(0));
};

const reportedBounds = () =>
  getLastInvokeArgs<{ bounds: MaximizeControlBounds | null }>(SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND)
    .bounds;

beforeEach(() => {
  mockInvokeCommands({ [SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND]: () => undefined });
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => animationFrames.push(callback)),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }

      observe(_element: Element, options?: ResizeObserverOptions) {
        observedBoxes.push(options?.box);
      }

      disconnect() {}
    },
  );
});

afterEach(() => {
  stopTracking.forEach((stop) => stop());
  stopTracking = [];
  document.querySelector("[data-tauri-frame-tb]")?.remove();
  animationFrames = [];
  resizeCallbacks = [];
  observedBoxes = [];
  vi.unstubAllGlobals();
});

describe("trackMaximizeControl", () => {
  it("reports the rendered maximize control in physical pixels from the right edge", () => {
    vi.stubGlobal("devicePixelRatio", 1.5);
    const { maximize } = renderControls(800, 52, 32);

    trackMaximizeControl(maximize);

    expect(reportedBounds()).toEqual({ right: 78, top: 0, width: 78, height: 48 });
  });

  it("follows the device-pixel size, which zoom and display scale change", () => {
    const { layout, maximize } = renderControls(800, 52, 32);

    trackMaximizeControl(maximize);

    expect(observedBoxes).toEqual(["device-pixel-content-box"]);

    // Zooming the webview to 125% shrinks the CSS layout while the window keeps its size.
    vi.stubGlobal("devicePixelRatio", 1.25);
    layout.windowWidth = 640;
    resizeCallbacks.forEach((callback) => callback());
    flushAnimationFrames();

    expect(reportedBounds()).toEqual({ right: 65, top: 0, width: 65, height: 40 });
  });

  it("does not report again while a window resize leaves the control unchanged", () => {
    const { layout, maximize } = renderControls(800, 52, 32);

    trackMaximizeControl(maximize);
    layout.windowWidth = 1280;
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    flushAnimationFrames();

    expect(countInvokeCalls(SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND)).toBe(1);
  });

  it("removes the region while the control is not rendered", () => {
    const { layout, maximize } = renderControls(800, 52, 32);

    trackMaximizeControl(maximize);
    layout.buttonWidth = 0;
    window.dispatchEvent(new Event("resize"));
    flushAnimationFrames();

    expect(reportedBounds()).toBeNull();
  });

  it("stops reporting once disposed", () => {
    const { layout, maximize } = renderControls(800, 52, 32);

    const stop = trackMaximizeControl(maximize);
    stop();
    layout.buttonHeight = 40;
    window.dispatchEvent(new Event("resize"));
    flushAnimationFrames();

    expect(countInvokeCalls(SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND)).toBe(1);
  });

  it("reports the same bounds again after a failed report", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(invoke).mockRejectedValueOnce(new Error("window is closing"));
    const { maximize } = renderControls(800, 52, 32);

    trackMaximizeControl(maximize);
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
    window.dispatchEvent(new Event("resize"));
    flushAnimationFrames();

    expect(countInvokeCalls(SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND)).toBe(2);
  });
});
