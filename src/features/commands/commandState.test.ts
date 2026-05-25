import { describe, expect, it } from "vitest";

import type { CommandStateContext, EditorCommandState } from "./types";
import { getCommandState } from "./commandState";

const savedDocument = {
  status: "saved" as const,
  path: "C:/Notes/readme.md",
  content: "# Notes",
  isDirty: false,
  lineEnding: "lf" as const,
  metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
};

const folderContext = {
  path: "C:/Notes",
  isEmpty: false,
  tree: {
    name: "Notes",
    path: "C:/Notes",
    children: [{ kind: "file" as const, name: "readme.md", path: "C:/Notes/readme.md" }],
  },
};

const defaultEditorState: EditorCommandState = {
  enabledCommands: {},
  hasActiveEditor: false,
  hasSelection: false,
  hasTableSelection: false,
};

const createContext = (overrides: Partial<CommandStateContext> = {}): CommandStateContext => ({
  activeDocument: null,
  editor: defaultEditorState,
  fileTree: { canRevealActiveFile: false, pendingSortOrder: null },
  folderContext: null,
  fullscreen: false,
  settings: {
    autoPairBracketsAndQuotes: true,
    defaultNewDocumentExtension: ".md",
    defaultNewDocumentLineEnding: "lf",
    fileTreeSortOrder: "name",
    ignoredDirectories: [".git"],
    indexFileNames: ["readme", "index"],
    insertFinalNewline: true,
    recentFiles: [],
    recentFolders: [],
    recordRecentItems: true,
    sidebarVisible: true,
    softWrapCodeBlocks: false,
    theme: "system",
  },
  ...overrides,
});

describe("command state", () => {
  it("disables document commands without an active document", () => {
    const context = createContext();

    expect(getCommandState("file.save", context)).toMatchObject({ enabled: false });
    expect(getCommandState("file.saveAs", context)).toMatchObject({ enabled: false });
    expect(getCommandState("edit.undo", context)).toMatchObject({ enabled: false });
    expect(getCommandState("insert.table", context)).toMatchObject({ enabled: false });
  });

  it("enables Save only for dirty saved documents or untitled documents", () => {
    expect(
      getCommandState("file.save", createContext({ activeDocument: savedDocument })),
    ).toMatchObject({
      enabled: false,
    });

    expect(
      getCommandState(
        "file.save",
        createContext({ activeDocument: { ...savedDocument, isDirty: true } }),
      ),
    ).toMatchObject({ enabled: true });

    expect(
      getCommandState("file.save", {
        ...createContext(),
        activeDocument: {
          status: "untitled",
          id: "untitled:test",
          content: "",
          isDirty: false,
          lineEnding: "lf",
        },
      }),
    ).toMatchObject({ enabled: true });
  });

  it("reflects boolean and radio command state", () => {
    const context = createContext({
      activeDocument: savedDocument,
      fullscreen: true,
      settings: {
        ...createContext().settings,
        fileTreeSortOrder: "type",
        insertFinalNewline: false,
        sidebarVisible: false,
        theme: "dark",
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
    expect(getCommandState("view.sort.type", { ...context, folderContext })).toMatchObject({
      checked: true,
      enabled: true,
    });
  });

  it("uses editor selection and table context for editor-owned commands", () => {
    const context = createContext({
      activeDocument: savedDocument,
      editor: {
        enabledCommands: {
          "edit.copy": true,
          "edit.copyAsMarkdown": true,
          "format.table.deleteRow": true,
        },
        hasActiveEditor: true,
        hasSelection: true,
        hasTableSelection: true,
      },
    });

    expect(getCommandState("edit.copy", context)).toMatchObject({ enabled: true });
    expect(getCommandState("edit.copyAsMarkdown", context)).toMatchObject({ enabled: true });
    expect(getCommandState("format.table.deleteRow", context)).toMatchObject({ enabled: true });

    expect(
      getCommandState("edit.copy", {
        ...context,
        editor: { ...context.editor, hasSelection: false },
      }),
    ).toMatchObject({ enabled: false });

    expect(
      getCommandState("format.table.deleteRow", {
        ...context,
        editor: { ...context.editor, hasTableSelection: false },
      }),
    ).toMatchObject({ enabled: false });
  });
});
