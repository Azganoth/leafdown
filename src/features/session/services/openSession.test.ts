import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { describe, expect, it, vi } from "vitest";

import type { OpenedMarkdownDocument } from "@/features/document";
import type { FolderContextState } from "@/features/folder-context";
import { useRecentItemsStore } from "@/features/preferences";
import { useSessionStore } from "@/features/session";
import {
  createOpenedMarkdownDocument,
  createSavedDocument,
  createUntitledDocument,
} from "@/test/factories/document";
import { createEmptyFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { setDefaultSession } from "@/test/utils/appStores";
import { mockTauriApi, mockTauriApiCommand, tauriApiCommand } from "@/test/utils/tauriApi";

import { openFolderContextAtPath, openMarkdownFileAtPath } from "./openSession";

const OTHER_MARKDOWN_PATH = "C:/Notes/other.md";
const OTHER_FOLDER_PATH = "C:/Other";
const LATEST_MARKDOWN_PATH = "C:/Notes/latest.md";
const LATEST_FOLDER_PATH = "C:/Latest";
const NEXT_UNTITLED_DOCUMENT_ID = "untitled:next";

const emptyNotesFolderContext = createEmptyFolderContext();

const openedOtherMarkdownFile = createOpenedMarkdownDocument({
  path: OTHER_MARKDOWN_PATH,
  content: "# Other",
});

const openedLatestMarkdownFile = createOpenedMarkdownDocument({
  path: LATEST_MARKDOWN_PATH,
  content: "# Latest",
});

const createNextUntitledDocument = () =>
  createUntitledDocument({
    id: NEXT_UNTITLED_DOCUMENT_ID,
    content: "Next",
  });

interface OpenFolderContextCommandResult {
  folder: FolderContextState;
  indexDocument: null;
}

describe("open session workflows", () => {
  it("opens Markdown files into the active session and records recent items", async () => {
    mockTauriApi({
      openMarkdownFile: () => openedOtherMarkdownFile,
      scanMarkdownFolder: () => emptyNotesFolderContext,
    });

    await expect(openMarkdownFileAtPath(OTHER_MARKDOWN_PATH)).resolves.toBe(true);

    expect(confirm).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: TEST_NOTES_FOLDER_PATH },
      activeDocument: createSavedDocument({
        path: OTHER_MARKDOWN_PATH,
        content: "# Other",
      }),
    });
    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [OTHER_MARKDOWN_PATH],
      recentFolders: [TEST_NOTES_FOLDER_PATH],
    });
  });

  it("opens folders without an index document as folder-only sessions", async () => {
    mockTauriApiCommand("openMarkdownFolder", () => ({
      folder: emptyNotesFolderContext,
      indexDocument: null,
    }));

    await expect(openFolderContextAtPath(TEST_NOTES_FOLDER_PATH)).resolves.toBe(true);

    expect(confirm).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: TEST_NOTES_FOLDER_PATH },
      activeDocument: null,
    });
    expect(useRecentItemsStore.getState().recentFolders).toEqual([TEST_NOTES_FOLDER_PATH]);
  });

  it("cancels open-file transitions before reading a new target", async () => {
    setDefaultSession({
      activeDocument: createSavedDocument({
        content: "# Local",
        isDirty: true,
      }),
    });

    await expect(openMarkdownFileAtPath(OTHER_MARKDOWN_PATH)).resolves.toBe(false);

    expect(invoke).not.toHaveBeenCalled();
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
      path: TEST_MARKDOWN_FILE_PATH,
      content: "# Local",
      isDirty: true,
    });
  });

  it("cancels open-folder transitions before scanning a new folder", async () => {
    setDefaultSession({
      activeDocument: createUntitledDocument({ isDirty: true }),
    });

    await expect(openFolderContextAtPath(OTHER_FOLDER_PATH)).resolves.toBe(false);

    expect(invoke).not.toHaveBeenCalled();
    expect(useSessionStore.getState().activeDocument).toMatchObject(
      createUntitledDocument({ isDirty: true }),
    );
  });

  it("does not apply opened file results after the active document changes", async () => {
    const openFileDeferred = Promise.withResolvers<OpenedMarkdownDocument>();
    setDefaultSession({
      activeDocument: createSavedDocument({
        content: "# Readme",
      }),
    });
    mockTauriApi({
      openMarkdownFile: () => openFileDeferred.promise,
      scanMarkdownFolder: () => emptyNotesFolderContext,
    });

    const openPromise = openMarkdownFileAtPath(OTHER_MARKDOWN_PATH);

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(tauriApiCommand("openMarkdownFile"), expect.any(Object));
    });

    useSessionStore.getState().setActiveDocument(createNextUntitledDocument());
    openFileDeferred.resolve(openedOtherMarkdownFile);

    await expect(openPromise).resolves.toBe(false);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "untitled",
      id: NEXT_UNTITLED_DOCUMENT_ID,
      content: "Next",
    });
  });

  it("does not apply superseded opened file results", async () => {
    const supersededOpenFile = Promise.withResolvers<OpenedMarkdownDocument>();
    const latestOpenFile = Promise.withResolvers<OpenedMarkdownDocument>();
    setDefaultSession({
      activeDocument: createSavedDocument({
        content: "# Readme",
      }),
    });
    mockTauriApi({
      openMarkdownFile: (args) =>
        (args as { path: string }).path === OTHER_MARKDOWN_PATH
          ? supersededOpenFile.promise
          : latestOpenFile.promise,
      scanMarkdownFolder: () => emptyNotesFolderContext,
    });

    const supersededOpenPromise = openMarkdownFileAtPath(OTHER_MARKDOWN_PATH);

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(tauriApiCommand("openMarkdownFile"), {
        path: OTHER_MARKDOWN_PATH,
      });
    });

    const latestOpenPromise = openMarkdownFileAtPath(LATEST_MARKDOWN_PATH);

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(tauriApiCommand("openMarkdownFile"), {
        path: LATEST_MARKDOWN_PATH,
      });
    });

    supersededOpenFile.resolve(openedOtherMarkdownFile);

    await expect(supersededOpenPromise).resolves.toBe(false);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
      path: TEST_MARKDOWN_FILE_PATH,
      content: "# Readme",
    });

    latestOpenFile.resolve(openedLatestMarkdownFile);

    await expect(latestOpenPromise).resolves.toBe(true);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
      path: LATEST_MARKDOWN_PATH,
      content: "# Latest",
    });
  });

  it("does not apply opened folder results after the active document changes", async () => {
    const openedOtherFolder: OpenFolderContextCommandResult = {
      folder: createEmptyFolderContext({ path: OTHER_FOLDER_PATH }),
      indexDocument: null,
    };
    const openFolderDeferred = Promise.withResolvers<OpenFolderContextCommandResult>();
    setDefaultSession({
      activeDocument: createSavedDocument({
        content: "# Readme",
      }),
    });
    mockTauriApi({
      openMarkdownFolder: () => openFolderDeferred.promise,
    });

    const openPromise = openFolderContextAtPath(OTHER_FOLDER_PATH);

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        tauriApiCommand("openMarkdownFolder"),
        expect.any(Object),
      );
    });

    useSessionStore.getState().setActiveDocument(createNextUntitledDocument());
    openFolderDeferred.resolve(openedOtherFolder);

    await expect(openPromise).resolves.toBe(false);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "untitled",
      id: NEXT_UNTITLED_DOCUMENT_ID,
      content: "Next",
    });
  });

  it("does not apply superseded opened folder results", async () => {
    const supersededOpenFolder = Promise.withResolvers<OpenFolderContextCommandResult>();
    const latestOpenFolder = Promise.withResolvers<OpenFolderContextCommandResult>();
    const latestFolderContext = createEmptyFolderContext({ path: LATEST_FOLDER_PATH });
    setDefaultSession({
      activeDocument: createSavedDocument({
        content: "# Readme",
      }),
    });
    mockTauriApi({
      openMarkdownFolder: (args) =>
        (args as { path: string }).path === OTHER_FOLDER_PATH
          ? supersededOpenFolder.promise
          : latestOpenFolder.promise,
    });

    const supersededOpenPromise = openFolderContextAtPath(OTHER_FOLDER_PATH);

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(tauriApiCommand("openMarkdownFolder"), {
        path: OTHER_FOLDER_PATH,
        ignoredDirectories: expect.any(Array),
        indexFileNames: expect.any(Array),
        sortOrder: expect.any(String),
      });
    });

    const latestOpenPromise = openFolderContextAtPath(LATEST_FOLDER_PATH);

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(tauriApiCommand("openMarkdownFolder"), {
        path: LATEST_FOLDER_PATH,
        ignoredDirectories: expect.any(Array),
        indexFileNames: expect.any(Array),
        sortOrder: expect.any(String),
      });
    });

    supersededOpenFolder.resolve({
      folder: createEmptyFolderContext({ path: OTHER_FOLDER_PATH }),
      indexDocument: null,
    });

    await expect(supersededOpenPromise).resolves.toBe(false);
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      activeDocument: { status: "saved", path: TEST_MARKDOWN_FILE_PATH },
    });

    latestOpenFolder.resolve({ folder: latestFolderContext, indexDocument: null });

    await expect(latestOpenPromise).resolves.toBe(true);
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: LATEST_FOLDER_PATH },
      activeDocument: null,
    });
  });
});
