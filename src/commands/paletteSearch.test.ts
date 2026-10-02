import { describe, expect, it } from "vitest";

import { getCommandMenuPathIds, PALETTE_COMMAND_IDS } from "./catalog";
import { searchPaletteCommands, type PaletteCommand } from "./paletteSearch";

const commands: PaletteCommand[] = [
  { id: "file.saveAs", label: "Save as...", menuPath: "File › Save as..." },
  { id: "file.save", label: "Save", menuPath: "File › Save" },
  { id: "view.toggleSidebar", label: "Toggle sidebar", menuPath: "View › Toggle sidebar" },
  { id: "edit.copyAsMarkdown", label: "Markdown", menuPath: "Edit › Copy as › Markdown" },
];

describe("palette command catalog", () => {
  it("includes registered application and editor commands in menu-group order", () => {
    expect(PALETTE_COMMAND_IDS).toContain("file.save");
    expect(PALETTE_COMMAND_IDS).toContain("format.strong");
    expect(PALETTE_COMMAND_IDS.indexOf("file.save")).toBeLessThan(
      PALETTE_COMMAND_IDS.indexOf("edit.undo"),
    );
    expect(PALETTE_COMMAND_IDS.indexOf("edit.undo")).toBeLessThan(
      PALETTE_COMMAND_IDS.indexOf("insert.paragraph"),
    );
    expect(PALETTE_COMMAND_IDS.indexOf("view.commandPalette")).toBeLessThan(
      PALETTE_COMMAND_IDS.indexOf("view.toggleSidebar"),
    );
    expect(PALETTE_COMMAND_IDS.indexOf("help.reportIssue")).toBeLessThan(
      PALETTE_COMMAND_IDS.indexOf("help.openDevTools"),
    );
  });

  it("uses menu labels to describe nested commands", () => {
    expect(getCommandMenuPathIds("file.saveAs")).toEqual(["menu.file"]);
    expect(getCommandMenuPathIds("edit.copyAsMarkdown")).toEqual(["menu.edit", "menu.edit.copyAs"]);
    expect(getCommandMenuPathIds("format.table.addRowBelow")).toEqual([
      "menu.format",
      "menu.format.table",
    ]);
  });
});

describe("palette search", () => {
  it("keeps menu order for an empty query", () => {
    expect(searchPaletteCommands(commands, "  ")).toEqual(commands);
  });

  it("requires all case-insensitive terms across the command path", () => {
    expect(searchPaletteCommands(commands, "COPY markdown").map(({ id }) => id)).toEqual([
      "edit.copyAsMarkdown",
    ]);
    expect(searchPaletteCommands(commands, "copy sidebar")).toEqual([]);
  });

  it("ranks exact labels, prefixes, and label matches before path-only matches", () => {
    expect(searchPaletteCommands(commands, "save").map(({ id }) => id)).toEqual([
      "file.save",
      "file.saveAs",
    ]);
    expect(searchPaletteCommands(commands, "markdown").map(({ id }) => id)).toEqual([
      "edit.copyAsMarkdown",
    ]);
  });
});
