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
    setDefaultSession({ folderContext: { status: "available", path: "C:/Notes" } });

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
    vi.mocked(invoke).mockResolvedValue({
      path: "C:/Notes/readme.md",
      parentFolderPath: "C:/Notes",
      content: "# Notes\n",
      lineEnding: "lf",
      metadata: { sizeBytes: 8, modifiedAtUnixMs: 1_773_916_800_000 },
    });

    const { user } = renderWithUser(<App />);

    await user.click(screen.getByRole("button", { name: "Open file" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("open_markdown_file", {
        path: "C:/Notes/readme.md",
      });
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
