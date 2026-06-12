import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  unwatchMarkdownFolder,
  watchMarkdownFolder,
} from "@/features/file-tree/utils/folderWatcherBackend";
import { setTheme } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

import { App } from "./App";
import {
  resetActiveDocumentEditorBridge,
  setActiveDocumentEditorBridge,
} from "./lib/documentEditorBridge";
import { useSessionStore } from "./stores/session";
import {
  defaultIgnoredDirectories,
  settingsStoreTauriHandler,
  useSettingsStore,
} from "./stores/settings";
import { resetAppStores, setDefaultSession, setDefaultSettings } from "./test/fixtures/appStores";
import { act, render, renderWithUser, screen } from "./test/utils/react";

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

vi.mock("@/features/file-tree/utils/folderWatcherBackend", () => ({
  unwatchMarkdownFolder: vi.fn(async () => undefined),
  watchMarkdownFolder: vi.fn(async () => undefined),
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

const nestedNotesFolderTree = {
  name: "Notes",
  path: "C:/Notes",
  children: [
    {
      kind: "file" as const,
      name: "readme.md",
      path: "C:/Notes/readme.md",
    },
    {
      kind: "file" as const,
      name: "draft.markdown",
      path: "C:/Notes/draft.markdown",
    },
    {
      kind: "directory" as const,
      name: "docs",
      path: "C:/Notes/docs",
      children: [
        {
          kind: "file" as const,
          name: "spec.md",
          path: "C:/Notes/docs/spec.md",
        },
      ],
    },
    {
      kind: "directory" as const,
      name: "empty",
      path: "C:/Notes/empty",
      children: [],
    },
  ],
};

const defaultFolderScanArgs = {
  ignoredDirectories: defaultIgnoredDirectories,
  sortOrder: "name",
};
const folderChangedEvent = "leafdown://folder-changed";

interface FolderChangedTestEvent {
  payload: {
    folderPath: string;
    paths: string[];
  };
}

const findFolderChangedHandler = () => {
  const appWindow = getCurrentWindow();
  const listenCall = vi
    .mocked(appWindow.listen)
    .mock.calls.find(([eventName]) => eventName === folderChangedEvent);

  expect(listenCall).toBeDefined();

  return listenCall?.[1] as (event: FolderChangedTestEvent) => void;
};

const countScanMarkdownFolderCalls = () =>
  vi.mocked(invoke).mock.calls.filter(([commandName]) => commandName === "scan_markdown_folder")
    .length;

const expectFolderWatchStarted = (path: string, ignoredDirectories: string[]) => {
  expect(watchMarkdownFolder).toHaveBeenCalledWith(
    path,
    ignoredDirectories,
    expect.stringMatching(/^folder-watch:/u),
    expect.any(Number),
  );
};

const openMenu = async (user: ReturnType<typeof renderWithUser>["user"], name: string) => {
  await user.click(screen.getByRole("menuitem", { name }));
};

const clickMenuItem = async (
  user: ReturnType<typeof renderWithUser>["user"],
  menuName: string,
  itemName: string | RegExp,
) => {
  await openMenu(user, menuName);
  await user.click(menuItem(itemName));
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const menuItem = (name: string | RegExp) => {
  const matcher = typeof name === "string" ? new RegExp(`^${escapeRegExp(name)}`, "u") : name;

  return (
    screen.queryByRole("menuitem", { name: matcher }) ??
    screen.queryByRole("menuitemcheckbox", { name: matcher }) ??
    screen.getByRole("menuitemradio", { name: matcher })
  );
};

const latestFolderWatchScope = () => {
  const call = vi.mocked(watchMarkdownFolder).mock.calls.at(-1);

  expect(call).toBeDefined();

  return {
    generation: call?.[3] as number,
    id: call?.[2] as string,
  };
};

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockReset();
    vi.mocked(watchMarkdownFolder).mockReset().mockResolvedValue(undefined);
    vi.mocked(unwatchMarkdownFolder).mockReset().mockResolvedValue(undefined);
    vi.mocked(confirm).mockResolvedValue(false);
    vi.mocked(open).mockResolvedValue(null);
    vi.mocked(save).mockResolvedValue(null);
    document.documentElement.className = "";
    resetActiveDocumentEditorBridge();
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

  it("renders the welcome shell with MVP menu groups and empty recent lists", async () => {
    const { user } = renderWithUser(<App />);

    expect(screen.getByRole("button", { name: "Open file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Insert" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Format" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Help" })).toBeInTheDocument();
    expect(screen.getByText("No recent files.")).toBeInTheDocument();
    expect(screen.getByText("No recent folders.")).toBeInTheDocument();
    expect(screen.getByTestId("menu-bar-host")).toBeInTheDocument();
    expect(screen.getByTestId("file-tree-sidebar-host")).toBeInTheDocument();
    expect(screen.getByTestId("document-surface-host")).toBeInTheDocument();
    expect(screen.getByTestId("modal-layer-host")).toBeInTheDocument();
    expect(screen.getByText("No folder open")).toBeInTheDocument();
    expect(screen.queryByTestId("milkdown-editor-host")).not.toBeInTheDocument();

    await openMenu(user, "File");

    expect(menuItem(/^New/)).toBeInTheDocument();
    expect(menuItem(/^Save(?! as)/u)).toHaveAttribute("data-disabled");
    expect(menuItem(/^Save as/)).toHaveAttribute("data-disabled");
    expect(menuItem(/^Reveal in sidebar/)).toHaveAttribute("data-disabled");
  });

  it("disables folder-only view menu commands without a folder context", async () => {
    const { user } = renderWithUser(<App />);

    await openMenu(user, "View");

    expect(menuItem("Sort file tree by")).toBeInTheDocument();
    expect(menuItem("Collapse all folders")).toHaveAttribute("data-disabled");
    expect(menuItem("Expand all folders")).toHaveAttribute("data-disabled");
  });

  it("omits Post-MVP and development-only commands from the MVP menus", async () => {
    const { user } = renderWithUser(<App />);

    await openMenu(user, "View");

    expect(screen.queryByText("Toggle status bar")).not.toBeInTheDocument();
    expect(screen.queryByText("Toggle DevTools")).not.toBeInTheDocument();
    expect(screen.queryByText("Always on top")).not.toBeInTheDocument();

    await openMenu(user, "Edit");

    expect(screen.queryByText("Find...")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete block")).not.toBeInTheDocument();
  });

  it("creates an untitled document from the file actions", async () => {
    setDefaultSettings({ defaultNewDocumentLineEnding: "lf" });

    const { user } = renderWithUser(<App />);

    await clickMenuItem(user, "File", /^New/);

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

    await openMenu(user, "File");
    expect(
      screen.queryByRole("menuitem", { name: /^Clear recent items/u }),
    ).not.toBeInTheDocument();

    await user.hover(screen.getByRole("menuitem", { name: "Open recent" }));
    await user.keyboard("{ArrowRight}");

    expect(screen.getAllByText("Recent files")).toHaveLength(2);
    expect(screen.getAllByText("Recent folders")).toHaveLength(2);

    expect(menuItem("Clear recent items")).not.toHaveAttribute("data-disabled");

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(useSettingsStore.getState()).toMatchObject({
      recentFiles: [],
      recentFolders: [],
    });
    expect(screen.getByText("No recent files.")).toBeInTheDocument();
    expect(screen.getByText("No recent folders.")).toBeInTheDocument();
  });

  it("renders a folder-only document placeholder without an active document host", () => {
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
    });

    render(<App />);

    expect(screen.getByRole("button", { name: "readme.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "draft.markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "spec.md" })).not.toBeInTheDocument();
    expect(screen.getByText("No document open")).toBeInTheDocument();
    expect(
      screen.getByText("Select a Markdown file from the sidebar or create a new document."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("active-document-host")).not.toBeInTheDocument();
    expect(screen.queryByTestId("milkdown-editor-host")).not.toBeInTheDocument();
  });

  it("renders nested file tree rows and selects the active saved document", async () => {
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/docs/spec.md",
        content: "# Spec",
        lineEnding: "lf",
        metadata: { sizeBytes: 6, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "spec.md" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
    expect(screen.getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "empty" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "notes.txt" })).not.toBeInTheDocument();
  });

  it("shows empty folder state in the sidebar while preserving empty directories", () => {
    setDefaultSession({
      folderContext: {
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
    });

    render(<App />);

    expect(screen.getByText("No supported Markdown files found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "nested" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /rename/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/iu })).not.toBeInTheDocument();
  });

  it("hides the sidebar when the persisted sidebar setting is off", () => {
    setDefaultSettings({ sidebarVisible: false });

    render(<App />);

    expect(screen.queryByTestId("file-tree-sidebar-host")).not.toBeInTheDocument();
  });

  it("toggles sidebar visibility from the view command and shortcut", async () => {
    const { user } = renderWithUser(<App />);

    await clickMenuItem(user, "View", "Toggle sidebar");

    expect(screen.queryByTestId("file-tree-sidebar-host")).not.toBeInTheDocument();

    await clickMenuItem(user, "View", "Toggle sidebar");

    expect(screen.getByTestId("file-tree-sidebar-host")).toBeInTheDocument();

    const toggleSidebarShortcut = new KeyboardEvent("keydown", {
      key: "e",
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
    });

    window.dispatchEvent(toggleSidebarShortcut);

    expect(toggleSidebarShortcut.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(screen.queryByTestId("file-tree-sidebar-host")).not.toBeInTheDocument();
    });
  });

  it("exposes MVP preferences without Post-MVP settings", async () => {
    const { user } = renderWithUser(<App />);

    await clickMenuItem(user, "File", /^Preferences/);

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

    await clickMenuItem(user, "File", /^Preferences/);
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

    await openMenu(user, "File");
    expect(menuItem(/^Save(?! as)/u)).not.toHaveAttribute("data-disabled");
  });

  it("routes editor menu actions and shortcuts through the active editor bridge", async () => {
    const runCommand = vi.fn(() => true);

    setDefaultSession({
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        isDirty: false,
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });
    setActiveDocumentEditorBridge("C:/Notes/readme.md", {
      getMarkdown: () => "# Notes",
      getCommandState: () => ({
        enabledCommands: {
          "edit.jumpToTop": true,
          "edit.undo": true,
        },
        hasActiveEditor: true,
        hasSelection: false,
        hasTableSelection: false,
      }),
      runCommand,
    });

    const { user } = renderWithUser(<App />);

    await openMenu(user, "Edit");
    expect(menuItem("Undo")).not.toHaveAttribute("data-disabled");

    await user.click(menuItem("Undo"));
    expect(runCommand).toHaveBeenCalledWith("edit.undo");

    const jumpShortcut = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "Home",
    });

    window.dispatchEvent(jumpShortcut);

    expect(jumpShortcut.defaultPrevented).toBe(true);
    expect(runCommand).toHaveBeenCalledWith("edit.jumpToTop");
  });

  it("disables Save for clean saved documents", async () => {
    setDefaultSession({
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });

    const { user } = renderWithUser(<App />);

    await openMenu(user, "File");

    expect(menuItem(/^Save(?! as)/u)).toHaveAttribute("data-disabled");
    expect(menuItem(/^Save as/)).not.toHaveAttribute("data-disabled");
    expect(menuItem(/^Close document/)).not.toHaveAttribute("data-disabled");

    const saveShortcut = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      cancelable: true,
    });

    window.dispatchEvent(saveShortcut);

    expect(saveShortcut.defaultPrevented).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
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

    await clickMenuItem(user, "File", /^Save(?! as)/u);

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

  it("shows specific save errors from the file actions", async () => {
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
    vi.mocked(invoke).mockRejectedValue({
      kind: "writeFailed",
      path: "C:/Notes/readme.md",
      message: "disk is full",
    });

    const { user } = renderWithUser(<App />);

    await clickMenuItem(user, "File", /^Save(?! as)/u);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not write Markdown file.", {
        description: "disk is full",
      });
    });
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
      path: "C:/Notes/readme.md",
      isDirty: true,
    });
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

    await clickMenuItem(user, "File", /^Save(?! as)/u);

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

    await clickMenuItem(user, "File", /^Close document/);

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

    await clickMenuItem(user, "File", /^Close document/);

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
        isDirty: false,
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

  it("opens Markdown files selected from the sidebar", async () => {
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes/draft.markdown",
      parentFolderPath: "C:/Notes",
      content: "# Draft\n",
      lineEnding: "lf",
      metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_801_000 },
    });
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes",
      tree: nestedNotesFolderTree,
      isEmpty: false,
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "draft.markdown" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenNthCalledWith(1, "open_markdown_file", {
        path: "C:/Notes/draft.markdown",
      });
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
        isDirty: false,
      },
    });
    expect(screen.getByRole("button", { name: "draft.markdown" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("collapses and expands all sidebar folders from view commands", async () => {
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
    });

    const { user } = renderWithUser(<App />);

    expect(screen.queryByRole("button", { name: "spec.md" })).not.toBeInTheDocument();

    await clickMenuItem(user, "View", "Expand all folders");

    expect(screen.getByRole("button", { name: "spec.md" })).toBeInTheDocument();

    await clickMenuItem(user, "View", "Collapse all folders");

    expect(screen.queryByRole("button", { name: "spec.md" })).not.toBeInTheDocument();
  });

  it("sorts the file tree through view commands and refreshes the current folder", async () => {
    const sortedTree = {
      ...nestedNotesFolderTree,
      children: [...nestedNotesFolderTree.children].reverse(),
    };

    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
    });
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "C:/Notes",
      tree: sortedTree,
      isEmpty: false,
    });

    const { user } = renderWithUser(<App />);

    await openMenu(user, "View");
    await user.hover(screen.getByRole("menuitem", { name: "Sort file tree by" }));
    await user.keyboard("{ArrowRight}{ArrowDown}{ArrowDown}{Enter}");

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("scan_markdown_folder", {
        path: "C:/Notes",
        ignoredDirectories: defaultIgnoredDirectories,
        sortOrder: "type",
      });
    });
    expect(useSettingsStore.getState().fileTreeSortOrder).toBe("type");
    expect(useSessionStore.getState().folderContext?.tree.children[0]).toMatchObject({
      name: "empty",
    });
  });

  it("reveals the active saved file and restores the sidebar when hidden", async () => {
    setDefaultSettings({ sidebarVisible: false });
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/docs/spec.md",
        content: "# Spec",
        lineEnding: "lf",
        metadata: { sizeBytes: 6, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });

    const { user } = renderWithUser(<App />);

    expect(screen.queryByTestId("file-tree-sidebar-host")).not.toBeInTheDocument();

    await clickMenuItem(user, "File", /^Reveal in sidebar/);

    await waitFor(() => {
      expect(screen.getByTestId("file-tree-sidebar-host")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "spec.md" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });

  it("starts native folder watching for the active folder context and stops on unmount", async () => {
    setDefaultSettings({ ignoredDirectories: [".git", "vendor"] });
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
    });

    const { unmount } = render(<App />);

    await waitFor(() => {
      expectFolderWatchStarted("C:/Notes", [".git", "vendor"]);
    });
    const scope = latestFolderWatchScope();

    unmount();

    expect(unwatchMarkdownFolder).toHaveBeenCalledWith(scope.id, scope.generation);
  });

  it("unlistens folder watcher events when listener setup resolves after unmount", async () => {
    const appWindow = getCurrentWindow();
    const closeUnlisten = vi.fn();
    const folderUnlisten = vi.fn();
    let resolveFolderListen!: (unlisten: () => void) => void;

    vi.mocked(appWindow.listen).mockImplementation((eventName) => {
      if (eventName === folderChangedEvent) {
        return new Promise((resolve) => {
          resolveFolderListen = resolve;
        });
      }

      return Promise.resolve(closeUnlisten);
    });

    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
    });

    const { unmount } = render(<App />);

    unmount();
    resolveFolderListen(folderUnlisten);

    await waitFor(() => {
      expect(folderUnlisten).toHaveBeenCalledTimes(1);
    });
  });

  it("replaces native folder watch scopes when the folder context changes", async () => {
    const archiveFolderTree = {
      name: "Archive",
      path: "C:/Archive",
      children: [
        {
          kind: "file" as const,
          name: "old.md",
          path: "C:/Archive/old.md",
        },
      ],
    };

    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
    });

    render(<App />);

    await waitFor(() => {
      expectFolderWatchStarted("C:/Notes", defaultIgnoredDirectories);
    });
    const notesScope = latestFolderWatchScope();

    await act(async () => {
      useSessionStore.getState().setFolderContext({
        path: "C:/Archive",
        tree: archiveFolderTree,
        isEmpty: false,
      });
    });

    await waitFor(() => {
      expect(unwatchMarkdownFolder).toHaveBeenCalledWith(notesScope.id, notesScope.generation);
      expectFolderWatchStarted("C:/Archive", defaultIgnoredDirectories);
    });
    expect(latestFolderWatchScope()).not.toEqual(notesScope);
  });

  it("refreshes the current file tree from folder watcher events", async () => {
    const refreshedTree = {
      ...nestedNotesFolderTree,
      children: [
        ...nestedNotesFolderTree.children,
        {
          kind: "file" as const,
          name: "new.md",
          path: "C:/Notes/new.md",
        },
      ],
    };

    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
    });
    vi.mocked(invoke).mockImplementation(async (commandName) => {
      if (commandName === "scan_markdown_folder") {
        return {
          path: "C:/Notes",
          tree: refreshedTree,
          isEmpty: false,
        };
      }

      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expectFolderWatchStarted("C:/Notes", defaultIgnoredDirectories);
    });

    findFolderChangedHandler()({
      payload: {
        folderPath: "C:/Notes",
        paths: ["C:/Notes/new.md"],
      },
    });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("scan_markdown_folder", {
        path: "C:/Notes",
        ...defaultFolderScanArgs,
      });
      expect(screen.getByRole("button", { name: "new.md" })).toBeInTheDocument();
    });
  });

  it("debounces rapid folder watcher events into one rescan", async () => {
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
    });
    vi.mocked(invoke).mockImplementation(async (commandName) => {
      if (commandName === "scan_markdown_folder") {
        return {
          path: "C:/Notes",
          tree: nestedNotesFolderTree,
          isEmpty: false,
        };
      }

      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(watchMarkdownFolder).toHaveBeenCalled();
    });

    const handleFolderChanged = findFolderChangedHandler();

    handleFolderChanged({
      payload: {
        folderPath: "C:/Notes",
        paths: ["C:/Notes/one.md"],
      },
    });
    handleFolderChanged({
      payload: {
        folderPath: "C:/Notes",
        paths: ["C:/Notes/two.md"],
      },
    });

    await waitFor(() => {
      expect(countScanMarkdownFolderCalls()).toBe(1);
    });
  });

  it("ignores stale folder watcher events from replaced contexts", async () => {
    const archiveFolderTree = {
      name: "Archive",
      path: "C:/Archive",
      children: [
        {
          kind: "file" as const,
          name: "old.md",
          path: "C:/Archive/old.md",
        },
      ],
    };

    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
    });
    vi.mocked(invoke).mockResolvedValue({
      path: "C:/Notes",
      tree: nestedNotesFolderTree,
      isEmpty: false,
    });

    render(<App />);

    await waitFor(() => {
      expect(watchMarkdownFolder).toHaveBeenCalled();
    });

    const staleFolderChangedHandler = findFolderChangedHandler();

    await act(async () => {
      useSessionStore.getState().setFolderContext({
        path: "C:/Archive",
        tree: archiveFolderTree,
        isEmpty: false,
      });
    });

    staleFolderChangedHandler({
      payload: {
        folderPath: "C:/Notes",
        paths: ["C:/Notes/new.md"],
      },
    });

    await new Promise((resolve) => window.setTimeout(resolve, 250));

    expect(countScanMarkdownFolderCalls()).toBe(0);
  });

  it("keeps deleted active saved documents open while refreshing the sidebar", async () => {
    const refreshedTree = {
      ...nestedNotesFolderTree,
      children: nestedNotesFolderTree.children.filter((node) => node.name !== "readme.md"),
    };

    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: nestedNotesFolderTree, isEmpty: false },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });
    vi.mocked(invoke).mockImplementation(async (commandName) => {
      if (commandName === "scan_markdown_folder") {
        return {
          path: "C:/Notes",
          tree: refreshedTree,
          isEmpty: false,
        };
      }

      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(watchMarkdownFolder).toHaveBeenCalled();
    });

    findFolderChangedHandler()({
      payload: {
        folderPath: "C:/Notes",
        paths: ["C:/Notes/readme.md"],
      },
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "readme.md" })).not.toBeInTheDocument();
    });
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
      path: "C:/Notes/readme.md",
    });
  });

  it.each([
    {
      name: "oversized files",
      error: {
        kind: "oversizedFile",
        path: "C:/Notes/large.md",
        sizeBytes: 6 * 1024 * 1024,
        maxSizeBytes: 5 * 1024 * 1024,
      },
      title: "Markdown file is too large.",
      description: "6 MB selected. Files larger than 5 MB do not load.",
    },
    {
      name: "invalid encoding",
      error: {
        kind: "invalidEncoding",
        path: "C:/Notes/invalid.md",
      },
      title: "Invalid Markdown file encoding.",
      description: "Leafdown opens Markdown files encoded as UTF-8.",
    },
  ])("shows specific open errors for $name", async ({ error, title, description }) => {
    vi.mocked(open).mockResolvedValue("C:/Notes/problem.md");
    vi.mocked(invoke).mockRejectedValue(error);

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open file" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(title, { description });
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      activeDocument: null,
    });
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
        isDirty: false,
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
    vi.mocked(invoke).mockRejectedValue({
      kind: "readFailed",
      path: "C:/Notes/readme.md",
      message: "access failed",
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open file" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });

    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      activeDocument: null,
    });
    expect(toast.error).toHaveBeenCalledWith("Could not read Markdown file.", {
      description: "access failed",
    });
  });

  it("does not partially update the session when selected folder opening fails", async () => {
    vi.mocked(open).mockResolvedValue("C:/Notes");
    vi.mocked(invoke).mockRejectedValue({
      kind: "scanFailed",
      error: {
        kind: "readDirectoryFailed",
        path: "C:/Notes",
        message: "access failed",
      },
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });

    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      activeDocument: null,
    });
    expect(toast.error).toHaveBeenCalledWith("Could not read folder.", {
      description: "access failed",
    });
  });

  it("destroys the window after clean backend close requests", async () => {
    const appWindow = getCurrentWindow();
    render(<App />);

    await waitFor(() => {
      expect(appWindow.listen).toHaveBeenCalledWith(
        "leafdown://window-close-requested",
        expect.any(Function),
      );
    });

    const handleCloseRequested = vi.mocked(appWindow.listen).mock.calls[0][1];

    await handleCloseRequested({} as never);

    expect(confirm).not.toHaveBeenCalled();
    expect(appWindow.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps the window open after dirty backend close requests when the prompt is cancelled", async () => {
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
      expect(appWindow.listen).toHaveBeenCalledWith(
        "leafdown://window-close-requested",
        expect.any(Function),
      );
    });

    const handleCloseRequested = vi.mocked(appWindow.listen).mock.calls[0][1];

    await handleCloseRequested({} as never);

    expect(confirm).toHaveBeenCalled();
    expect(appWindow.destroy).not.toHaveBeenCalled();
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "untitled",
      id: "untitled:test",
      isDirty: true,
    });
  });

  it("unlistens backend close request events when setup resolves after unmount", async () => {
    const appWindow = getCurrentWindow();
    const unlisten = vi.fn();
    let resolveListen!: (unlisten: () => void) => void;

    vi.mocked(appWindow.listen).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveListen = resolve;
      }),
    );

    const { unmount } = render(<App />);

    unmount();
    resolveListen(unlisten);

    await waitFor(() => {
      expect(unlisten).toHaveBeenCalledTimes(1);
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
