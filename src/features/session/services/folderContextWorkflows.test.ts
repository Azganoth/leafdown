import { confirm } from "@tauri-apps/plugin-dialog";
import { describe, expect, it, vi } from "vitest";

import { useSettingsStore } from "@/features/preferences";
import { createSavedDocument } from "@/test/factories/document";
import {
  createArticleTree,
  createEmptyFolderContext,
  createFolderContext,
} from "@/test/factories/folderContext";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { countTauriApiCalls, mockTauriApiCommand } from "@/test/utils/tauriApi";

import { useSessionStore } from "../stores/session";
import { changeArticleSortOrder, closeFolderContext } from "./folderContextWorkflows";

const notesFolderContext = createEmptyFolderContext();

describe("folder context workflows", () => {
  it("closes folder-only sessions back to the welcome state", async () => {
    setDefaultSession({ folderContext: notesFolderContext });

    await expect(closeFolderContext()).resolves.toBe(true);

    expect(confirm).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      activeDocument: null,
      folderContext: null,
    });
  });

  it("keeps folder contexts open when dirty document discard is declined", async () => {
    setDefaultSession({
      activeDocument: createSavedDocument({ isDirty: true }),
      folderContext: notesFolderContext,
    });

    await expect(closeFolderContext()).resolves.toBe(false);

    expect(confirm).toHaveBeenCalledOnce();
    expect(useSessionStore.getState()).toMatchObject({
      activeDocument: {
        isDirty: true,
      },
      folderContext: {
        path: notesFolderContext.path,
      },
    });
  });

  it("does not close anything without an active folder context", async () => {
    setDefaultSession({ activeDocument: createSavedDocument() });

    await expect(closeFolderContext()).resolves.toBe(false);

    expect(confirm).not.toHaveBeenCalled();
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
    });
  });

  it("does not roll back article sort order after a newer pending change", async () => {
    const scanDeferred = Promise.withResolvers<never>();
    setDefaultSettings({ articleSortOrder: "name" });
    setDefaultSession({ folderContext: notesFolderContext });
    mockTauriApiCommand("scanMarkdownFolder", () => scanDeferred.promise);

    const changePromise = changeArticleSortOrder("type");

    await vi.waitFor(() => {
      expect(countTauriApiCalls("scanMarkdownFolder")).toBe(1);
      expect(useSettingsStore.getState().articleSortOrder).toBe("type");
    });

    useSettingsStore.getState().updateSetting("articleSortOrder", "modifiedDate");
    scanDeferred.reject(new Error("scan failed"));

    await expect(changePromise).rejects.toThrow("scan failed");
    expect(useSettingsStore.getState().articleSortOrder).toBe("modifiedDate");
  });

  it("applies sorted folder scans when the active folder path has the same identity", async () => {
    const scanDeferred = Promise.withResolvers<typeof notesFolderContext>();
    const sortedFolderContext = createFolderContext({
      tree: createArticleTree({
        children: [{ kind: "file", name: "guide.md", path: "C:/Notes/guide.md" }],
      }),
    });
    setDefaultSettings({ articleSortOrder: "name" });
    setDefaultSession({ folderContext: notesFolderContext });
    mockTauriApiCommand("scanMarkdownFolder", () => scanDeferred.promise);

    const changePromise = changeArticleSortOrder("type");

    await vi.waitFor(() => {
      expect(countTauriApiCalls("scanMarkdownFolder")).toBe(1);
    });

    setDefaultSession({
      folderContext: createEmptyFolderContext({
        path: "c:\\notes\\",
      }),
    });
    scanDeferred.resolve(sortedFolderContext);

    await expect(changePromise).resolves.toBe(true);
    expect(useSessionStore.getState().folderContext).toMatchObject({
      tree: sortedFolderContext.tree,
    });
  });
});
