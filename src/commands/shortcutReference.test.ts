import { describe, expect, it } from "vitest";

import { COMMAND_DEFINITIONS } from "./metadata";
import { getShortcutReferenceGroups } from "./shortcutReference";

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
      "editor.previewFootnote",
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
    expect(entries.map(({ id }) => id)).not.toContain("file.newWindow");
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
});
