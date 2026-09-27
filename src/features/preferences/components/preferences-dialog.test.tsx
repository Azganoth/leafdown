// @vitest-environment happy-dom

import { getCurrentWindow } from "@tauri-apps/api/window";
import { describe, expect, it, vi } from "vitest";

import type { DocumentTypography } from "@/features/editor";
import { toastManager } from "@/lib/toast";
import { setDefaultSettings } from "@/test/utils/appStores";
import { renderWithUser, screen, within } from "@/test/utils/react";

import { useSettingsStore } from "../stores/settings";
import { PreferencesDialog } from "./preferences-dialog";

const MVP_SETTINGS_BY_TAB = {
  General: [
    "Language",
    "Record recent files and folders",
    "Sidebar visibility",
    "Sort articles by",
  ],
  Files: [
    "Default extension for new documents",
    "Default line ending for new documents",
    "Insert final newline on save",
    "When dropping a folder",
    "When dropping a Markdown file",
    "Index file names for automatic folder open",
    "Ignored directories for folder scans",
  ],
  Editor: [
    "Auto pair brackets and quotes",
    "Display line numbers for code blocks",
    "Soft wrap for code blocks",
  ],
  Appearance: ["Accent color", "Appearance theme", "Document font", "Text size", "Line spacing"],
};

const POST_MVP_SETTINGS = ["Auto save", "Render/editor theme", "Unordered list marker"];

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
    setDefaultSettings({ accentColor: "neutral", sidebarVisible: true, theme: "system" });

    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("switch", { name: "Sidebar visibility" }));

    await user.click(screen.getByRole("tab", { name: "Files" }));
    const folderDropSetting = screen.getByRole("group", { name: "When dropping a folder" });
    const fileDropSetting = screen.getByRole("group", {
      name: "When dropping a Markdown file",
    });

    await user.click(within(folderDropSetting).getByRole("button", { name: "Insert folder link" }));
    await user.click(within(fileDropSetting).getByRole("button", { name: "Insert file link" }));
    const ignoredDirectoriesInput = screen.getByLabelText("Ignored directories for folder scans");
    await user.clear(ignoredDirectoriesInput);
    await user.type(ignoredDirectoriesInput, ".git{enter}vendor");
    await user.tab();

    await user.click(screen.getByRole("tab", { name: "Editor" }));
    await user.click(screen.getByRole("switch", { name: "Display line numbers for code blocks" }));

    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    const accentColorSelect = screen.getByRole("combobox", { name: "Accent color" });
    expect(accentColorSelect).toHaveTextContent("Neutral");
    expect(
      accentColorSelect.querySelector('[data-accent-color-preview="neutral"]'),
    ).toBeInTheDocument();

    await user.click(accentColorSelect);
    await user.click(screen.getByRole("option", { name: "Violet" }));
    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(accentColorSelect).toHaveTextContent("Violet");
    expect(
      accentColorSelect.querySelector('[data-accent-color-preview="violet"]'),
    ).toBeInTheDocument();

    expect(useSettingsStore.getState()).toMatchObject({
      ignoredDirectories: [".git", "vendor"],
      whenDroppingFolder: "insertLink",
      whenDroppingMarkdownFile: "insertLink",
      displayCodeBlockLineNumbers: true,
      sidebarVisible: false,
      accentColor: "violet",
      theme: "dark",
    });
  });

  it("offers the system language and each available locale by its own name", async () => {
    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);
    const languageSelect = screen.getByRole("combobox", { name: "Language" });

    expect(languageSelect).toHaveTextContent("System (English)");

    await user.click(languageSelect);

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "System (English)",
      "English",
      "English (Pseudo-Accents)",
    ]);
    expect(screen.getByRole("option", { name: "English" })).toHaveAttribute("lang", "en");

    await user.click(screen.getByRole("option", { name: "English (Pseudo-Accents)" }));

    expect(useSettingsStore.getState().language).toBe("en-XA");
  });

  it("shows an unavailable stored language as the system language without replacing it", () => {
    setDefaultSettings({ language: "ja" });

    renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "Language" })).toHaveTextContent(
      "System (English)",
    );
    expect(useSettingsStore.getState().language).toBe("ja");
  });

  it("keeps a choice when its selected option is pressed again", async () => {
    setDefaultSettings({ theme: "dark" });

    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(useSettingsStore.getState()).toMatchObject({ theme: "dark" });
  });

  it("sets the document typography", async () => {
    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    const fontSelect = screen.getByRole("combobox", { name: "Document font" });
    const textSizeSetting = screen.getByRole("group", { name: "Text size" });
    const lineSpacingSetting = screen.getByRole("group", { name: "Line spacing" });

    expect(fontSelect).toHaveTextContent("Inter");
    expect(
      within(textSizeSetting)
        .getAllByRole("button")
        .map((option) => option.textContent),
    ).toEqual(["14 px", "16 px", "18 px", "20 px"]);
    expect(
      within(lineSpacingSetting)
        .getAllByRole("button")
        .map((option) => option.textContent),
    ).toEqual(["Compact", "Default", "Relaxed"]);
    expect(within(textSizeSetting).getByRole("button", { name: "16 px" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(lineSpacingSetting).getByRole("button", { name: "Default" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(fontSelect);

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Inter",
      "IBM Plex Sans",
      "Atkinson Hyperlegible Next",
      "Literata",
      "System",
    ]);
    expect(screen.getByRole("option", { name: "Literata" })).toHaveClass("font-literata");

    await user.click(screen.getByRole("option", { name: "Literata" }));
    await user.click(within(textSizeSetting).getByRole("button", { name: "20 px" }));
    await user.click(within(lineSpacingSetting).getByRole("button", { name: "Compact" }));

    expect(fontSelect).toHaveTextContent("Literata");
    expect(useSettingsStore.getState()).toMatchObject({
      documentFont: "literata",
      textSize: 20,
      lineSpacing: "compact",
    });
  });

  it("previews the chosen document typography", async () => {
    const renderTypographyPreview = vi.fn((typography: DocumentTypography) => (
      <output data-testid="typography-preview">{JSON.stringify(typography)}</output>
    ));
    const { user } = renderWithUser(
      <PreferencesDialog
        open
        onOpenChange={vi.fn()}
        renderTypographyPreview={renderTypographyPreview}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Appearance" }));

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByTestId("typography-preview")).toHaveTextContent(
      JSON.stringify({ font: "inter", textSize: 16, lineSpacing: "default" }),
    );

    await user.click(
      within(screen.getByRole("group", { name: "Line spacing" })).getByRole("button", {
        name: "Relaxed",
      }),
    );

    expect(screen.getByTestId("typography-preview")).toHaveTextContent(
      JSON.stringify({ font: "inter", textSize: 16, lineSpacing: "relaxed" }),
    );
  });

  it("restores default settings", async () => {
    setDefaultSettings({
      accentColor: "amber",
      displayCodeBlockLineNumbers: true,
      documentFont: "system",
      lineSpacing: "relaxed",
      sidebarVisible: false,
      textSize: 18,
      theme: "dark",
    });

    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Restore defaults" }));

    expect(useSettingsStore.getState()).toMatchObject({
      displayCodeBlockLineNumbers: false,
      sidebarVisible: true,
      accentColor: "neutral",
      theme: "system",
      documentFont: "inter",
      textSize: 16,
      lineSpacing: "default",
    });
  });

  it("turns always on top off for the window when restoring defaults", async () => {
    setDefaultSettings({ alwaysOnTop: true });

    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Restore defaults" }));

    await vi.waitFor(() => {
      expect(useSettingsStore.getState().alwaysOnTop).toBe(false);
    });
    expect(getCurrentWindow().setAlwaysOnTop).toHaveBeenCalledWith(false);
  });

  it("reports a window that stays on top after restoring defaults", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getCurrentWindow().setAlwaysOnTop).mockRejectedValueOnce(
      new Error("window unavailable"),
    );
    setDefaultSettings({ alwaysOnTop: true, sidebarVisible: false });

    const { user } = renderWithUser(<PreferencesDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Restore defaults" }));

    await vi.waitFor(() => {
      expect(toastManager.add).toHaveBeenCalledWith({
        description: "window unavailable",
        title: "Could not turn off always on top.",
        type: "error",
      });
    });
    expect(useSettingsStore.getState()).toMatchObject({
      alwaysOnTop: true,
      sidebarVisible: true,
    });
    consoleError.mockRestore();
  });
});
