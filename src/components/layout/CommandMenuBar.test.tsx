import { describe, expect, it, vi } from "vitest";

import { type AppCommandId, type CommandState } from "@/commands";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { renderWithUser, screen, within } from "@/test/utils/react";

import { CommandMenuBar } from "./CommandMenuBar";

const enabledState = { enabled: true } satisfies CommandState;
const disabledState = {
  enabled: false,
  reason: "Unavailable in this test state.",
} satisfies CommandState;

interface CommandMenuBarTestProps {
  commandState?: (commandId: AppCommandId) => CommandState;
  onExecute?: (commandId: AppCommandId) => void;
  onOpenRecentFile?: (path: string) => void;
  onOpenRecentFolder?: (path: string) => void;
  recentFiles?: string[];
  recentFolders?: string[];
}

const renderCommandMenuBar = ({
  commandState = () => enabledState,
  onExecute = vi.fn(),
  onOpenRecentFile = vi.fn(),
  onOpenRecentFolder = vi.fn(),
  recentFiles = [],
  recentFolders = [],
}: CommandMenuBarTestProps = {}) => ({
  ...renderWithUser(
    <CommandMenuBar
      commandState={commandState}
      onExecute={onExecute}
      onOpenRecentFile={onOpenRecentFile}
      onOpenRecentFolder={onOpenRecentFolder}
      recentFiles={recentFiles}
      recentFolders={recentFolders}
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

describe("CommandMenuBar", () => {
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
    expect(screen.queryByText("Toggle status bar")).not.toBeInTheDocument();
    expect(screen.queryByText("Toggle DevTools")).not.toBeInTheDocument();
    expect(screen.queryByText("Always on top")).not.toBeInTheDocument();
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
    expect(menuItem("Diagnostics...")).toBeInTheDocument();

    await user.click(menuItem("Open DevTools"));

    expect(onExecute).toHaveBeenCalledWith("help.openDevTools");
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
      recentFiles: [TEST_MARKDOWN_FILE_PATH],
      recentFolders: [TEST_NOTES_FOLDER_PATH],
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
      recentFiles: [TEST_MARKDOWN_FILE_PATH],
      recentFolders: [TEST_NOTES_FOLDER_PATH],
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
      recentFiles: [TEST_MARKDOWN_FILE_PATH],
      recentFolders: [TEST_NOTES_FOLDER_PATH],
    });

    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.hover(screen.getByRole("menuitem", { name: "Open recent" }));
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onExecute).toHaveBeenCalledWith("file.clearRecentItems");
  });
});
