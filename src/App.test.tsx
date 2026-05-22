import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setTheme } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

import App from "./App";
import { useSessionStore } from "./stores/session";
import { settingsStoreTauriHandler } from "./stores/settings";
import { render, renderWithUser, screen } from "./test/utils/react";
import { resetAppStores, setDefaultSession, setDefaultSettings } from "./test/utils/stores";

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

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockReset();
    vi.mocked(open).mockResolvedValue(null);
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
    expect(screen.getByText("No recent files.")).toBeInTheDocument();
    expect(screen.getByText("No recent folders.")).toBeInTheDocument();
    expect(screen.getByTestId("menu-bar-host")).toBeInTheDocument();
    expect(screen.getByTestId("file-tree-sidebar-host")).toBeInTheDocument();
    expect(screen.getByTestId("document-surface-host")).toBeInTheDocument();
    expect(screen.getByTestId("modal-layer-host")).toBeInTheDocument();
  });

  it("renders a folder-only document placeholder without an active document host", () => {
    setDefaultSession({
      folderContext: { status: "available", path: "C:/Notes", tree: notesFolderTree },
    });

    render(<App />);

    expect(screen.getByText("No document open")).toBeInTheDocument();
    expect(
      screen.getByText("Select a Markdown file from the sidebar or create a new document."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("active-document-host")).not.toBeInTheDocument();
  });

  it("renders the active document surface host for document sessions", () => {
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

    expect(screen.getByTestId("active-document-host")).toBeInTheDocument();
    expect(screen.getByText("Document open")).toBeInTheDocument();
    expect(screen.getByText("C:/Notes/readme.md")).toBeInTheDocument();
    expect(screen.queryByText("No document open")).not.toBeInTheDocument();
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
    });

    expect(open).toHaveBeenCalledWith({
      directory: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      multiple: false,
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { status: "available", path: "C:/Notes" },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes\n",
        lineEnding: "lf",
        metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_800_000 },
      },
    });
    expect(screen.getByTestId("active-document-host")).toBeInTheDocument();
  });

  it("opens a selected folder index into a saved document session", async () => {
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
      });
    });

    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { status: "available", path: "C:/Notes", tree: notesFolderTree },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes\n",
      },
    });
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
      folderContext: { status: "available", path: "C:/Notes", tree: notesFolderTree },
      activeDocument: null,
    });
  });

  it("tracks selected folders with no Markdown files as empty folder contexts", async () => {
    vi.mocked(open).mockResolvedValue("C:/Empty");
    vi.mocked(invoke).mockResolvedValue({
      folder: {
        path: "C:/Empty",
        tree: { name: "Empty", path: "C:/Empty", children: [] },
        isEmpty: true,
      },
      indexDocument: null,
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open folder" }));

    await waitFor(() => {
      expect(useSessionStore.getState()).toMatchObject({
        folderContext: { status: "empty", path: "C:/Empty" },
        activeDocument: null,
      });
    });
    expect(screen.getByText("No document open")).toBeInTheDocument();
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
