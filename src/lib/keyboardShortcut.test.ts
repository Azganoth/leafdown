import { describe, expect, it } from "vitest";

import { withMacUserAgent, withUserAgent, withWindowsUserAgent } from "@/test/utils/platform";

import { getShortcutKeys, parseKeyboardKeys, presentKeyboardKeys } from "./keyboardShortcut";

describe("keyboard shortcut presentation", () => {
  it("uses Ctrl on Windows and Linux without changing the shortcut", async () => {
    const shortcut = { key: "f", mod: true, alt: true, shift: true };
    const keys = getShortcutKeys(shortcut);
    for (const userAgent of ["Windows", "Linux"]) {
      await withUserAgent(userAgent, () => {
        expect(presentKeyboardKeys(keys)).toEqual([
          { label: "Ctrl", accessible: "Ctrl" },
          { label: "Alt", accessible: "Alt" },
          { label: "Shift", accessible: "Shift" },
          { label: "F", accessible: "F" },
        ]);
      });
    }
    expect(keys).toEqual(["Mod", "Alt", "Shift", "f"]);
  });

  it("uses macOS modifier symbols in platform order and full accessible names", async () => {
    await withMacUserAgent(() => {
      expect(presentKeyboardKeys(["Mod", "Shift", "Alt", "Ctrl", "f"])).toEqual([
        { label: "⌃", accessible: "Control" },
        { label: "⌥", accessible: "Option" },
        { label: "⇧", accessible: "Shift" },
        { label: "⌘", accessible: "Command" },
        { label: "F", accessible: "F" },
      ]);
    });
  });

  it("shortens navigation labels while retaining full accessible names", async () => {
    await withWindowsUserAgent(() => {
      expect(
        presentKeyboardKeys([
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "PageUp",
          "PageDown",
          "Escape",
          "ContextMenu",
        ]),
      ).toEqual([
        { label: "↑", accessible: "Up Arrow" },
        { label: "↓", accessible: "Down Arrow" },
        { label: "←", accessible: "Left Arrow" },
        { label: "→", accessible: "Right Arrow" },
        { label: "PgUp", accessible: "Page Up" },
        { label: "PgDn", accessible: "Page Down" },
        { label: "Esc", accessible: "Escape" },
        { label: "Menu", accessible: "Menu" },
      ]);
    });
  });

  it.each([
    "Mod+Shift+F",
    "Ctrl+PageDown",
    "Enter",
    "Escape",
    "F24",
    "Shift",
    "Mod",
    "Alt+Down",
    "Mod++",
    "Mod+\\",
  ])("recognizes key notation %s", (text) => {
    expect(parseKeyboardKeys(text)).not.toBeNull();
  });

  it.each([
    "",
    "code",
    "Table",
    "Delete sentence",
    "F25",
    "Mod+unknown",
    "src/file.ts",
    "a",
    "+",
    "Ctrl++F",
    "Mod+Mod+F",
    "constructor",
    "__proto__",
  ])("preserves ordinary code %s", (text) => {
    expect(parseKeyboardKeys(text)).toBeNull();
  });
});
