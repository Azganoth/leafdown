// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { withMacUserAgent, withWindowsUserAgent } from "@/test/utils/platform";
import { render, screen } from "@/test/utils/react";

import { ShortcutKeys } from "./shortcut-keys";

describe("ShortcutKeys", () => {
  it("keeps visual keycaps out of the accessible name", async () => {
    await withMacUserAgent(() => {
      const { container } = render(
        <button>
          <ShortcutKeys keys={["Mod", "Shift", "f"]} />
        </button>,
      );
      expect(screen.getByRole("button")).toHaveAccessibleName("Shift+Command+F");
      expect(
        [...container.querySelectorAll("kbd[aria-hidden]")].map((key) => key.textContent),
      ).toEqual(["⇧", "⌘", "F"]);
      expect(container.querySelectorAll("kbd[aria-hidden]")).toHaveLength(3);
    });
  });

  it("shows one key hint without repeating its accessible name", async () => {
    await withWindowsUserAgent(() => {
      render(
        <button>
          Run <ShortcutKeys keys={["Enter"]} size="sm" variant="primary" />
        </button>,
      );
      expect(screen.getByRole("button")).toHaveAccessibleName("Run Enter");
    });
  });
});
