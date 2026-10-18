// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { t } from "@/lib/i18n";

import { COMMAND_DEFINITIONS } from "./metadata";
import {
  filterShortcutReferenceGroups,
  filterShortcutReferenceGroupsByEvent,
  getShortcutReferenceGroups,
} from "./shortcutReference";

const entryIds = (groups: ReturnType<typeof getShortcutReferenceGroups>) =>
  groups.flatMap((group) => group.entries.map((entry) => entry.id));

describe("shortcut reference", () => {
  it("groups implemented shortcut commands and editor-owned interactions by menu", () => {
    const groups = getShortcutReferenceGroups();

    expect(groups.map(({ id }) => id)).toEqual([
      "file",
      "edit",
      "insert",
      "format",
      "view",
      "help",
    ]);
    expect(groups.find(({ id }) => id === "file")?.entries.map(({ id }) => id)).toContain(
      "file.new",
    );
    expect(groups.find(({ id }) => id === "insert")?.entries.map(({ id }) => id)).toEqual([
      "insert.link",
      "editor.insertBlock",
    ]);
    expect(groups.find(({ id }) => id === "help")?.entries.map(({ id }) => id)).toEqual([
      "help.keyboardShortcuts",
    ]);
    expect(groups.find(({ id }) => id === "edit")?.entries.map(({ id }) => id)).toContain(
      "editor.openContextMenu",
    );
    expect(groups.find(({ id }) => id === "edit")?.entries.map(({ id }) => id)).toContain(
      "editor.preview",
    );
    expect(groups.find(({ id }) => id === "edit")?.entries.map(({ id }) => id)).toContain(
      "editor.extendBlockSelection",
    );
  });

  it("includes every registered binding and excludes shortcut-less or absent commands", () => {
    const entries = getShortcutReferenceGroups().flatMap((group) => group.entries);

    expect(entries.find(({ id }) => id === "edit.redo")?.shortcuts).toEqual([
      { key: "y", mod: true },
      { key: "z", mod: true, shift: true },
    ]);
    expect(entries.map(({ id }) => id)).not.toContain("help.about");
    expect(entries.map(({ id }) => id)).not.toContain("file.print");
  });

  it("gives Mod+Q to Quit, leaving Close window on Alt+F4", () => {
    const entries = getShortcutReferenceGroups().flatMap((group) => group.entries);

    expect(entries.find(({ id }) => id === "file.newWindow")?.shortcuts).toEqual([
      { key: "n", mod: true, shift: true },
    ]);
    expect(entries.find(({ id }) => id === "file.quit")?.shortcuts).toEqual([
      { key: "q", mod: true },
    ]);
    expect(entries.find(({ id }) => id === "file.closeWindow")?.shortcuts).toEqual([
      { key: "F4", alt: true },
    ]);
  });

  it("reflects shortcut metadata changes without changing the reference", () => {
    const original = COMMAND_DEFINITIONS["view.resetZoom"].shortcuts;
    COMMAND_DEFINITIONS["view.resetZoom"].shortcuts = [{ key: "9", mod: true }];

    try {
      const entries = getShortcutReferenceGroups().flatMap((group) => group.entries);
      expect(entries.find(({ id }) => id === "view.resetZoom")?.shortcuts).toEqual([
        { key: "9", mod: true },
      ]);
    } finally {
      COMMAND_DEFINITIONS["view.resetZoom"].shortcuts = original;
    }
  });

  it("searches by command label, menu, and key names", () => {
    const groups = getShortcutReferenceGroups();

    expect(entryIds(filterShortcutReferenceGroups(groups, "heading", t))).toEqual([
      "format.heading1",
      "format.heading2",
      "format.heading3",
      "format.heading4",
      "format.heading5",
      "format.heading6",
    ]);
    expect(entryIds(filterShortcutReferenceGroups(groups, "ctrl+shift f", t))).toEqual([
      "edit.findInFolder",
    ]);
    expect(entryIds(filterShortcutReferenceGroups(groups, "help", t))).toEqual([
      "help.keyboardShortcuts",
    ]);
    expect(filterShortcutReferenceGroups(groups, "no such command", t)).toEqual([]);
    expect(filterShortcutReferenceGroups(groups, "  ", t)).toEqual(groups);
  });

  it("finds the shortcuts a pressed combination runs", () => {
    const groups = getShortcutReferenceGroups();
    const press = (init: KeyboardEventInit) =>
      entryIds(filterShortcutReferenceGroupsByEvent(groups, new KeyboardEvent("keydown", init)));

    expect(press({ key: "F", ctrlKey: true, shiftKey: true })).toEqual(["edit.findInFolder"]);
    expect(press({ key: "y", ctrlKey: true })).toEqual(["edit.redo"]);
    expect(press({ key: "q", altKey: true })).toEqual([]);
  });
});
