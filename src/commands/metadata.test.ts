import { describe, expect, it } from "vitest";

import { createKeyboardEventLike } from "@/test/utils/events";
import { withMacUserAgent, withWindowsUserAgent } from "@/test/utils/platform";

import { APPLICATION_COMMAND_IDS } from "./application";
import { type AppCommandId } from "./dispatch";
import {
  APPLICATION_SHORTCUT_COMMAND_IDS,
  COMMAND_DEFINITIONS,
  formatShortcut,
  getShortcutSignature,
  matchesShortcut,
} from "./metadata";

describe("command metadata", () => {
  it("limits window-level shortcut routing to application commands", () => {
    expect(APPLICATION_SHORTCUT_COMMAND_IDS).toContain("file.save");
    expect(APPLICATION_SHORTCUT_COMMAND_IDS).toContain("view.toggleSidebar");
    expect(
      APPLICATION_SHORTCUT_COMMAND_IDS.every((commandId) =>
        APPLICATION_COMMAND_IDS.includes(commandId),
      ),
    ).toBe(true);
    expect(APPLICATION_SHORTCUT_COMMAND_IDS).not.toContain("edit.copy");
    expect(APPLICATION_SHORTCUT_COMMAND_IDS).not.toContain("format.strong");
  });

  it("registers alternate shortcuts for a command", () => {
    expect(COMMAND_DEFINITIONS["edit.redo"].shortcuts).toEqual([
      { key: "y", mod: true },
      { key: "z", mod: true, shift: true },
    ]);
  });

  it("registers task-list shortcuts", () => {
    expect(COMMAND_DEFINITIONS["format.taskList"].shortcuts).toEqual([
      { key: "9", mod: true, alt: true },
    ]);
    expect(COMMAND_DEFINITIONS["format.toggleTaskChecked"].shortcuts).toEqual([
      { key: "Enter", mod: true },
    ]);
  });

  it("does not register duplicate shortcuts", () => {
    const shortcuts = (Object.keys(COMMAND_DEFINITIONS) as AppCommandId[]).flatMap((commandId) =>
      (COMMAND_DEFINITIONS[commandId].shortcuts ?? []).map((shortcut) => ({
        commandId,
        signature: getShortcutSignature(shortcut),
      })),
    );

    const duplicateShortcuts = shortcuts.filter(
      ({ signature }, index) =>
        shortcuts.findIndex((shortcut) => shortcut.signature === signature) !== index,
    );

    expect(duplicateShortcuts).toEqual([]);
  });

  it("formats shortcuts for menu labels", () => {
    expect(formatShortcut({ key: "s", mod: true, shift: true })).toBe("Mod+Shift+S");
    expect(formatShortcut({ key: "F4", alt: true })).toBe("Alt+F4");
  });

  it("matches Mod shortcuts against the platform primary modifier", async () => {
    await withWindowsUserAgent(() => {
      expect(
        matchesShortcut(createKeyboardEventLike("s", { ctrl: true }), { key: "s", mod: true }),
      ).toBe(true);
      expect(
        matchesShortcut(createKeyboardEventLike("s", { meta: true }), { key: "s", mod: true }),
      ).toBe(false);
      expect(
        matchesShortcut(createKeyboardEventLike("F4", { alt: true, meta: true }), {
          alt: true,
          key: "F4",
        }),
      ).toBe(false);
    });

    await withMacUserAgent(() => {
      expect(
        matchesShortcut(createKeyboardEventLike("s", { meta: true }), { key: "s", mod: true }),
      ).toBe(true);
      expect(
        matchesShortcut(createKeyboardEventLike("s", { ctrl: true }), { key: "s", mod: true }),
      ).toBe(false);
      expect(
        matchesShortcut(createKeyboardEventLike("F4", { alt: true, ctrl: true }), {
          alt: true,
          key: "F4",
        }),
      ).toBe(false);
    });
  });
});
