// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { setDefaultSettings } from "@/test/utils/appStores";
import { renderWithUser, screen } from "@/test/utils/react";

import { useSettingsStore } from "../stores/settings";
import { PreferencesDialog } from "./preferences-dialog";

describe("preferences-dialog", () => {
  it("exposes MVP settings without Post-MVP settings", () => {
    renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Preferences" })).toBeInTheDocument();
    expect(screen.getByText("Record recent files and folders")).toBeInTheDocument();
    expect(screen.getByText("Sidebar visibility")).toBeInTheDocument();
    expect(screen.getByText("Sort articles by")).toBeInTheDocument();
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

  it("updates persisted settings", async () => {
    setDefaultSettings({ sidebarVisible: true, theme: "system" });

    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

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
  });
});
