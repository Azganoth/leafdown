import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";

import App from "./App";
import { settingsStoreTauriHandler } from "./stores/settings";
import { render, screen } from "./test/utils/react";
import { resetAppStores, setDefaultSession, setDefaultSettings } from "./test/utils/stores";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    setDefaultSession({ folderContext: { status: "available" } });

    render(<App />);

    expect(screen.getByText("No document open")).toBeInTheDocument();
    expect(
      screen.getByText("Select a Markdown file from the sidebar or create a new document."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("active-document-host")).not.toBeInTheDocument();
  });

  it("renders the active document surface host for document sessions", () => {
    setDefaultSession({ activeDocument: { status: "active" } });

    render(<App />);

    expect(screen.getByTestId("active-document-host")).toBeInTheDocument();
    expect(screen.queryByText("No document open")).not.toBeInTheDocument();
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
