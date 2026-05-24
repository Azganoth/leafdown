import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetActiveDocumentEditorBridge,
  setActiveDocumentEditorBridge,
} from "./documentEditorBridge";
import {
  createNewMarkdownDocument,
  saveActiveMarkdownDocument,
  saveActiveMarkdownDocumentAs,
} from "./documentWorkflows";
import { useSessionStore, type FolderContextState } from "@/stores/session";
import { defaultIgnoredDirectories } from "@/stores/settings";
import { resetAppStores, setDefaultSession, setDefaultSettings } from "@/test/utils/stores";

const notesFolderContext: FolderContextState = {
  path: "C:/Notes",
  tree: {
    name: "Notes",
    path: "C:/Notes",
    children: [
      {
        kind: "file",
        name: "readme.md",
        path: "C:/Notes/readme.md",
      },
    ],
  },
  isEmpty: false,
};

const updatedFolderContext = {
  path: "C:/Notes",
  tree: {
    name: "Notes",
    path: "C:/Notes",
    children: [
      {
        kind: "file" as const,
        name: "draft.markdown",
        path: "C:/Notes/draft.markdown",
      },
    ],
  },
  isEmpty: false,
};

describe("document workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockReset();
    vi.mocked(save).mockReset();
    vi.mocked(save).mockResolvedValue(null);
    resetActiveDocumentEditorBridge();
    resetAppStores();
  });

  it("creates an untitled document without changing the active folder context", () => {
    setDefaultSettings({ defaultNewDocumentLineEnding: "lf" });
    setDefaultSession({ folderContext: notesFolderContext });

    createNewMarkdownDocument();

    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: "C:/Notes" },
      activeDocument: {
        status: "untitled",
        content: "",
        lineEnding: "lf",
      },
    });
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      id: expect.stringMatching(/^untitled:/u),
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("saves saved documents through the native backend command", async () => {
    setDefaultSettings({ insertFinalNewline: true });
    setDefaultSession({
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Original\n",
        lineEnding: "crlf",
        metadata: { sizeBytes: 11, modifiedAtUnixMs: 1 },
      },
    });
    setActiveDocumentEditorBridge("C:/Notes/readme.md", {
      getMarkdown: () => "# Updated\n",
    });
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes/readme.md",
      parentFolderPath: "C:/Notes",
      metadata: { sizeBytes: 11, modifiedAtUnixMs: 2 },
    });

    await expect(saveActiveMarkdownDocument()).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith("save_markdown_file", {
      path: "C:/Notes/readme.md",
      content: "# Updated\r\n",
    });
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
      path: "C:/Notes/readme.md",
      content: "# Updated\r\n",
      lineEnding: "crlf",
      metadata: { sizeBytes: 11, modifiedAtUnixMs: 2 },
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("routes untitled Save through Save As and applies the default extension", async () => {
    setDefaultSettings({
      defaultNewDocumentExtension: ".markdown",
      insertFinalNewline: false,
    });
    setDefaultSession({
      folderContext: notesFolderContext,
      activeDocument: {
        status: "untitled",
        id: "untitled:test",
        content: "Draft\n",
        lineEnding: "lf",
      },
    });
    setActiveDocumentEditorBridge("untitled:test", {
      getMarkdown: () => "Draft\n",
    });
    vi.mocked(save).mockResolvedValue("C:/Notes/draft");
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        path: "C:/Notes/draft.markdown",
        parentFolderPath: "C:/Notes",
        metadata: { sizeBytes: 5, modifiedAtUnixMs: 3 },
      })
      .mockResolvedValueOnce(updatedFolderContext);

    await expect(saveActiveMarkdownDocument()).resolves.toBe(true);

    expect(save).toHaveBeenCalledWith({
      title: "Save Markdown document",
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      defaultPath: "C:/Notes/Untitled.markdown",
    });
    expect(invoke).toHaveBeenNthCalledWith(1, "save_markdown_file", {
      path: "C:/Notes/draft.markdown",
      content: "Draft",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "scan_markdown_folder", {
      path: "C:/Notes",
      ignoredDirectories: defaultIgnoredDirectories,
      sortOrder: "name",
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: "C:/Notes", tree: updatedFolderContext.tree },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/draft.markdown",
        content: "Draft",
        lineEnding: "lf",
      },
    });
  });

  it("leaves the active document unchanged when Save As is cancelled", async () => {
    setDefaultSession({
      activeDocument: {
        status: "untitled",
        id: "untitled:test",
        content: "Draft",
        lineEnding: "lf",
      },
    });

    await expect(saveActiveMarkdownDocumentAs()).resolves.toBe(false);

    expect(invoke).not.toHaveBeenCalled();
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "untitled",
      id: "untitled:test",
      content: "Draft",
    });
  });
});
