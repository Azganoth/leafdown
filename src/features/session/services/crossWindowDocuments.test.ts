import { afterEach, describe, expect, it } from "vitest";

import { useArticleNavigatorStore } from "@/features/folder-context";
import { useRecentItemsStore } from "@/features/preferences";
import { toastManager } from "@/lib/toast";
import { createSavedDocument } from "@/test/factories/document";
import { createFolderContext } from "@/test/factories/folderContext";
import {
  TEST_MARKDOWN_FILE_PATH,
  TEST_NESTED_DIRECTORY_PATH,
  TEST_NESTED_MARKDOWN_FILE_PATH,
  TEST_NOTES_FOLDER_PATH,
} from "@/test/fixtures/paths";
import { setDefaultRecentItems, setDefaultSession } from "@/test/utils/appStores";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { useSessionStore } from "../stores/session";
import {
  checkDocumentsRemovedElsewhere,
  followDocumentsMovedElsewhere,
  showDocumentOpenedElsewhere,
} from "./crossWindowDocuments";
import { documentEditorBridge } from "./documentEditorBridge";

const RENAMED_DIRECTORY_PATH = `${TEST_NOTES_FOLDER_PATH}/guides`;

describe("documents another window changed", () => {
  afterEach(() => {
    documentEditorBridge.clear();
  });

  it("shows the tab another window asked to open, giving it focus", () => {
    setDefaultSession({
      documents: [
        createSavedDocument(),
        createSavedDocument({ path: TEST_NESTED_MARKDOWN_FILE_PATH }),
      ],
      activeIndex: 1,
    });

    expect(showDocumentOpenedElsewhere("c:\\notes\\README.md")).toBe(true);

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      path: TEST_MARKDOWN_FILE_PATH,
    });
    expect(showDocumentOpenedElsewhere(`${TEST_NOTES_FOLDER_PATH}/closed.md`)).toBe(false);
  });

  it("moves the tabs under a path another window renamed, keeping their unsaved text", async () => {
    const nestedPath = `${TEST_NESTED_DIRECTORY_PATH}/notes.md`;
    setDefaultSession({
      documents: [
        createSavedDocument({ path: TEST_NESTED_MARKDOWN_FILE_PATH, isDirty: true }),
        createSavedDocument(),
        createSavedDocument({ path: nestedPath }),
      ],
      activeIndex: 1,
      folderContext: createFolderContext(),
    });
    setDefaultRecentItems({
      recentFiles: [{ openedAt: 1, path: TEST_NESTED_MARKDOWN_FILE_PATH }],
    });
    useArticleNavigatorStore.getState().expandDirectories([TEST_NESTED_DIRECTORY_PATH]);
    documentEditorBridge.set(TEST_NESTED_MARKDOWN_FILE_PATH, { getMarkdown: () => "# Unsaved" });

    await followDocumentsMovedElsewhere(TEST_NESTED_DIRECTORY_PATH, RENAMED_DIRECTORY_PATH);

    expect(useSessionStore.getState().tabs.map(({ document }) => document)).toMatchObject([
      { path: `${RENAMED_DIRECTORY_PATH}/readme.md`, content: "# Unsaved", isDirty: true },
      { path: TEST_MARKDOWN_FILE_PATH },
      { path: `${RENAMED_DIRECTORY_PATH}/notes.md` },
    ]);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      path: TEST_MARKDOWN_FILE_PATH,
    });
    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual([
      RENAMED_DIRECTORY_PATH,
    ]);
    // Recent items are shared, so the window that renamed has already moved them.
    expect(useRecentItemsStore.getState().recentFiles).toEqual([
      { openedAt: 1, path: TEST_NESTED_MARKDOWN_FILE_PATH },
    ]);
  });

  it("shows the file missing in tabs under a path another window deleted, keeping their text", async () => {
    const dirtyDocument = createSavedDocument({
      path: TEST_NESTED_MARKDOWN_FILE_PATH,
      content: "# Kept",
      isDirty: true,
    });
    setDefaultSession({ documents: [dirtyDocument, createSavedDocument()] });
    mockTauriApi({ inspectMarkdownFile: () => ({ kind: "missing" }) });

    await checkDocumentsRemovedElsewhere(TEST_NESTED_DIRECTORY_PATH);

    expect(countTauriApiCalls("inspectMarkdownFile")).toBe(1);
    expect(getLastTauriApiArgs("inspectMarkdownFile")).toMatchObject({
      path: TEST_NESTED_MARKDOWN_FILE_PATH,
    });
    expect(useSessionStore.getState().tabs.map(({ document }) => document)).toMatchObject([
      { ...dirtyDocument, externalChange: { kind: "missing" } },
      { path: TEST_MARKDOWN_FILE_PATH, externalChange: null },
    ]);
    expect(toastManager.add).not.toHaveBeenCalled();
  });
});
