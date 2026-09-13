// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { setDefaultSettings } from "@/test/utils/appStores";
import { renderWithUser, screen } from "@/test/utils/react";

import { useSettingsStore } from "../stores/settings";
import { PreferencesDialog } from "./preferences-dialog";

const MVP_SETTINGS_BY_TAB = {
  General: ["Record recent files and folders", "Sidebar visibility", "Sort articles by"],
  Files: [
    "Default extension for new documents",
    "Default line ending for new documents",
    "Insert final newline on save",
    "Index file names for automatic folder open",
    "Ignored directories for folder scans",
  ],
  Editor: ["Auto pair brackets and quotes", "Soft wrap for code blocks"],
  Appearance: ["Appearance theme"],
};

const POST_MVP_SETTINGS = [
  "Auto save",
  "Render/editor theme",
  "Display line numbers for code blocks",
  "Unordered list marker",
];

describe("preferences-dialog", () => {
  it("exposes MVP settings without Post-MVP settings", async () => {
    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Preferences" })).toBeInTheDocument();

    for (const [tab, settings] of Object.entries(MVP_SETTINGS_BY_TAB)) {
      await user.click(screen.getByRole("tab", { name: tab }));

      for (const setting of settings) {
        expect(screen.getByText(setting)).toBeInTheDocument();
      }

      for (const setting of POST_MVP_SETTINGS) {
        expect(screen.queryByText(setting)).not.toBeInTheDocument();
      }
    }
  });

  it("updates persisted settings", async () => {
    setDefaultSettings({ sidebarVisible: true, theme: "system" });

    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("switch", { name: "Sidebar visibility" }));

    await user.click(screen.getByRole("tab", { name: "Files" }));
    const ignoredDirectoriesInput = screen.getByLabelText("Ignored directories for folder scans");
    await user.clear(ignoredDirectoriesInput);
    await user.type(ignoredDirectoriesInput, ".git{enter}vendor");
    await user.tab();

    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(useSettingsStore.getState()).toMatchObject({
      ignoredDirectories: [".git", "vendor"],
      sidebarVisible: false,
      theme: "dark",
    });
  });

  it("keeps a choice when its selected option is pressed again", async () => {
    setDefaultSettings({ theme: "dark" });

    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(useSettingsStore.getState()).toMatchObject({ theme: "dark" });
  });

  it("restores default settings", async () => {
    setDefaultSettings({ sidebarVisible: false, theme: "dark" });

    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Restore defaults" }));

    expect(useSettingsStore.getState()).toMatchObject({
      sidebarVisible: true,
      theme: "system",
    });
  });
});
