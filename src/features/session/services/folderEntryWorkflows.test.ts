import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useArticleNavigatorStore } from "@/features/folder-context";
import { useRecentItemsStore } from "@/features/preferences";
import { requestConfirmation } from "@/lib/confirmation";
import { createOpenedMarkdownDocument, createSavedDocument } from "@/test/factories/document";
import { createFolderContext } from "@/test/factories/folderContext";
import {
  TEST_MARKDOWN_FILE_PATH,
  TEST_NESTED_DIRECTORY_PATH,
  TEST_NESTED_MARKDOWN_FILE_PATH,
  TEST_NOTES_FOLDER_PATH,
} from "@/test/fixtures/paths";
import {
  setDefaultRecentItems,
  setDefaultSession,
  setDefaultSettings,
} from "@/test/utils/appStores";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import {
  createArticleInFolder,
  createDirectoryInFolder,
  deleteFolderEntry,
  renameFolderEntry,
} from "./folderEntryWorkflows";

vi.mock("@/lib/confirmation", () => ({ requestConfirmation: vi.fn(async () => false) }));

const CREATED_ARTICLE_PATH = `${TEST_NOTES_FOLDER_PATH}/plan.md`;
const RENAMED_DIRECTORY_PATH = `${TEST_NOTES_FOLDER_PATH}/guides`;

const folderContext = createFolderContext();

const mockFolderEntryCommands = (handlers: Parameters<typeof mockTauriApi>[0] = {}) => {
  mockTauriApi({ scanMarkdownFolder: () => folderContext, ...handlers });
};

const attachEditorMarkdown = (documentKey: string, markdown: string) => {
  documentEditorBridge.set(documentKey, { getMarkdown: () => markdown });
};

describe("folder entry workflows", () => {
  beforeEach(() => {
    vi.mocked(requestConfirmation).mockReset().mockResolvedValue(false);
    setDefaultSettings({ defaultNewDocumentExtension: ".markdown" });
    mockFolderEntryCommands();
  });

  afterEach(() => {
    documentEditorBridge.clear();
  });

  it("leaves no new file behind when discarding the active document is declined", async () => {
    setDefaultSession({
      activeDocument: createSavedDocument({ isDirty: true }),
      folderContext,
    });

    await expect(createArticleInFolder(TEST_NOTES_FOLDER_PATH, "plan")).resolves.toBeNull();

    expect(requestConfirmation).toHaveBeenCalledOnce();
    expect(countTauriApiCalls("createMarkdownArticle")).toBe(0);
    expect(useSessionStore.getState().activeDocument).toMatchObject({ isDirty: true });
  });

  it("creates an article with the default extension and opens it after one discard prompt", async () => {
    vi.mocked(requestConfirmation).mockResolvedValue(true);
    setDefaultSession({
      activeDocument: createSavedDocument({ isDirty: true }),
      folderContext,
    });
    mockFolderEntryCommands({
      createMarkdownArticle: () => ({ path: CREATED_ARTICLE_PATH }),
      openMarkdownFile: () =>
        createOpenedMarkdownDocument({ path: CREATED_ARTICLE_PATH, content: "" }),
    });

    await expect(createArticleInFolder(TEST_NOTES_FOLDER_PATH, "plan")).resolves.toBe(
      CREATED_ARTICLE_PATH,
    );

    expect(requestConfirmation).toHaveBeenCalledOnce();
    expect(getLastTauriApiArgs("createMarkdownArticle")).toEqual({
      defaultExtension: ".markdown",
      folderPath: TEST_NOTES_FOLDER_PATH,
      name: "plan",
      parentPath: TEST_NOTES_FOLDER_PATH,
    });
    expect(countTauriApiCalls("scanMarkdownFolder")).toBe(1);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: false,
      path: CREATED_ARTICLE_PATH,
    });
  });

  it("creates a folder without changing the active document", async () => {
    const activeDocument = createSavedDocument({ isDirty: true });
    setDefaultSession({ activeDocument, folderContext });
    mockFolderEntryCommands({ createArticleDirectory: () => ({ path: RENAMED_DIRECTORY_PATH }) });

    await expect(createDirectoryInFolder(TEST_NOTES_FOLDER_PATH, "guides")).resolves.toBe(
      RENAMED_DIRECTORY_PATH,
    );

    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(countTauriApiCalls("scanMarkdownFolder")).toBe(1);
    expect(useSessionStore.getState().activeDocument).toEqual(activeDocument);
  });

  it("moves the active document, its recent entry, and its editor content on rename", async () => {
    const renamedPath = `${TEST_NOTES_FOLDER_PATH}/intro.md`;
    const activeDocument = createSavedDocument({ content: "# Old", isDirty: true });
    setDefaultSession({ activeDocument, folderContext });
    setDefaultRecentItems({
      recentFiles: [{ openedAt: 1, path: TEST_MARKDOWN_FILE_PATH }],
    });
    attachEditorMarkdown(TEST_MARKDOWN_FILE_PATH, "# Latest edit");
    mockFolderEntryCommands({ renameFolderEntry: () => ({ path: renamedPath }) });

    await expect(renameFolderEntry(TEST_MARKDOWN_FILE_PATH, "intro")).resolves.toBe(renamedPath);

    expect(useSessionStore.getState().activeDocument).toEqual({
      ...activeDocument,
      content: "# Latest edit",
      path: renamedPath,
    });
    expect(useRecentItemsStore.getState().recentFiles).toEqual([
      { openedAt: 1, path: renamedPath },
    ]);
    expect(countTauriApiCalls("scanMarkdownFolder")).toBe(1);
  });

  it("moves an active document and expanded folders inside a renamed directory", async () => {
    setDefaultSession({
      activeDocument: createSavedDocument({ path: TEST_NESTED_MARKDOWN_FILE_PATH }),
      folderContext,
    });
    setDefaultRecentItems({ recentFolders: [{ openedAt: 1, path: TEST_NESTED_DIRECTORY_PATH }] });
    useArticleNavigatorStore.getState().expandDirectories([TEST_NESTED_DIRECTORY_PATH]);
    mockFolderEntryCommands({ renameFolderEntry: () => ({ path: RENAMED_DIRECTORY_PATH }) });

    await renameFolderEntry(TEST_NESTED_DIRECTORY_PATH, "guides");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      path: `${RENAMED_DIRECTORY_PATH}/readme.md`,
    });
    expect(useRecentItemsStore.getState().recentFolders).toEqual([
      { openedAt: 1, path: RENAMED_DIRECTORY_PATH },
    ]);
    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual([
      RENAMED_DIRECTORY_PATH,
    ]);
  });

  it("leaves the session unchanged when a rename is refused", async () => {
    const activeDocument = createSavedDocument();
    setDefaultSession({ activeDocument, folderContext });
    const collision = { kind: "alreadyExists", path: `${TEST_NOTES_FOLDER_PATH}/taken.md` };
    mockFolderEntryCommands({ renameFolderEntry: () => Promise.reject(collision) });

    await expect(renameFolderEntry(TEST_MARKDOWN_FILE_PATH, "taken")).rejects.toBe(collision);

    expect(useSessionStore.getState().activeDocument).toEqual(activeDocument);
    expect(countTauriApiCalls("scanMarkdownFolder")).toBe(0);
  });

  it("does not trash anything when deletion is declined", async () => {
    setDefaultSession({ folderContext });

    await expect(deleteFolderEntry(TEST_MARKDOWN_FILE_PATH, "file")).resolves.toBe(false);

    expect(countTauriApiCalls("trashFolderEntry")).toBe(0);
  });

  it("keeps a dirty active document when discarding it is declined", async () => {
    vi.mocked(requestConfirmation).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const activeDocument = createSavedDocument({
      path: TEST_NESTED_MARKDOWN_FILE_PATH,
      isDirty: true,
    });
    setDefaultSession({ activeDocument, folderContext });

    await expect(deleteFolderEntry(TEST_NESTED_DIRECTORY_PATH, "directory")).resolves.toBe(false);

    expect(requestConfirmation).toHaveBeenCalledTimes(2);
    expect(countTauriApiCalls("trashFolderEntry")).toBe(0);
    expect(useSessionStore.getState().activeDocument).toEqual(activeDocument);
  });

  it("closes the active document after trashing the directory holding it", async () => {
    vi.mocked(requestConfirmation).mockResolvedValue(true);
    setDefaultSession({
      activeDocument: createSavedDocument({ path: TEST_NESTED_MARKDOWN_FILE_PATH, isDirty: true }),
      folderContext,
    });
    mockFolderEntryCommands({ trashFolderEntry: () => undefined });

    await expect(deleteFolderEntry(TEST_NESTED_DIRECTORY_PATH, "directory")).resolves.toBe(true);

    expect(getLastTauriApiArgs("trashFolderEntry")).toEqual({
      folderPath: TEST_NOTES_FOLDER_PATH,
      path: TEST_NESTED_DIRECTORY_PATH,
    });
    expect(useSessionStore.getState().activeDocument).toBeNull();
    expect(countTauriApiCalls("scanMarkdownFolder")).toBe(1);
  });

  it("keeps an unrelated active document open after trashing another file", async () => {
    vi.mocked(requestConfirmation).mockResolvedValue(true);
    const activeDocument = createSavedDocument({ isDirty: true });
    setDefaultSession({ activeDocument, folderContext });
    mockFolderEntryCommands({ trashFolderEntry: () => undefined });

    await expect(deleteFolderEntry(TEST_NESTED_MARKDOWN_FILE_PATH, "file")).resolves.toBe(true);

    expect(requestConfirmation).toHaveBeenCalledOnce();
    expect(useSessionStore.getState().activeDocument).toEqual(activeDocument);
  });
});
