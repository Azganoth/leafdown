import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setTheme } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

import { App } from "./App";
import { useSessionStore } from "./stores/session";
import {
  defaultIgnoredDirectories,
  settingsStoreTauriHandler,
  useSettingsStore,
} from "./stores/settings";
import { render, renderWithUser, screen } from "./test/utils/react";
import { resetAppStores, setDefaultSession, setDefaultSettings } from "./test/utils/stores";

vi.mock("@/features/editor", () => ({
  MilkdownEditor: ({
    autoPairBracketsAndQuotes,
    documentKey,
    initialMarkdown,
    onContentTransaction,
    softWrapCodeBlocks,
  }: {
    autoPairBracketsAndQuotes?: boolean;
    documentKey: string;
    initialMarkdown: string;
    onContentTransaction?: () => void;
    softWrapCodeBlocks?: boolean;
  }) => (
    <div
      data-auto-pair-brackets-and-quotes={autoPairBracketsAndQuotes}
      data-code-block-soft-wrap={softWrapCodeBlocks}
      data-document-key={documentKey}
      data-testid="milkdown-editor-host"
    >
      {initialMarkdown}
      <button type="button" onClick={onContentTransaction}>
        Mock content transaction
      </button>
    </div>
  ),
}));

const notesFolderTree = {
  name: "Notes",
  path: "C:/Notes",
  children: [
    {
      kind: "file" as const,
      name: "readme.md",
      path: "C:/Notes/readme.md",
    },
  ],
};

const defaultFolderScanArgs = {
  ignoredDirectories: defaultIgnoredDirectories,
  sortOrder: "name",
};

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockReset();
    vi.mocked(confirm).mockResolvedValue(false);
    vi.mocked(open).mockResolvedValue(null);
    vi.mocked(save).mockResolvedValue(null);
    document.documentElement.className = "";
    resetAppStores();
  });

  it("starts persisted stores, initializes settings, applies the theme, and shows the window", async () => {
    const appWindow = getCurrentWindow();
    vi.mocked(appWindow.theme).mockResolvedValue("dark");

    render(<App />);

    await waitFor(() => {
      expect(settingsStoreTauriHandler.start).toHaveBeenCalled();
      expect(appWindow.show).toHaveBeenCalled();
    });

    expect(setTheme).toHaveBeenCalledWith(null);
    expect(document.documentElement).toHaveClass("dark");
  });

  it("applies an explicit dark theme without reading the window theme", async () => {
    const appWindow = getCurrentWindow();
    setDefaultSettings({ theme: "dark" });

    render(<App />);

    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith("dark");
    });

    expect(appWindow.theme).not.toHaveBeenCalled();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("applies an explicit light theme and removes the dark class", async () => {
    document.documentElement.classList.add("dark");
    setDefaultSettings({ theme: "light" });

    render(<App />);

    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith("light");
    });

    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("renders the welcome shell with MVP region hosts and empty recent lists", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Open file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save as..." })).toBeDisabled();
    expect(screen.getByText("No recent files.")).toBeInTheDocument();
    expect(screen.getByText("No recent folders.")).toBeInTheDocument();
    expect(screen.getByTestId("menu-bar-host")).toBeInTheDocument();
    expect(screen.getByTestId("file-tree-sidebar-host")).toBeInTheDocument();
    expect(screen.getByTestId("document-surface-host")).toBeInTheDocument();
    expect(screen.getByTestId("modal-layer-host")).toBeInTheDocument();
    expect(screen.queryByTestId("milkdown-editor-host")).not.toBeInTheDocument();
  });

  it("creates an untitled document from the file actions", async () => {
    setDefaultSettings({ defaultNewDocumentLineEnding: "lf" });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "New" }));

    await waitFor(() => {
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        status: "untitled",
      });
    });

    const activeDocument = useSessionStore.getState().activeDocument;

    expect(activeDocument).toMatchObject({
      status: "untitled",
      content: "",
      isDirty: false,
      lineEnding: "lf",
    });
    expect(activeDocument).toMatchObject({
      id: expect.stringMatching(/^untitled:/u),
    });
    expect(screen.getByTestId("active-document-host")).toBeInTheDocument();
    expect(screen.getByTestId("milkdown-editor-host").getAttribute("data-document-key")).toMatch(
      /^untitled:/u,
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("renders recent files and folders and clears both lists", async () => {
    setDefaultSettings({
      recentFiles: ["C:/Notes/readme.md"],
      recentFolders: ["C:/Notes"],
    });

    const { user } = renderWithUser(<App />);

    expect(screen.getByRole("button", { name: "C:/Notes/readme.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C:/Notes" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear recent items" }));

    expect(useSettingsStore.getState()).toMatchObject({
      recentFiles: [],
      recentFolders: [],
    });
    expect(screen.getByText("No recent files.")).toBeInTheDocument();
    expect(screen.getByText("No recent folders.")).toBeInTheDocument();
  });

  it("renders a folder-only document placeholder without an active document host", () => {
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: notesFolderTree, isEmpty: false },
    });

    render(<App />);

    expect(screen.getByText("No document open")).toBeInTheDocument();
    expect(
      screen.getByText("Select a Markdown file from the sidebar or create a new document."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("active-document-host")).not.toBeInTheDocument();
    expect(screen.queryByTestId("milkdown-editor-host")).not.toBeInTheDocument();
  });

  it("hides the sidebar when the persisted sidebar setting is off", () => {
    setDefaultSettings({ sidebarVisible: false });

    render(<App />);

    expect(screen.queryByTestId("file-tree-sidebar-host")).not.toBeInTheDocument();
  });

  it("exposes MVP preferences without Post-MVP settings", async () => {
    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Preferences" }));

    expect(screen.getByRole("dialog", { name: "Preferences" })).toBeInTheDocument();
    expect(screen.getByText("Record recent files and folders")).toBeInTheDocument();
    expect(screen.getByText("Sidebar visibility")).toBeInTheDocument();
    expect(screen.getByText("Sort file tree by")).toBeInTheDocument();
    expect(screen.getByText("Default extension for new documents")).toBeInTheDocument();
    expect(screen.getByText("Default line ending for new documents")).toBeInTheDocument();
    expect(screen.getByText("Insert final newline on save")).toBeInTheDocument();
    expect(screen.getByText("Index file names for automatic folder open")).toBeInTheDocument();
    expect(screen.getByText("Ignored directories for folder scans")).toBeInTheDocument();
    expect(screen.getByText("Auto pair brackets and quotes")).toBeInTheDocument();
    expect(screen.getByText("Soft wrap for code blocks")).toBeInTheDocument();
    expect(screen.getByText("Appearance theme")).toBeInTheDocument();
    expect(screen.queryByText("Auto save")).not.toBeInTheDocument();
    expect(screen.queryByText("Render/editor theme")).not.toBeInTheDocument();
    expect(screen.queryByText("Display line numbers for code blocks")).not.toBeInTheDocument();
    expect(screen.queryByText("Unordered list marker")).not.toBeInTheDocument();
  });

  it("updates persisted settings from preferences", async () => {
    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Preferences" }));
    await user.click(screen.getByRole("switch", { name: "Sidebar visibility" }));
    await user.click(screen.getByRole("radio", { name: "Dark" }));

    const ignoredDirectoriesInput = screen.getByLabelText("Ignored directories for folder scans");
    await user.clear(ignoredDirectoriesInput);
    await user.type(ignoredDirectoriesInput, ".git{enter}vendor");
    await user.tab();

    expect(useSettingsStore.getState()).toMatchObject({
      ignoredDirectories: [".git", "vendor"],
      sidebarVisible: false,
      theme: "dark",
    });
    expect(screen.queryByTestId("file-tree-sidebar-host")).not.toBeInTheDocument();
  });

  it("renders the active document editor for document sessions", () => {
    setDefaultSettings({
      autoPairBracketsAndQuotes: false,
      softWrapCodeBlocks: true,
    });
    setDefaultSession({
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        isDirty: true,
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });

    render(<App />);

    expect(screen.getByTestId("active-document-host")).toBeInTheDocument();
    expect(screen.getByTestId("milkdown-editor-host")).toHaveAttribute(
      "data-document-key",
      "C:/Notes/readme.md",
    );
    expect(screen.getByTestId("milkdown-editor-host")).toHaveAttribute(
      "data-auto-pair-brackets-and-quotes",
      "false",
    );
    expect(screen.getByTestId("milkdown-editor-host")).toHaveAttribute(
      "data-code-block-soft-wrap",
      "true",
    );
    expect(screen.getByTestId("milkdown-editor-host")).toHaveTextContent("# Notes");
    expect(screen.queryByText("No document open")).not.toBeInTheDocument();
  });

  it("marks the active document dirty when the editor reports a content transaction", async () => {
    setDefaultSession({
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        isDirty: true,
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Mock content transaction" }));

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
      path: "C:/Notes/readme.md",
      isDirty: true,
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("disables Save for clean saved documents", () => {
    setDefaultSession({
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });

    render(<App />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save as..." })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close document" })).toBeEnabled();
  });

  it("saves saved documents from the file actions", async () => {
    setDefaultSession({
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        isDirty: true,
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes/readme.md",
      parentFolderPath: "C:/Notes",
      metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_801_000 },
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("save_markdown_file", {
        path: "C:/Notes/readme.md",
        content: "# Notes\n",
        expectedMetadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
        overwrite: false,
      });
    });
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
      path: "C:/Notes/readme.md",
      content: "# Notes\n",
      isDirty: false,
      metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_801_000 },
    });
    expect(toast.success).toHaveBeenCalledWith("Document saved.");
  });

  it("saves untitled documents through Save As from the file actions", async () => {
    setDefaultSettings({ defaultNewDocumentExtension: ".markdown" });
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: notesFolderTree, isEmpty: false },
      activeDocument: {
        status: "untitled",
        id: "untitled:test",
        content: "# Draft",
        lineEnding: "lf",
      },
    });
    vi.mocked(save).mockResolvedValue("C:/Notes/draft");
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        path: "C:/Notes/draft.markdown",
        parentFolderPath: "C:/Notes",
        metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_801_000 },
      })
      .mockResolvedValueOnce({
        path: "C:/Notes",
        tree: {
          ...notesFolderTree,
          children: [
            ...notesFolderTree.children,
            { kind: "file" as const, name: "draft.markdown", path: "C:/Notes/draft.markdown" },
          ],
        },
        isEmpty: false,
      });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({
        title: "Save Markdown document",
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        defaultPath: "C:/Notes/Untitled.markdown",
      });
    });
    expect(invoke).toHaveBeenNthCalledWith(1, "save_markdown_file", {
      path: "C:/Notes/draft.markdown",
      content: "# Draft\n",
      expectedMetadata: null,
      overwrite: false,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "scan_markdown_folder", {
      path: "C:/Notes",
      ...defaultFolderScanArgs,
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: "C:/Notes" },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/draft.markdown",
        content: "# Draft\n",
      },
    });
  });

  it("closes clean documents from the file actions", async () => {
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: notesFolderTree, isEmpty: false },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Close document" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: "C:/Notes" },
      activeDocument: null,
    });
    expect(screen.getByText("No document open")).toBeInTheDocument();
  });

  it("keeps dirty documents open when close document is cancelled", async () => {
    setDefaultSession({
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        isDirty: true,
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Close document" }));

    expect(confirm).toHaveBeenCalled();
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
      path: "C:/Notes/readme.md",
      isDirty: true,
    });
    expect(screen.getByTestId("active-document-host")).toBeInTheDocument();
  });

  it("opens a selected Markdown file into a saved document session", async () => {
    vi.mocked(open).mockResolvedValue("C:/Notes/readme.md");
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes/readme.md",
      parentFolderPath: "C:/Notes",
      content: "# Notes\n",
      lineEnding: "lf",
      metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_800_000 },
    });
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes",
      tree: notesFolderTree,
      isEmpty: false,
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open file" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenNthCalledWith(1, "open_markdown_file", {
        path: "C:/Notes/readme.md",
      });
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "scan_markdown_folder", {
      path: "C:/Notes",
      ...defaultFolderScanArgs,
    });

    expect(open).toHaveBeenCalledWith({
      directory: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      multiple: false,
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: "C:/Notes" },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes\n",
        lineEnding: "lf",
        metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });
    expect(useSettingsStore.getState()).toMatchObject({
      recentFiles: ["C:/Notes/readme.md"],
      recentFolders: ["C:/Notes"],
    });
    expect(screen.getByTestId("active-document-host")).toBeInTheDocument();
  });

  it("opens recent Markdown files without showing the file picker", async () => {
    setDefaultSettings({ recentFiles: ["C:/Notes/readme.md"] });
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes/readme.md",
      parentFolderPath: "C:/Notes",
      content: "# Notes\n",
      lineEnding: "lf",
      metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_800_000 },
    });
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes",
      tree: notesFolderTree,
      isEmpty: false,
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "C:/Notes/readme.md" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenNthCalledWith(1, "open_markdown_file", {
        path: "C:/Notes/readme.md",
      });
    });
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByTestId("active-document-host")).toBeInTheDocument();
  });

  it("does not record opened files or folders when recent recording is disabled", async () => {
    setDefaultSettings({ recordRecentItems: false });
    vi.mocked(open).mockResolvedValue("C:/Notes/readme.md");
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes/readme.md",
      parentFolderPath: "C:/Notes",
      content: "# Notes\n",
      lineEnding: "lf",
      metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_800_000 },
    });
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes",
      tree: notesFolderTree,
      isEmpty: false,
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open file" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-document-host")).toBeInTheDocument();
    });
    expect(useSettingsStore.getState()).toMatchObject({
      recentFiles: [],
      recentFolders: [],
    });
  });

  it("opens a selected folder index into a saved document session", async () => {
    setDefaultSettings({
      fileTreeSortOrder: "type",
      ignoredDirectories: [".git", "vendor"],
      indexFileNames: ["home", "readme"],
    });
    vi.mocked(open).mockResolvedValue("C:/Notes");
    vi.mocked(invoke).mockResolvedValue({
      folder: {
        path: "C:/Notes",
        tree: notesFolderTree,
        isEmpty: false,
      },
      indexDocument: {
        path: "C:/Notes/readme.md",
        content: "# Notes\n",
        lineEnding: "lf",
        metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("open_markdown_folder", {
        path: "C:/Notes",
        ignoredDirectories: [".git", "vendor"],
        indexFileNames: ["home", "readme"],
        sortOrder: "type",
      });
    });

    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: "C:/Notes", tree: notesFolderTree },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes\n",
      },
    });
    expect(useSettingsStore.getState().recentFolders).toEqual(["C:/Notes"]);
    expect(screen.getByTestId("active-document-host")).toBeInTheDocument();
  });

  it("opens selected folders without a root index as folder-only sessions", async () => {
    vi.mocked(open).mockResolvedValue("C:/Notes");
    vi.mocked(invoke).mockResolvedValue({
      folder: {
        path: "C:/Notes",
        tree: notesFolderTree,
        isEmpty: false,
      },
      indexDocument: null,
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() => {
      expect(screen.getByText("No document open")).toBeInTheDocument();
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: "C:/Notes", tree: notesFolderTree },
      activeDocument: null,
    });
    expect(useSettingsStore.getState().recentFolders).toEqual(["C:/Notes"]);
  });

  it("tracks selected folders with no Markdown files as empty folder contexts", async () => {
    vi.mocked(open).mockResolvedValue("C:/Empty");
    vi.mocked(invoke).mockResolvedValue({
      folder: {
        path: "C:/Empty",
        tree: {
          name: "Empty",
          path: "C:/Empty",
          children: [
            {
              kind: "directory",
              name: "nested",
              path: "C:/Empty/nested",
              children: [],
            },
          ],
        },
        isEmpty: true,
      },
      indexDocument: null,
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() => {
      expect(useSessionStore.getState()).toMatchObject({
        folderContext: { path: "C:/Empty" },
        activeDocument: null,
      });
    });
    expect(screen.getByText("No Markdown files found")).toBeInTheDocument();
    expect(screen.getByText("Create a new document or open another folder.")).toBeInTheDocument();
    expect(screen.queryByText("No document open")).not.toBeInTheDocument();
  });

  it("keeps the welcome session when file selection is cancelled", async () => {
    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open file" }));

    expect(open).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      activeDocument: null,
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps the welcome session when folder selection is cancelled", async () => {
    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open folder" }));

    expect(open).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      activeDocument: null,
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("does not partially update the session when selected file opening fails", async () => {
    vi.mocked(open).mockResolvedValue("C:/Notes/readme.md");
    vi.mocked(invoke).mockRejectedValue({ kind: "readFailed" });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open file" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });

    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      activeDocument: null,
    });
    expect(toast.error).toHaveBeenCalledWith("Could not open Markdown file.");
  });

  it("does not partially update the session when selected folder opening fails", async () => {
    vi.mocked(open).mockResolvedValue("C:/Notes");
    vi.mocked(invoke).mockRejectedValue({ kind: "scanFailed" });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });

    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      activeDocument: null,
    });
    expect(toast.error).toHaveBeenCalledWith("Could not open folder.");
  });

  it("allows clean window close requests", async () => {
    const appWindow = getCurrentWindow();
    render(<App />);

    await waitFor(() => {
      expect(appWindow.onCloseRequested).toHaveBeenCalled();
    });

    const handleCloseRequested = vi.mocked(appWindow.onCloseRequested).mock.calls[0][0];
    const event = { preventDefault: vi.fn() };

    await handleCloseRequested(event as never);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("prevents dirty window close requests when the prompt is cancelled", async () => {
    const appWindow = getCurrentWindow();
    setDefaultSession({
      activeDocument: {
        status: "untitled",
        id: "untitled:test",
        content: "Draft",
        isDirty: true,
        lineEnding: "lf",
      },
    });
    render(<App />);

    await waitFor(() => {
      expect(appWindow.onCloseRequested).toHaveBeenCalled();
    });

    const handleCloseRequested = vi.mocked(appWindow.onCloseRequested).mock.calls[0][0];
    const event = { preventDefault: vi.fn() };

    await handleCloseRequested(event as never);

    expect(confirm).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "untitled",
      id: "untitled:test",
      isDirty: true,
    });
  });

  it("suppresses default window drag-and-drop navigation", () => {
    render(<App />);

    const dragOverEvent = new Event("dragover", { cancelable: true });
    const dropEvent = new Event("drop", { cancelable: true });

    window.dispatchEvent(dragOverEvent);
    window.dispatchEvent(dropEvent);

    expect(dragOverEvent.defaultPrevented).toBe(true);
    expect(dropEvent.defaultPrevented).toBe(true);
  });
});
