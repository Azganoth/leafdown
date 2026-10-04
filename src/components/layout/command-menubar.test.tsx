// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { type AppCommandId, type CommandState, type ReopenWithEncodingControl } from "@/commands";
import type { RecentItem } from "@/features/preferences";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { renderWithUser, screen, within } from "@/test/utils/react";

import { CommandMenubar } from "./command-menubar";

const enabledState = { enabled: true } satisfies CommandState;
const disabledState = {
  enabled: false,
  reason: "Unavailable in this test state.",
} satisfies CommandState;

interface CommandMenuBarTestProps {
  reopenWithEncoding?: ReopenWithEncodingControl;
  commandState?: (commandId: AppCommandId) => CommandState;
  fileEncodingLabel?: string | null;
  onExecute?: (commandId: AppCommandId) => void;
  onOpenRecentFile?: (path: string) => void;
  onOpenRecentFolder?: (path: string) => void;
  recentFiles?: RecentItem[];
  recentFolders?: RecentItem[];
}

const renderCommandMenuBar = ({
  commandState = () => enabledState,
  fileEncodingLabel = null,
  onExecute = vi.fn(),
  onOpenRecentFile = vi.fn(),
  onOpenRecentFolder = vi.fn(),
  recentFiles = [],
  recentFolders = [],
  reopenWithEncoding,
}: CommandMenuBarTestProps = {}) => ({
  ...renderWithUser(
    <CommandMenubar
      commandState={commandState}
      fileEncodingLabel={fileEncodingLabel}
      onExecute={onExecute}
      onOpenRecentFile={onOpenRecentFile}
      onOpenRecentFolder={onOpenRecentFolder}
      recentFiles={recentFiles}
      recentFolders={recentFolders}
      reopenWithEncoding={reopenWithEncoding}
    />,
  ),
  onExecute,
  onOpenRecentFile,
  onOpenRecentFolder,
});

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const menuItem = (name: string | RegExp) => {
  const matcher = typeof name === "string" ? new RegExp(`^${escapeRegExp(name)}`, "u") : name;

  return (
    screen.queryByRole("menuitem", { name: matcher }) ??
    screen.queryByRole("menuitemcheckbox", { name: matcher }) ??
    screen.getByRole("menuitemradio", { name: matcher })
  );
};

describe("CommandMenubar", () => {
  it("renders MVP menus and keeps unavailable file commands disabled", async () => {
    const { user } = renderCommandMenuBar({
      commandState: (commandId) => {
        if (
          commandId === "file.save" ||
          commandId === "file.saveAs" ||
          commandId === "file.closeFolder" ||
          commandId === "file.revealInSidebar"
        ) {
          return disabledState;
        }

        return enabledState;
      },
    });

    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Insert" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Format" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Help" })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "File" }));

    expect(menuItem(/^New/u)).toBeInTheDocument();
    expect(menuItem(/^Save(?! as)/u)).toHaveAttribute("data-disabled");
    expect(menuItem(/^Save as/u)).toHaveAttribute("data-disabled");
    expect(menuItem(/^Reveal in sidebar/u)).toHaveAttribute("data-disabled");
    expect(menuItem(/^Close folder/u)).toHaveAttribute("data-disabled");
  });

  it("offers HTML export from the File menu's Export submenu", async () => {
    const { onExecute, user } = renderCommandMenuBar();

    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.hover(menuItem("Export"));
    await user.keyboard("{ArrowRight}");

    expect(menuItem(/^Export as HTML\.\.\./u)).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onExecute).toHaveBeenCalledWith("file.exportHtml");
  });

  it("disables the Export submenu without a document to export", async () => {
    const { user } = renderCommandMenuBar({
      commandState: (commandId) => (commandId === "file.exportHtml" ? disabledState : enabledState),
    });

    await user.click(screen.getByRole("menuitem", { name: "File" }));

    expect(menuItem("Export")).toHaveAttribute("data-disabled");
  });

  it("keeps unavailable view commands disabled and omits Post-MVP commands", async () => {
    const { user } = renderCommandMenuBar({
      commandState: (commandId) => {
        if (commandId === "view.collapseAllFolders" || commandId === "view.expandAllFolders") {
          return disabledState;
        }

        return enabledState;
      },
    });

    await user.click(screen.getByRole("menuitem", { name: "View" }));

    expect(menuItem("Sort articles by")).toBeInTheDocument();
    expect(menuItem("Collapse all folders")).toHaveAttribute("data-disabled");
    expect(menuItem("Expand all folders")).toHaveAttribute("data-disabled");
    expect(screen.queryByText("Toggle DevTools")).not.toBeInTheDocument();
  });

  it("checks and dispatches the always on top toggle", async () => {
    const { onExecute, user } = renderCommandMenuBar({
      commandState: (commandId) =>
        commandId === "view.alwaysOnTop" ? { enabled: true, checked: true } : enabledState,
    });

    await user.click(screen.getByRole("menuitem", { name: "View" }));
    const toggle = screen.getByRole("menuitemcheckbox", { name: "Always on top" });

    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);

    expect(onExecute).toHaveBeenCalledWith("view.alwaysOnTop");
  });

  it("checks and dispatches the status bar toggle", async () => {
    const { onExecute, user } = renderCommandMenuBar({
      commandState: (commandId) =>
        commandId === "view.toggleStatusBar" ? { enabled: true, checked: true } : enabledState,
    });

    await user.click(screen.getByRole("menuitem", { name: "View" }));
    const toggle = screen.getByRole("menuitemcheckbox", { name: "Toggle status bar" });

    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);

    expect(onExecute).toHaveBeenCalledWith("view.toggleStatusBar");
  });

  it("closes the menu after a checkbox command so one click reopens it", async () => {
    const { onExecute, user } = renderCommandMenuBar({
      commandState: () => ({ enabled: true, checked: true }),
    });
    const viewTrigger = screen.getByRole("menuitem", { name: "View" });

    await user.click(viewTrigger);
    await user.click(menuItem("Toggle sidebar"));

    expect(onExecute).toHaveBeenCalledWith("view.toggleSidebar");
    expect(viewTrigger).toHaveAttribute("aria-expanded", "false");

    await user.click(viewTrigger);

    expect(viewTrigger).toHaveAttribute("aria-expanded", "true");
    expect(menuItem("Toggle status bar")).toBeVisible();
  });

  it("converts the encoding and reopens from the Edit menu", async () => {
    const reopen = vi.fn();
    const { onExecute, user } = renderCommandMenuBar({
      reopenWithEncoding: { state: enabledState, checkedEncoding: "windows-1252", reopen },
      commandState: (commandId) =>
        commandId === "edit.encoding.file" ? { enabled: true, checked: true } : enabledState,
      fileEncodingLabel: "Windows-1252",
    });

    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.hover(menuItem("Encoding"));
    await user.keyboard("{ArrowRight}");

    expect(
      within(screen.getByRole("group", { name: "Save with encoding" }))
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual(["Windows-1252", "UTF-8", "UTF-8 with BOM"]);
    expect(screen.getByRole("menuitemradio", { name: "Windows-1252" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}");

    expect(
      await screen.findByRole("menuitemradio", { name: "Western (Windows-1252, ISO-8859-1)" }),
    ).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{End}{Enter}");

    expect(reopen).toHaveBeenCalledWith("UTF-16BE");
    expect(onExecute).not.toHaveBeenCalled();
  });

  it("disables reopening without a document to reopen", async () => {
    const { user } = renderCommandMenuBar();

    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.hover(menuItem("Encoding"));
    await user.keyboard("{ArrowRight}");

    expect(menuItem("Reopen with encoding")).toHaveAttribute("data-disabled");
  });

  it("omits the file encoding choice when the file is UTF-8", async () => {
    const { user } = renderCommandMenuBar({
      commandState: (commandId) =>
        commandId === "edit.encoding.file" ? disabledState : enabledState,
    });

    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.hover(menuItem("Encoding"));
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("menuitemradio", { name: "UTF-8 with BOM" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemradio", { name: "Encoding the file was read in" }),
    ).not.toBeInTheDocument();
  });

  it("closes the menu after a radio command so one click reopens it", async () => {
    const { onExecute, user } = renderCommandMenuBar();
    const viewTrigger = screen.getByRole("menuitem", { name: "View" });

    await user.click(viewTrigger);
    await user.hover(menuItem("Appearance"));
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onExecute).toHaveBeenCalledWith("view.appearance.dark");
    expect(viewTrigger).toHaveAttribute("aria-expanded", "false");

    await user.click(viewTrigger);

    expect(viewTrigger).toHaveAttribute("aria-expanded", "true");
  });

  it("disables a submenu trigger when every command it contains is disabled", async () => {
    const { user } = renderCommandMenuBar({
      commandState: (commandId) =>
        commandId.startsWith("format.table.") ? disabledState : enabledState,
    });

    await user.click(screen.getByRole("menuitem", { name: "Format" }));

    const tableTrigger = menuItem("Table");

    expect(tableTrigger).toHaveAttribute("data-disabled");
    expect(tableTrigger).toHaveAttribute("aria-disabled", "true");

    await user.hover(tableTrigger);
    await user.keyboard("{ArrowRight}");

    expect(screen.queryByRole("menuitem", { name: /^Add row above/u })).not.toBeInTheDocument();
  });

  it("keeps a submenu trigger enabled while one of its commands is available", async () => {
    const { user } = renderCommandMenuBar({
      commandState: (commandId) =>
        commandId === "format.table.addRowAbove" ? enabledState : disabledState,
    });

    await user.click(screen.getByRole("menuitem", { name: "Format" }));

    const tableTrigger = menuItem("Table");

    expect(tableTrigger).not.toHaveAttribute("data-disabled");

    await user.hover(tableTrigger);
    await user.keyboard("{ArrowRight}");

    expect(menuItem(/^Add row above/u)).not.toHaveAttribute("data-disabled");
    expect(menuItem(/^Delete table/u)).toHaveAttribute("data-disabled");
  });

  it("disables the sort submenu trigger when no sort order is available", async () => {
    const { user } = renderCommandMenuBar({
      commandState: (commandId) =>
        commandId.startsWith("view.sort.") ? disabledState : enabledState,
    });

    await user.click(screen.getByRole("menuitem", { name: "View" }));

    expect(menuItem("Sort articles by")).toHaveAttribute("data-disabled");
    expect(menuItem("Appearance")).not.toHaveAttribute("data-disabled");
  });

  it("keeps submenus holding an always-available command enabled", async () => {
    const { user } = renderCommandMenuBar({
      commandState: (commandId) =>
        commandId === "edit.insertFinalNewline" ? enabledState : disabledState,
    });

    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(menuItem("Line ending")).not.toHaveAttribute("data-disabled");
    expect(menuItem("Copy as")).toHaveAttribute("data-disabled");
  });

  it("omits Post-MVP edit commands", async () => {
    const { user } = renderCommandMenuBar();

    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(screen.queryByText("Find...")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete block")).not.toBeInTheDocument();
  });

  it("renders support debugging commands in the Help menu", async () => {
    const { onExecute, user } = renderCommandMenuBar();

    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    expect(menuItem("What's new...")).toBeInTheDocument();
    expect(menuItem("Changelog")).toBeInTheDocument();
    expect(menuItem("Keyboard shortcuts")).toBeInTheDocument();
    expect(menuItem("Report issue")).toBeInTheDocument();
    expect(menuItem("Request feature")).toBeInTheDocument();
    expect(menuItem("Diagnostics...")).toBeInTheDocument();

    await user.click(menuItem("Report issue"));
    expect(onExecute).toHaveBeenCalledWith("help.reportIssue");

    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    await user.click(menuItem("Request feature"));
    expect(onExecute).toHaveBeenCalledWith("help.requestFeature");

    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    await user.click(menuItem("Open DevTools"));

    expect(onExecute).toHaveBeenCalledWith("help.openDevTools");

    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    await user.click(menuItem("What's new..."));
    expect(onExecute).toHaveBeenCalledWith("help.whatsNew");

    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    await user.click(menuItem("Changelog"));
    expect(onExecute).toHaveBeenCalledWith("help.changelog");
  });

  it("routes the four Help pages in Reference order", async () => {
    const { onExecute, user } = renderCommandMenuBar();
    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    const names = [
      "Getting started",
      "Markdown reference",
      "File and folder workflows",
      "Settings reference",
    ];
    expect(
      screen
        .getAllByRole("menuitem")
        .map((item) => item.textContent?.trim())
        .filter((name) => names.includes(name ?? "")),
    ).toEqual(names);
    await user.click(menuItem("Getting started"));
    expect(onExecute).toHaveBeenCalledWith("help.gettingStarted");
  });

  it("renders empty recent menus", async () => {
    const { user } = renderCommandMenuBar();

    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.hover(screen.getByRole("menuitem", { name: "Open recent" }));
    await user.keyboard("{ArrowRight}");

    expect(screen.getByText("No recent files.")).toBeInTheDocument();
    expect(screen.getByText("No recent folders.")).toBeInTheDocument();
    expect(menuItem("Clear recent items")).toBeInTheDocument();
  });

  it("groups recent entries under their section headings", async () => {
    const { user } = renderCommandMenuBar({
      recentFiles: [{ path: TEST_MARKDOWN_FILE_PATH }],
      recentFolders: [{ path: TEST_NOTES_FOLDER_PATH }],
    });

    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.hover(screen.getByRole("menuitem", { name: "Open recent" }));
    await user.keyboard("{ArrowRight}");

    const filesGroup = screen.getByRole("group", { name: "Recent files" });
    const foldersGroup = screen.getByRole("group", { name: "Recent folders" });

    expect(
      within(filesGroup).getByRole("menuitem", { name: TEST_MARKDOWN_FILE_PATH }),
    ).toBeVisible();
    expect(
      within(foldersGroup).getByRole("menuitem", { name: TEST_NOTES_FOLDER_PATH }),
    ).toBeVisible();
  });

  it("opens recent files and folders from the submenu", async () => {
    const { onOpenRecentFile, onOpenRecentFolder, user } = renderCommandMenuBar({
      recentFiles: [{ path: TEST_MARKDOWN_FILE_PATH }],
      recentFolders: [{ path: TEST_NOTES_FOLDER_PATH }],
    });

    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.hover(screen.getByRole("menuitem", { name: "Open recent" }));
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Enter}");

    expect(onOpenRecentFile).toHaveBeenCalledWith(TEST_MARKDOWN_FILE_PATH);

    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.hover(screen.getByRole("menuitem", { name: "Open recent" }));
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onOpenRecentFolder).toHaveBeenCalledWith(TEST_NOTES_FOLDER_PATH);
  });

  it("dispatches the clear recent command from the submenu", async () => {
    const { onExecute, user } = renderCommandMenuBar({
      recentFiles: [{ path: TEST_MARKDOWN_FILE_PATH }],
      recentFolders: [{ path: TEST_NOTES_FOLDER_PATH }],
    });

    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.hover(screen.getByRole("menuitem", { name: "Open recent" }));
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onExecute).toHaveBeenCalledWith("file.clearRecentItems");
  });
});
