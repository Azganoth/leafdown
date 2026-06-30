import { describe, expect, it, vi } from "vitest";

import { useSettingsStore } from "@/features/preferences";
import {
  createArticleTree,
  createEmptyFolderContext,
  createFolderContext,
} from "@/test/factories/folderContext";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { countTauriApiCalls, mockTauriApiCommand } from "@/test/utils/tauriApi";

import { useSessionStore } from "../stores/session";
import { changeArticleSortOrder } from "./folderContextWorkflows";

const notesFolderContext = createEmptyFolderContext();

describe("folder context workflows", () => {
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
