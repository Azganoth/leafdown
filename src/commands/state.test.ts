import { describe, expect, it } from "vitest";

import { createAppCommandContext } from "@/test/factories/commands";
import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import { createEditorCommandState } from "@/test/factories/editor";
import { createFolderContext } from "@/test/factories/folderContext";

import { getCommandState } from "./state";

describe("command state", () => {
  it("disables document commands without an active document", () => {
    const context = createAppCommandContext();

    expect(getCommandState("file.save", context)).toMatchObject({ enabled: false });
    expect(getCommandState("file.saveAs", context)).toMatchObject({ enabled: false });
    expect(getCommandState("file.closeFolder", context)).toMatchObject({ enabled: false });
    expect(getCommandState("edit.undo", context)).toMatchObject({ enabled: false });
    expect(getCommandState("insert.table", context)).toMatchObject({ enabled: false });
  });

  it("enables Close folder when a folder context is open", () => {
    expect(
      getCommandState(
        "file.closeFolder",
        createAppCommandContext({
          folderContext: createFolderContext(),
        }),
      ),
    ).toMatchObject({ enabled: true });
  });

  it("enables Save only for dirty saved documents or untitled documents", () => {
    expect(
      getCommandState(
        "file.save",
        createAppCommandContext({ activeDocument: createSavedDocument() }),
      ),
    ).toMatchObject({
      enabled: false,
    });

    expect(
      getCommandState(
        "file.save",
        createAppCommandContext({
          activeDocument: createSavedDocument({ isDirty: true }),
        }),
      ),
    ).toMatchObject({ enabled: true });

    expect(
      getCommandState("file.save", {
        ...createAppCommandContext(),
        activeDocument: createUntitledDocument(),
      }),
    ).toMatchObject({ enabled: true });
  });

  it("reflects boolean and radio command state", () => {
    const context = createAppCommandContext({
      activeDocument: createSavedDocument(),
      settings: {
        articleSortOrder: "type",
        insertFinalNewline: false,
        sidebarVisible: false,
        theme: "dark",
      },
      ui: {
        fullscreen: true,
      },
    });

    expect(getCommandState("edit.lineEnding.lf", context)).toMatchObject({
      checked: true,
      enabled: true,
    });
    expect(getCommandState("edit.insertFinalNewline", context)).toMatchObject({
      checked: false,
      enabled: true,
    });
    expect(getCommandState("view.toggleSidebar", context)).toMatchObject({
      checked: false,
      enabled: true,
    });
    expect(getCommandState("view.fullscreen", context)).toMatchObject({
      checked: true,
      enabled: true,
    });
    expect(getCommandState("view.appearance.dark", context)).toMatchObject({
      checked: true,
      enabled: true,
    });
    expect(
      getCommandState("view.sort.type", {
        ...context,
        folderContext: createFolderContext(),
      }),
    ).toMatchObject({
      checked: true,
      enabled: true,
    });
  });

  it("reflects zoom command bounds", () => {
    expect(
      getCommandState(
        "view.zoomIn",
        createAppCommandContext({
          ui: { zoom: 2 },
        }),
      ),
    ).toMatchObject({ enabled: false, reason: "Zoom is already at maximum." });
    expect(
      getCommandState(
        "view.zoomOut",
        createAppCommandContext({
          ui: { zoom: 0.5 },
        }),
      ),
    ).toMatchObject({ enabled: false, reason: "Zoom is already at minimum." });
    expect(
      getCommandState(
        "view.resetZoom",
        createAppCommandContext({
          ui: { zoom: 1 },
        }),
      ),
    ).toMatchObject({ enabled: false, reason: "Zoom is already reset." });
    expect(
      getCommandState(
        "view.resetZoom",
        createAppCommandContext({
          ui: { zoom: 1.25 },
        }),
      ),
    ).toMatchObject({ enabled: true });
  });

  it("uses editor readiness and command state for editor-owned commands", () => {
    const context = createAppCommandContext({
      activeDocument: createSavedDocument(),
      editor: createEditorCommandState({
        enabledCommandIds: ["edit.copy", "edit.copyAsMarkdown", "format.table.deleteRow"],
        status: "ready",
      }),
    });

    expect(getCommandState("edit.copy", context)).toMatchObject({ enabled: true });
    expect(getCommandState("edit.copyAsMarkdown", context)).toMatchObject({ enabled: true });
    expect(getCommandState("format.table.deleteRow", context)).toMatchObject({
      enabled: true,
    });

    expect(
      getCommandState("edit.redo", {
        ...context,
      }),
    ).toMatchObject({ enabled: false });

    expect(
      getCommandState("edit.copy", {
        ...context,
        editor: { ...context.editor, status: "inactive" },
      }),
    ).toMatchObject({
      enabled: false,
      reason: "The editor is not ready.",
    });
  });
});
