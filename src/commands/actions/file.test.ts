import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { useArticleNavigatorStore } from "@/features/folder-context";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import { createAppCommandContext } from "@/test/factories/commands";
import { createSavedDocument } from "@/test/factories/document";
import { createFolderContextWithNestedReadme } from "@/test/factories/folderContext";
import {
  TEST_MARKDOWN_FILE_PATH,
  TEST_NESTED_DIRECTORY_PATH,
  TEST_NESTED_MARKDOWN_FILE_PATH,
} from "@/test/fixtures/paths";
import { setDefaultRecentItems, setDefaultSettings } from "@/test/utils/appStores";

import { useCommandUIStore } from "../stores/commandUi";
import { clearRecentItems, openLocation, openPreferences, revealInSidebar } from "./file";

describe("file actions", () => {
  it("clears recent items", () => {
    setDefaultRecentItems({ recentFiles: [TEST_MARKDOWN_FILE_PATH] });
    clearRecentItems();
    expect(useRecentItemsStore.getState().recentFiles).toEqual([]);
  });

  it("reveals the active article and opens the sidebar", () => {
    setDefaultSettings({ sidebarVisible: false });

    revealInSidebar(
      createAppCommandContext({
        activeDocument: createSavedDocument({
          path: TEST_NESTED_MARKDOWN_FILE_PATH,
        }),
        folderContext: createFolderContextWithNestedReadme(),
      }),
    );

    expect(useSettingsStore.getState().sidebarVisible).toBe(true);
    expect(useArticleNavigatorStore.getState()).toMatchObject({
      expandedDirectoryPaths: [TEST_NESTED_DIRECTORY_PATH],
      revealArticlePath: TEST_NESTED_MARKDOWN_FILE_PATH,
      revealRequestId: 1,
    });
  });

  it("opens the active file location only when a saved path is available", async () => {
    openLocation(createAppCommandContext());
    expect(revealItemInDir).not.toHaveBeenCalled();

    openLocation(createAppCommandContext({ activeDocument: createSavedDocument() }));

    await vi.waitFor(() => {
      expect(revealItemInDir).toHaveBeenCalledWith(TEST_MARKDOWN_FILE_PATH);
    });
  });

  it("shows a command error when opening the active file location fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(revealItemInDir).mockRejectedValueOnce(new Error("missing folder"));

    openLocation(createAppCommandContext({ activeDocument: createSavedDocument() }));

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not open file location.", {
        description: "missing folder",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Unexpected error (openLocation).",
        expect.any(Error),
      );
    });
  });

  it("opens preferences dialog through UI store", () => {
    useCommandUIStore.getState().setPreferencesOpen(false);
    openPreferences();
    expect(useCommandUIStore.getState().preferencesOpen).toBe(true);
  });
});
