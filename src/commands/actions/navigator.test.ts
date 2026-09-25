import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";

import { toastManager } from "@/lib/toast";
import { createFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { setupClipboardMock } from "@/test/mocks/clipboard";
import { setDefaultSession } from "@/test/utils/appStores";
import { mockTauriApi } from "@/test/utils/tauriApi";

import {
  ARTICLE_NAVIGATOR_ENTRY_ACTIONS,
  copyNavigatorPath,
  createNavigatorEntry,
  renameNavigatorEntry,
} from "./navigator";

const { clipboard } = setupClipboardMock();
const folderContext = createFolderContext();

describe("navigator actions", () => {
  it("reports a created folder as applied", async () => {
    setDefaultSession({ folderContext });
    mockTauriApi({
      createArticleDirectory: () => ({ path: `${TEST_NOTES_FOLDER_PATH}/guides` }),
      scanMarkdownFolder: () => folderContext,
    });

    await expect(
      createNavigatorEntry(TEST_NOTES_FOLDER_PATH, "directory", "guides"),
    ).resolves.toEqual({ outcome: "applied", path: `${TEST_NOTES_FOLDER_PATH}/guides` });
  });

  it("reports a refused rename with the folder entry message", async () => {
    setDefaultSession({ folderContext });
    mockTauriApi({
      renameFolderEntry: () =>
        Promise.reject({ kind: "alreadyExists", path: `${TEST_NOTES_FOLDER_PATH}/taken.md` }),
    });

    await expect(renameNavigatorEntry(TEST_MARKDOWN_FILE_PATH, "taken")).resolves.toEqual({
      outcome: "failed",
    });
    expect(toastManager.add).toHaveBeenCalledWith({
      description: `${TEST_NOTES_FOLDER_PATH}/taken.md`,
      title: "An item with that name already exists.",
      type: "error",
    });
  });

  it("copies the given path to the clipboard", async () => {
    await copyNavigatorPath(TEST_MARKDOWN_FILE_PATH);

    expect(clipboard.writeText).toHaveBeenCalledWith(TEST_MARKDOWN_FILE_PATH);
    expect(toastManager.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Path copied.", type: "success" }),
    );
  });

  it("reports clipboard failures", async () => {
    clipboard.writeText.mockRejectedValueOnce(new Error("Clipboard write denied."));

    await copyNavigatorPath(TEST_MARKDOWN_FILE_PATH);

    expect(toastManager.add).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Clipboard write denied.",
        title: "Could not copy path.",
        type: "error",
      }),
    );
  });

  it("reveals the invoked entry through the system file manager", async () => {
    ARTICLE_NAVIGATOR_ENTRY_ACTIONS.revealEntry(TEST_NOTES_FOLDER_PATH);

    await vi.waitFor(() => expect(revealItemInDir).toHaveBeenCalledWith(TEST_NOTES_FOLDER_PATH));
  });
});
