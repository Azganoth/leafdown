// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { withMacUserAgent, withWindowsUserAgent } from "@/test/utils/platform";
import { render, screen } from "@/test/utils/react";

import { WelcomeScreen } from "./welcome-screen";

describe("WelcomeScreen shortcuts", () => {
  it.each([
    ["Windows", withWindowsUserAgent, "Ctrl+Shift+O", ["Ctrl", "Shift", "O"]],
    ["macOS", withMacUserAgent, "Shift+Command+O", ["⇧", "⌘", "O"]],
  ] as const)("shows the Open folder shortcut on %s", async (_, platform, name, labels) => {
    await platform(() => {
      render(<WelcomeScreen />);
      const button = screen.getByRole("button", { name: "Open folder" });
      expect(button).toHaveAccessibleDescription(name);
      expect(
        [...button.querySelectorAll('[data-slot="keycap"]')].map((key) => key.textContent),
      ).toEqual(labels);
      expect(button).not.toHaveTextContent("Mod");
    });
  });
});
