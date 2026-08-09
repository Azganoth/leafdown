import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";

import { useArticleNavigatorStore } from "@/features/folder-context";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import { toastManager } from "@/lib/toast";
import { createAppCommandContext } from "@/test/factories/commands";
import { createSavedDocument } from "@/test/factories/document";
import { createFolderContextWithNestedReadme } from "@/test/factories/folderContext";
import {
  TEST_MARKDOWN_FILE_PATH,
  TEST_NESTED_DIRECTORY_PATH,
  TEST_NESTED_MARKDOWN_FILE_PATH,
} from "@/test/fixtures/paths";
import { setDefaultRecentItems, setDefaultSettings } from "@/test/utils/appStores";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import { useCommandUIStore } from "../stores/commandUi";
import {
  clearRecentItems,
  openFile,
  openLocation,
  openPreferences,
  openRecentMarkdownFile,
  revealInSidebar,
} from "./file";

const OVERSIZED_MARKDOWN_FILE_PATH = "C:/Notes/large-document.md";
const OVERSIZED_MARKDOWN_FILE_ERROR = {
  kind: "oversizedFile",
  path: OVERSIZED_MARKDOWN_FILE_PATH,
  sizeBytes: 5 * 1024 * 1024 + 1024,
  maxSizeBytes: 5 * 1024 * 1024,
} as const;

const expectOversizedMarkdownFileToast = () => {
  expect(toastManager.add).toHaveBeenCalledWith({
    description: "5.0 MB selected. Files larger than 5 MB do not load.",
    title: "Markdown file is too large.",
    type: "error",
  });
};

describe("file actions", () => {
  it("clears recent items", () => {
    setDefaultRecentItems({ recentFiles: [TEST_MARKDOWN_FILE_PATH] });
    clearRecentItems();
    expect(useRecentItemsStore.getState().recentFiles).toEqual([]);
  });

  it("reports oversized files selected through File > Open", async () => {
    vi.mocked(open).mockResolvedValueOnce(OVERSIZED_MARKDOWN_FILE_PATH);
    mockTauriApiCommand("openMarkdownFile", () => Promise.reject(OVERSIZED_MARKDOWN_FILE_ERROR));

    await openFile();

    expectOversizedMarkdownFileToast();
    expect(useRecentItemsStore.getState().recentFiles).not.toContain(OVERSIZED_MARKDOWN_FILE_PATH);
  });

  it("reports oversized recent files", async () => {
    mockTauriApiCommand("openMarkdownFile", () => Promise.reject(OVERSIZED_MARKDOWN_FILE_ERROR));

    await openRecentMarkdownFile(OVERSIZED_MARKDOWN_FILE_PATH);

    expectOversizedMarkdownFileToast();
    expect(useRecentItemsStore.getState().recentFiles).not.toContain(OVERSIZED_MARKDOWN_FILE_PATH);
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
    void openLocation(createAppCommandContext());
    expect(revealItemInDir).not.toHaveBeenCalled();

    void openLocation(createAppCommandContext({ activeDocument: createSavedDocument() }));

    await vi.waitFor(() => {
      expect(revealItemInDir).toHaveBeenCalledWith(TEST_MARKDOWN_FILE_PATH);
    });
  });

  it("shows a command error when opening the active file location fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(revealItemInDir).mockRejectedValueOnce(new Error("missing folder"));

    void openLocation(createAppCommandContext({ activeDocument: createSavedDocument() }));

    await vi.waitFor(() => {
      expect(toastManager.add).toHaveBeenCalledWith({
        description: "missing folder",
        title: "Could not open file location.",
        type: "error",
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
