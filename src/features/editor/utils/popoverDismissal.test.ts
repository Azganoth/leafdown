// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { isDismissedFromOutside } from "./popoverDismissal";

describe("isDismissedFromOutside", () => {
  it("counts a press outside", () => {
    expect(
      isDismissedFromOutside({ event: new MouseEvent("click"), reason: "outside-press" }),
    ).toBe(true);
  });

  it("counts focus another element took", () => {
    const event = new FocusEvent("focusout", { relatedTarget: document.createElement("button") });

    expect(isDismissedFromOutside({ event, reason: "focus-out" })).toBe(true);
  });

  it("does not count focus lost to nothing", () => {
    const event = new FocusEvent("focusout", { relatedTarget: null });

    expect(isDismissedFromOutside({ event, reason: "focus-out" })).toBe(false);
  });

  it("does not count Escape", () => {
    expect(
      isDismissedFromOutside({ event: new KeyboardEvent("keydown"), reason: "escape-key" }),
    ).toBe(false);
  });
});
