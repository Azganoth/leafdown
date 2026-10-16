import { invoke } from "@tauri-apps/api/core";

import { handleUnexpectedError } from "@/lib/errors";

export const SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND = "set_maximize_control_bounds";

// Injected by tauri-plugin-frame; without `withGlobalTauri` they never appear.
export const WINDOW_CONTROL_SELECTOR = "[data-tauri-frame-tb] > button";
const MAXIMIZE_CONTROL_SELECTOR = "#frame-tb-maximize";

/** Physical pixels, measured from the top and right edges of the window's client area. */
export interface MaximizeControlBounds {
  right: number;
  top: number;
  width: number;
  height: number;
}

// Native Win32 caption buttons are non-client area and never in the tab
// sequence. `-1` rather than removal keeps these labeled for screen readers.
export const removeWindowControlsFromTabSequence = () => {
  const controls = document.querySelectorAll<HTMLElement>(WINDOW_CONTROL_SELECTOR);

  controls.forEach((control) => {
    control.tabIndex = -1;
  });

  return controls.length > 0;
};

export const findMaximizeControl = () =>
  document.querySelector<HTMLElement>(MAXIMIZE_CONTROL_SELECTOR);

// The controls are anchored to the right edge of a full-width bar, so measuring from that edge
// keeps the native region aligned while the window resizes.
const measureMaximizeControl = (control: HTMLElement): MaximizeControlBounds | null => {
  const bar = control.parentElement;
  const rect = control.getBoundingClientRect();

  if (!bar || rect.width === 0 || rect.height === 0) {
    return null;
  }

  const scale = window.devicePixelRatio;
  const rightInset = bar.getBoundingClientRect().right - rect.right;
  const right = Math.round(rightInset * scale);
  const top = Math.round(rect.top * scale);

  return {
    right,
    top,
    width: Math.round((rightInset + rect.width) * scale) - right,
    height: Math.round(rect.bottom * scale) - top,
  };
};

const isSameBounds = (left: MaximizeControlBounds | null, right: MaximizeControlBounds | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.right === right.right &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height);

/**
 * Keeps the native snap layouts region over the rendered maximize control. Zoom and display scale
 * change its size in physical pixels, which the device-pixel box reports.
 */
export const trackMaximizeControl = (control: HTMLElement) => {
  let reported: MaximizeControlBounds | null | undefined;
  let frame = 0;

  const report = () => {
    frame = 0;
    const bounds = measureMaximizeControl(control);

    if (reported !== undefined && isSameBounds(reported, bounds)) {
      return;
    }

    reported = bounds;
    invoke<void>(SET_MAXIMIZE_CONTROL_BOUNDS_COMMAND, { bounds }).catch((error: unknown) => {
      reported = undefined;
      handleUnexpectedError(error, "setMaximizeControlBounds");
    });
  };

  const scheduleReport = () => {
    if (frame === 0) {
      frame = requestAnimationFrame(report);
    }
  };

  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleReport);
  resizeObserver?.observe(control, { box: "device-pixel-content-box" });
  window.addEventListener("resize", scheduleReport);
  report();

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    window.removeEventListener("resize", scheduleReport);
  };
};
