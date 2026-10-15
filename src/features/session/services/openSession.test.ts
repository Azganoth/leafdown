import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { ENCODING_CHOICES, type OpenedMarkdownDocument } from "@/features/document";
import type { FolderContextState } from "@/features/folder-context";
import { useRecentItemsStore } from "@/features/preferences";
import { getActiveTab, useSessionStore } from "@/features/session";
import { requestConfirmation } from "@/lib/confirmation";
import { t } from "@/lib/i18n";
import { toastManager } from "@/lib/toast";
import {
  createOpenedMarkdownDocument,
  createSavedDocument,
  createUntitledDocument,
} from "@/test/factories/document";
import { createEmptyFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { setDefaultSession } from "@/test/utils/appStores";
import {
  countTauriApiCalls,
  getLastTauriApiArgs,
  mockTauriApi,
  mockTauriApiCommand,
  tauriApiCommand,
} from "@/test/utils/tauriApi";

import {
  notifyOpenMarkdownFileError,
  openFolderContextAtPath,
  openLaunchDocuments,
  openMarkdownFileAtPath,
  reopenMarkdownFileWithChosenEncoding,
} from "./openSession";
import { WindowDocumentsSync } from "./windowDocumentClaims";

vi.mock("@/lib/confirmation", () => ({ requestConfirmation: vi.fn(async () => false) }));

const OTHER_MARKDOWN_PATH = "C:/Notes/other.md";
const OTHER_FOLDER_PATH = "C:/Other";
const LATEST_MARKDOWN_PATH = "C:/Notes/latest.md";
const LATEST_FOLDER_PATH = "C:/Latest";

const emptyNotesFolderContext = createEmptyFolderContext();

const openedOtherMarkdownFile = createOpenedMarkdownDocument({
  path: OTHER_MARKDOWN_PATH,
  content: "# Other",
});

const openedLatestMarkdownFile = createOpenedMarkdownDocument({
  path: LATEST_MARKDOWN_PATH,
  content: "# Latest",
});

interface OpenFolderContextCommandResult {
  folder: FolderContextState;
  indexDocument: null;
  indexError: null | { kind: "missingFile"; path: string };
}

describe("reopen with a chosen encoding", () => {
  const openedLatinFile = createOpenedMarkdownDocument({
    content: "# Café",
    encoding: { name: "windows-1252", bom: false },
  });

  it("confirms discarding changes, then reopens the active file and reloads the editor", async () => {
    setDefaultSession({
      folderContext: emptyNotesFolderContext,
      activeDocument: createSavedDocument({ content: "# CafÃ©", isDirty: true }),
    });
    mockTauriApi({ openMarkdownFile: () => openedLatinFile });
    vi.mocked(requestConfirmation).mockResolvedValueOnce(true);

    await expect(
      reopenMarkdownFileWithChosenEncoding(TEST_MARKDOWN_FILE_PATH, "windows-1252"),
    ).resolves.toBe(true);

    expect(requestConfirmation).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith(tauriApiCommand("openMarkdownFile"), {
      path: TEST_MARKDOWN_FILE_PATH,
      encoding: "windows-1252",
    });
    expect(getActiveTab(useSessionStore.getState())?.loadId).toBe(1);
    expect(useSessionStore.getState()).toMatchObject({
      activeDocument: {
        content: "# Café",
        isDirty: false,
        encoding: { name: "windows-1252", bom: false },
        fileEncoding: { name: "windows-1252", bom: false },
      },
    });
    expect(toastManager.add).toHaveBeenCalledWith({
      description: undefined,
      title: "Document opened.",
      type: "success",
    });
  });

  it("keeps the dirty document when discarding its changes is declined", async () => {
    const activeDocument = createSavedDocument({ content: "# Edited", isDirty: true });
    setDefaultSession({ folderContext: emptyNotesFolderContext, activeDocument });
    mockTauriApi({ openMarkdownFile: () => openedLatinFile });

    await expect(
      reopenMarkdownFileWithChosenEncoding(TEST_MARKDOWN_FILE_PATH, "windows-1252"),
    ).resolves.toBe(false);

    expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
    expect(useSessionStore.getState().activeDocument).toEqual(activeDocument);
  });

  it("does not reload the editor when a reopen yields the text it already holds", async () => {
    setDefaultSession({
      folderContext: emptyNotesFolderContext,
      activeDocument: createSavedDocument({ content: "# Plain" }),
    });
    mockTauriApi({
      openMarkdownFile: () =>
        createOpenedMarkdownDocument({
          content: "# Plain",
          encoding: { name: "windows-1252", bom: false },
        }),
    });

    await expect(
      reopenMarkdownFileWithChosenEncoding(TEST_MARKDOWN_FILE_PATH, "windows-1252"),
    ).resolves.toBe(true);

    expect(getActiveTab(useSessionStore.getState())?.loadId).toBe(0);
    expect(useSessionStore.getState()).toMatchObject({
      activeDocument: { encoding: { name: "windows-1252", bom: false } },
    });
  });

  it("reloads the editor of a discarded edit whose session text still matches the file", async () => {
    setDefaultSession({
      folderContext: emptyNotesFolderContext,
      activeDocument: createSavedDocument({ content: "# Plain", isDirty: true }),
    });
    mockTauriApi({
      openMarkdownFile: () =>
        createOpenedMarkdownDocument({
          content: "# Plain",
          encoding: { name: "windows-1252", bom: false },
        }),
    });
    vi.mocked(requestConfirmation).mockResolvedValueOnce(true);

    await expect(
      reopenMarkdownFileWithChosenEncoding(TEST_MARKDOWN_FILE_PATH, "windows-1252"),
    ).resolves.toBe(true);

    expect(getActiveTab(useSessionStore.getState())?.loadId).toBe(1);
    expect(useSessionStore.getState()).toMatchObject({
      activeDocument: { content: "# Plain", isDirty: false },
    });
  });

  it("offers reopening from an encoding error and shows a failed choice the same way", async () => {
    mockTauriApiCommand("openMarkdownFile", () =>
      Promise.reject({
        kind: "irreversibleEncoding",
        path: TEST_MARKDOWN_FILE_PATH,
        encoding: "Shift_JIS",
      }),
    );

    notifyOpenMarkdownFileError({ kind: "invalidEncoding", path: TEST_MARKDOWN_FILE_PATH });

    const invalidEncodingToast = vi.mocked(toastManager.add).mock.lastCall?.[0];
    const actionMenu = invalidEncodingToast?.data?.actionMenu;

    expect(invalidEncodingToast).toMatchObject({
      title: "Invalid Markdown file encoding.",
      timeout: 0,
      type: "error",
    });
    expect(actionMenu?.label).toBe("Reopen with encoding");
    expect(actionMenu?.items.map((item) => item.label)).toEqual(
      ENCODING_CHOICES.map((choice) => t(choice.labelId)),
    );

    actionMenu?.items.find((item) => item.label === "Japanese (Shift_JIS)")?.run();

    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(tauriApiCommand("openMarkdownFile"), {
        path: TEST_MARKDOWN_FILE_PATH,
        encoding: "Shift_JIS",
      }),
    );

    await vi.waitFor(() => expect(toastManager.add).toHaveBeenCalledTimes(2));
    expect(vi.mocked(toastManager.add).mock.lastCall?.[0]).toMatchObject({
      title: "Markdown file cannot be preserved in Shift_JIS.",
      data: { actionMenu: { label: "Reopen with encoding" } },
    });
  });

  it("shows other open errors without a reopen action", () => {
    notifyOpenMarkdownFileError({ kind: "missingFile", path: TEST_MARKDOWN_FILE_PATH });

    expect(toastManager.add).toHaveBeenCalledWith({
      description: TEST_MARKDOWN_FILE_PATH,
      title: "Markdown file not found.",
      type: "error",
    });
  });
});

describe("launch documents", () => {
  const LAUNCH_MARKDOWN_PATH = "C:/Users/Ana Lúcia/Notas de reunião/日本語.md";

  it("opens the launch document through the open workflow and records recent items", async () => {
    mockTauriApi({
      takeLaunchDocumentPaths: () => [LAUNCH_MARKDOWN_PATH],
      openMarkdownFile: () =>
        createOpenedMarkdownDocument({
          path: LAUNCH_MARKDOWN_PATH,
          parentFolderPath: "C:/Users/Ana Lúcia/Notas de reunião",
        }),
      scanMarkdownFolder: () =>
        createEmptyFolderContext({ path: "C:/Users/Ana Lúcia/Notas de reunião" }),
    });

    await expect(openLaunchDocuments()).resolves.toBe(true);

    expect(getLastTauriApiArgs("openMarkdownFile")).toEqual({
      path: LAUNCH_MARKDOWN_PATH,
      encoding: null,
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: "C:/Users/Ana Lúcia/Notas de reunião" },
      activeDocument: { path: LAUNCH_MARKDOWN_PATH, status: "saved" },
    });
    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [{ path: LAUNCH_MARKDOWN_PATH }],
      recentFolders: [{ path: "C:/Users/Ana Lúcia/Notas de reunião" }],
    });
  });

  it("opens nothing when no launch asked this window to open a document", async () => {
    mockTauriApi({ takeLaunchDocumentPaths: () => [] });

    await expect(openLaunchDocuments()).resolves.toBe(false);

    expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
    expect(useSessionStore.getState().activeDocument).toBeNull();
  });

  it("reports a launch document that cannot be opened like any other open failure", async () => {
    mockTauriApi({
      takeLaunchDocumentPaths: () => ["C:/Notes/readings.text"],
      openMarkdownFile: () =>
        Promise.reject({ kind: "unsupportedFileType", path: "C:/Notes/readings.text" }),
    });

    await expect(openLaunchDocuments()).resolves.toBe(false);

    expect(toastManager.add).toHaveBeenCalledWith({
      description: "Leafdown opens .md, .markdown, .mdown, and .mkd files.",
      title: "Unsupported Markdown file type.",
      type: "error",
    });
    expect(useSessionStore.getState().activeDocument).toBeNull();
    expect(useRecentItemsStore.getState().recentFiles).toEqual([]);
  });

  it("offers reopening a launch document that is not valid UTF-8", async () => {
    mockTauriApi({
      takeLaunchDocumentPaths: () => [TEST_MARKDOWN_FILE_PATH],
      openMarkdownFile: () =>
        Promise.reject({ kind: "invalidEncoding", path: TEST_MARKDOWN_FILE_PATH }),
    });

    await expect(openLaunchDocuments()).resolves.toBe(false);

    expect(toastManager.add).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { actionMenu: expect.objectContaining({ label: "Reopen with encoding" }) },
      }),
    );
  });

  it("opens each routed document as a new tab after the active one", async () => {
    const existing = createSavedDocument({ path: "C:/Notes/existing.md" });
    setDefaultSession({ folderContext: emptyNotesFolderContext, documents: [existing] });
    mockTauriApi({
      takeLaunchDocumentPaths: () => [OTHER_MARKDOWN_PATH, LATEST_MARKDOWN_PATH],
      openMarkdownFile: ({ path }) =>
        path === OTHER_MARKDOWN_PATH ? openedOtherMarkdownFile : openedLatestMarkdownFile,
    });

    await expect(openLaunchDocuments()).resolves.toBe(true);

    const { tabs } = useSessionStore.getState();
    expect(tabs.map(({ document }) => document.status === "saved" && document.path)).toEqual([
      "C:/Notes/existing.md",
      OTHER_MARKDOWN_PATH,
      LATEST_MARKDOWN_PATH,
    ]);
    expect(getActiveTab(useSessionStore.getState())?.document).toMatchObject({
      path: LATEST_MARKDOWN_PATH,
    });
    expect(useSessionStore.getState().folderContext).toBe(emptyNotesFolderContext);
  });

  it("activates the tab already holding a routed document without reading it again", async () => {
    const routed = createSavedDocument({ path: OTHER_MARKDOWN_PATH, isDirty: true });
    setDefaultSession({
      folderContext: emptyNotesFolderContext,
      documents: [createSavedDocument(), routed],
      activeIndex: 0,
    });
    mockTauriApi({ takeLaunchDocumentPaths: () => ["c:/notes/OTHER.md"] });

    await expect(openLaunchDocuments()).resolves.toBe(true);

    expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
    expect(useSessionStore.getState().tabs).toHaveLength(2);
    expect(getActiveTab(useSessionStore.getState())?.document).toMatchObject({
      path: OTHER_MARKDOWN_PATH,
      isDirty: true,
    });
  });

  it("finishes opening one launch's document before taking the next, so neither cancels the other", async () => {
    const firstRead = Promise.withResolvers<OpenedMarkdownDocument>();
    const routedPaths = [[OTHER_MARKDOWN_PATH], [LATEST_MARKDOWN_PATH]];
    setDefaultSession({ folderContext: emptyNotesFolderContext });
    mockTauriApi({
      takeLaunchDocumentPaths: () => routedPaths.shift() ?? [],
      openMarkdownFile: ({ path }) =>
        path === OTHER_MARKDOWN_PATH ? firstRead.promise : openedLatestMarkdownFile,
    });

    const first = openLaunchDocuments();
    const second = openLaunchDocuments();

    await vi.waitFor(() => expect(countTauriApiCalls("openMarkdownFile")).toBe(1));
    expect(countTauriApiCalls("takeLaunchDocumentPaths")).toBe(1);

    firstRead.resolve(openedOtherMarkdownFile);

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(
      useSessionStore
        .getState()
        .tabs.map(({ document }) => document.status === "saved" && document.path),
    ).toEqual([OTHER_MARKDOWN_PATH, LATEST_MARKDOWN_PATH]);
  });

  it("reports a routed document that cannot be opened and still opens the next one", async () => {
    setDefaultSession({ folderContext: emptyNotesFolderContext });
    mockTauriApi({
      takeLaunchDocumentPaths: () => ["C:/Notes/missing.md", OTHER_MARKDOWN_PATH],
      openMarkdownFile: ({ path }) =>
        path === OTHER_MARKDOWN_PATH
          ? openedOtherMarkdownFile
          : Promise.reject({ kind: "missingFile", path }),
    });

    await expect(openLaunchDocuments()).resolves.toBe(true);

    expect(toastManager.add).toHaveBeenCalledWith({
      description: "C:/Notes/missing.md",
      title: "Markdown file not found.",
      type: "error",
    });
    expect(getActiveTab(useSessionStore.getState())?.document).toMatchObject({
      path: OTHER_MARKDOWN_PATH,
    });
  });
});

describe("open session workflows", () => {
  it("opens Markdown files into the active session and records recent items", async () => {
    mockTauriApi({
      openMarkdownFile: () => openedOtherMarkdownFile,
      scanMarkdownFolder: () => emptyNotesFolderContext,
    });

    await expect(openMarkdownFileAtPath(OTHER_MARKDOWN_PATH)).resolves.toBe(true);

    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: TEST_NOTES_FOLDER_PATH },
      activeDocument: createSavedDocument({
        path: OTHER_MARKDOWN_PATH,
        content: "# Other",
      }),
    });
    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [{ path: OTHER_MARKDOWN_PATH }],
      recentFolders: [{ path: TEST_NOTES_FOLDER_PATH }],
    });
  });

  it("preserves an active folder context when opening Markdown files", async () => {
    const pinnedFolderContext = createEmptyFolderContext({ path: OTHER_FOLDER_PATH });
    setDefaultSession({ folderContext: pinnedFolderContext });
    mockTauriApi({
      openMarkdownFile: () => openedOtherMarkdownFile,
    });

    await expect(openMarkdownFileAtPath(OTHER_MARKDOWN_PATH)).resolves.toBe(true);

    expect(countTauriApiCalls("scanMarkdownFolder")).toBe(0);
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: OTHER_FOLDER_PATH },
      activeDocument: createSavedDocument({
        path: OTHER_MARKDOWN_PATH,
        content: "# Other",
      }),
    });
    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [{ path: OTHER_MARKDOWN_PATH }],
      recentFolders: [],
    });
  });

  it("opens folders without an index document as folder-only sessions", async () => {
    mockTauriApiCommand("openMarkdownFolder", () => ({
      folder: emptyNotesFolderContext,
      indexDocument: null,
      indexError: null,
    }));

    await expect(openFolderContextAtPath(TEST_NOTES_FOLDER_PATH)).resolves.toBe(true);

    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: TEST_NOTES_FOLDER_PATH },
      activeDocument: null,
    });
    expect(useRecentItemsStore.getState().recentFolders).toMatchObject([
      { path: TEST_NOTES_FOLDER_PATH },
    ]);
  });

  it("opens folders when the configured index fails and reports the index error", async () => {
    mockTauriApiCommand("openMarkdownFolder", () => ({
      folder: emptyNotesFolderContext,
      indexDocument: null,
      indexError: { kind: "missingFile", path: `${TEST_NOTES_FOLDER_PATH}/readme.md` },
    }));

    await expect(openFolderContextAtPath(TEST_NOTES_FOLDER_PATH)).resolves.toBe(true);

    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: TEST_NOTES_FOLDER_PATH },
      activeDocument: null,
    });
    expect(toastManager.add).toHaveBeenCalledWith({
      description: `${TEST_NOTES_FOLDER_PATH}/readme.md`,
      title: "Could not open folder index file.",
      type: "error",
    });
  });

  it("opens a file in a new tab without asking about the active document's unsaved changes", async () => {
    const activeDocument = createSavedDocument({ content: "# Local", isDirty: true });
    setDefaultSession({ activeDocument });
    mockTauriApi({ openMarkdownFile: () => openedOtherMarkdownFile });

    await expect(openMarkdownFileAtPath(OTHER_MARKDOWN_PATH)).resolves.toBe(true);

    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(useSessionStore.getState().tabs.map(({ document }) => document)).toMatchObject([
      activeDocument,
      { path: OTHER_MARKDOWN_PATH, content: "# Other" },
    ]);
    expect(useSessionStore.getState().activeDocument).toMatchObject({ path: OTHER_MARKDOWN_PATH });
  });

  it("adds the new tab after the active one", async () => {
    setDefaultSession({
      documents: [createSavedDocument(), createSavedDocument({ path: LATEST_MARKDOWN_PATH })],
    });
    mockTauriApi({ openMarkdownFile: () => openedOtherMarkdownFile });

    await openMarkdownFileAtPath(OTHER_MARKDOWN_PATH);

    expect(useSessionStore.getState().tabs.map(({ document }) => document)).toMatchObject([
      { path: TEST_MARKDOWN_FILE_PATH },
      { path: OTHER_MARKDOWN_PATH },
      { path: LATEST_MARKDOWN_PATH },
    ]);
  });

  it("activates the tab already holding a file instead of reading it again", async () => {
    setDefaultSession({
      documents: [
        createSavedDocument({ isDirty: true }),
        createSavedDocument({ path: OTHER_MARKDOWN_PATH }),
      ],
      activeIndex: 1,
    });
    mockTauriApi({});

    await expect(openMarkdownFileAtPath("c:\\notes\\README.md")).resolves.toBe(true);

    expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(useSessionStore.getState().tabs).toHaveLength(2);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      path: TEST_MARKDOWN_FILE_PATH,
      isDirty: true,
    });
    expect(useRecentItemsStore.getState().recentFiles).toMatchObject([
      { path: TEST_MARKDOWN_FILE_PATH },
    ]);
  });

  it("opens a preview in the window's preview tab, replacing the document there", async () => {
    setDefaultSession({
      documents: [
        createSavedDocument(),
        createSavedDocument({ path: LATEST_MARKDOWN_PATH }),
        createUntitledDocument(),
      ],
      previewIndex: 1,
      activeIndex: 2,
    });
    mockTauriApi({ openMarkdownFile: () => openedOtherMarkdownFile });

    await expect(openMarkdownFileAtPath(OTHER_MARKDOWN_PATH, { preview: true })).resolves.toBe(
      true,
    );

    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(useSessionStore.getState().tabs).toMatchObject([
      { document: { path: TEST_MARKDOWN_FILE_PATH }, preview: false },
      { document: { path: OTHER_MARKDOWN_PATH }, preview: true },
      { document: { status: "untitled" }, preview: false },
    ]);
    expect(useSessionStore.getState().activeDocument).toMatchObject({ path: OTHER_MARKDOWN_PATH });
  });

  it("activates an ordinary tab already holding a previewed file, leaving the preview alone", async () => {
    setDefaultSession({
      documents: [createSavedDocument(), createSavedDocument({ path: LATEST_MARKDOWN_PATH })],
      previewIndex: 1,
      activeIndex: 1,
    });
    mockTauriApi({});

    await openMarkdownFileAtPath(TEST_MARKDOWN_FILE_PATH, { preview: true });

    expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
    expect(useSessionStore.getState().tabs).toMatchObject([
      { document: { path: TEST_MARKDOWN_FILE_PATH }, preview: false },
      { document: { path: LATEST_MARKDOWN_PATH }, preview: true },
    ]);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      path: TEST_MARKDOWN_FILE_PATH,
    });
  });

  it("keeps the preview tab when its file is opened again other than as a preview", async () => {
    setDefaultSession({ documents: [createSavedDocument()], previewIndex: 0 });
    mockTauriApi({});

    await openMarkdownFileAtPath(TEST_MARKDOWN_FILE_PATH, { preview: true });

    expect(getActiveTab(useSessionStore.getState())?.preview).toBe(true);

    await openMarkdownFileAtPath(TEST_MARKDOWN_FILE_PATH);

    expect(getActiveTab(useSessionStore.getState())?.preview).toBe(false);
    expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
  });

  it("opens a file as an ordinary tab when a preview open of it is superseded", async () => {
    const previewOpenFile = Promise.withResolvers<OpenedMarkdownDocument>();
    setDefaultSession({ folderContext: emptyNotesFolderContext });
    let readCount = 0;
    mockTauriApi({
      openMarkdownFile: () => {
        readCount += 1;

        return readCount === 1 ? previewOpenFile.promise : openedOtherMarkdownFile;
      },
    });

    const previewOpen = openMarkdownFileAtPath(OTHER_MARKDOWN_PATH, { preview: true });
    await vi.waitFor(() => expect(countTauriApiCalls("openMarkdownFile")).toBe(1));
    const keepOpen = openMarkdownFileAtPath(OTHER_MARKDOWN_PATH);
    previewOpenFile.resolve(openedOtherMarkdownFile);

    await expect(previewOpen).resolves.toBe(false);
    await expect(keepOpen).resolves.toBe(true);
    expect(useSessionStore.getState().tabs).toMatchObject([
      { document: { path: OTHER_MARKDOWN_PATH }, preview: false },
    ]);
  });

  it("activates a tab that opened the same file while it was being read", async () => {
    const openFileDeferred = Promise.withResolvers<OpenedMarkdownDocument>();
    mockTauriApi({
      openMarkdownFile: () => openFileDeferred.promise,
      scanMarkdownFolder: () => emptyNotesFolderContext,
    });

    const openPromise = openMarkdownFileAtPath(OTHER_MARKDOWN_PATH);

    await vi.waitFor(() => expect(countTauriApiCalls("openMarkdownFile")).toBe(1));

    const openedMeanwhile = useSessionStore
      .getState()
      .openTab(createSavedDocument({ path: OTHER_MARKDOWN_PATH, content: "# Meanwhile" }));
    useSessionStore.getState().openTab(createSavedDocument({ path: LATEST_MARKDOWN_PATH }));
    openFileDeferred.resolve(openedOtherMarkdownFile);

    await expect(openPromise).resolves.toBe(true);
    expect(useSessionStore.getState().tabs).toHaveLength(2);
    expect(useSessionStore.getState().activeTabId).toBe(openedMeanwhile.id);
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
        args.path === OTHER_MARKDOWN_PATH ? supersededOpenFile.promise : latestOpenFile.promise,
      scanMarkdownFolder: () => emptyNotesFolderContext,
    });

    const supersededOpenPromise = openMarkdownFileAtPath(OTHER_MARKDOWN_PATH);

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(tauriApiCommand("openMarkdownFile"), {
        path: OTHER_MARKDOWN_PATH,
        encoding: null,
      });
    });

    const latestOpenPromise = openMarkdownFileAtPath(LATEST_MARKDOWN_PATH);

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(tauriApiCommand("openMarkdownFile"), {
        path: LATEST_MARKDOWN_PATH,
        encoding: null,
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

  it("opens a folder while keeping the open tabs, without asking about unsaved changes", async () => {
    const activeDocument = createUntitledDocument({ isDirty: true });
    setDefaultSession({ activeDocument });
    mockTauriApiCommand("openMarkdownFolder", () => ({
      folder: createEmptyFolderContext({ path: OTHER_FOLDER_PATH }),
      indexDocument: null,
      indexError: null,
    }));

    await expect(openFolderContextAtPath(OTHER_FOLDER_PATH)).resolves.toBe(true);

    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: OTHER_FOLDER_PATH },
      activeDocument,
    });
  });

  it("opens the folder's index file as a preview after the active tab", async () => {
    setDefaultSession({ activeDocument: createUntitledDocument() });
    mockTauriApiCommand("openMarkdownFolder", () => ({
      folder: createEmptyFolderContext({ path: OTHER_FOLDER_PATH }),
      indexDocument: createOpenedMarkdownDocument({ path: `${OTHER_FOLDER_PATH}/index.md` }),
      indexError: null,
    }));

    await openFolderContextAtPath(OTHER_FOLDER_PATH);

    expect(useSessionStore.getState().tabs).toMatchObject([
      { document: { status: "untitled" }, preview: false },
      { document: { path: `${OTHER_FOLDER_PATH}/index.md` }, preview: true },
    ]);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      path: `${OTHER_FOLDER_PATH}/index.md`,
    });
  });

  it("activates the index file's tab when the file is already open", async () => {
    const indexDocument = createSavedDocument({
      path: `${OTHER_FOLDER_PATH}/index.md`,
      isDirty: true,
    });
    setDefaultSession({ documents: [indexDocument, createUntitledDocument()], activeIndex: 1 });
    mockTauriApiCommand("openMarkdownFolder", () => ({
      folder: createEmptyFolderContext({ path: OTHER_FOLDER_PATH }),
      indexDocument: createOpenedMarkdownDocument({ path: `${OTHER_FOLDER_PATH}/index.md` }),
      indexError: null,
    }));

    await openFolderContextAtPath(OTHER_FOLDER_PATH);

    expect(useSessionStore.getState().tabs).toHaveLength(2);
    expect(useSessionStore.getState().activeDocument).toEqual(indexDocument);
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
      indexError: null,
    });

    await expect(supersededOpenPromise).resolves.toBe(false);
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      activeDocument: { status: "saved", path: TEST_MARKDOWN_FILE_PATH },
    });

    latestOpenFolder.resolve({
      folder: latestFolderContext,
      indexDocument: null,
      indexError: null,
    });

    await expect(latestOpenPromise).resolves.toBe(true);
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: LATEST_FOLDER_PATH },
      activeDocument: { status: "saved", path: TEST_MARKDOWN_FILE_PATH },
    });
  });
});

describe("folder context after opening a file", () => {
  it("shows the document before its folder finishes scanning", async () => {
    const folderScan = Promise.withResolvers<FolderContextState>();
    mockTauriApi({
      openMarkdownFile: () => openedOtherMarkdownFile,
      scanMarkdownFolder: () => folderScan.promise,
    });

    await expect(openMarkdownFileAtPath(OTHER_MARKDOWN_PATH)).resolves.toBe(true);

    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      folderContextLoad: { path: TEST_NOTES_FOLDER_PATH },
      activeDocument: { status: "saved", path: OTHER_MARKDOWN_PATH },
    });
    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [{ path: OTHER_MARKDOWN_PATH }],
      recentFolders: [],
    });

    folderScan.resolve(emptyNotesFolderContext);

    await vi.waitFor(() => {
      expect(useSessionStore.getState()).toMatchObject({
        folderContext: { path: TEST_NOTES_FOLDER_PATH },
        folderContextLoad: null,
        activeDocument: { status: "saved", path: OTHER_MARKDOWN_PATH },
      });
    });
    expect(useRecentItemsStore.getState().recentFolders).toMatchObject([
      { path: TEST_NOTES_FOLDER_PATH },
    ]);
  });

  it("keeps the loading folder when another file opens before the scan finishes", async () => {
    const folderScan = Promise.withResolvers<FolderContextState>();
    mockTauriApi({
      openMarkdownFile: (args) =>
        args.path === OTHER_MARKDOWN_PATH
          ? openedOtherMarkdownFile
          : createOpenedMarkdownDocument({
              path: LATEST_MARKDOWN_PATH,
              parentFolderPath: LATEST_FOLDER_PATH,
            }),
      scanMarkdownFolder: () => folderScan.promise,
    });

    await openMarkdownFileAtPath(OTHER_MARKDOWN_PATH);
    await expect(openMarkdownFileAtPath(LATEST_MARKDOWN_PATH)).resolves.toBe(true);

    expect(countTauriApiCalls("scanMarkdownFolder")).toBe(1);

    folderScan.resolve(emptyNotesFolderContext);

    await vi.waitFor(() => {
      expect(useSessionStore.getState()).toMatchObject({
        folderContext: { path: TEST_NOTES_FOLDER_PATH },
        activeDocument: { status: "saved", path: LATEST_MARKDOWN_PATH },
      });
    });
  });

  it("discards a folder scan that an opened folder replaced", async () => {
    const folderScan = Promise.withResolvers<FolderContextState>();
    mockTauriApi({
      openMarkdownFile: () => openedOtherMarkdownFile,
      scanMarkdownFolder: () => folderScan.promise,
      openMarkdownFolder: () => ({
        folder: createEmptyFolderContext({ path: LATEST_FOLDER_PATH }),
        indexDocument: null,
        indexError: null,
      }),
    });

    await openMarkdownFileAtPath(OTHER_MARKDOWN_PATH);
    await expect(openFolderContextAtPath(LATEST_FOLDER_PATH)).resolves.toBe(true);

    folderScan.resolve(emptyNotesFolderContext);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: LATEST_FOLDER_PATH },
      folderContextLoad: null,
      activeDocument: { path: OTHER_MARKDOWN_PATH },
    });
    expect(useRecentItemsStore.getState().recentFolders).toMatchObject([
      { path: LATEST_FOLDER_PATH },
    ]);
  });

  it("keeps the document open and reports a folder that cannot be scanned", async () => {
    mockTauriApi({
      openMarkdownFile: () => openedOtherMarkdownFile,
      scanMarkdownFolder: () =>
        Promise.reject({
          kind: "permissionDenied",
          path: TEST_NOTES_FOLDER_PATH,
          message: "Access is denied.",
        }),
    });

    await expect(openMarkdownFileAtPath(OTHER_MARKDOWN_PATH)).resolves.toBe(true);

    await vi.waitFor(() => {
      expect(toastManager.add).toHaveBeenCalledWith({
        description: "Access is denied.",
        title: "Permission denied accessing folder.",
        type: "error",
      });
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: null,
      folderContextLoad: null,
      activeDocument: { status: "saved", path: OTHER_MARKDOWN_PATH },
    });
    expect(useRecentItemsStore.getState().recentFolders).toEqual([]);
  });
});

describe("opening a file another window holds", () => {
  it("shows the file in the window holding it instead of reading it again", async () => {
    const activeDocument = createUntitledDocument();
    setDefaultSession({ activeDocument });
    mockTauriApi({ claimWindowDocument: () => ({ kind: "openElsewhere" }) });

    await expect(openMarkdownFileAtPath(OTHER_MARKDOWN_PATH)).resolves.toBe(true);

    expect(getLastTauriApiArgs("claimWindowDocument")).toEqual({
      path: OTHER_MARKDOWN_PATH,
      activate: true,
    });
    expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
    expect(useSessionStore.getState().tabs.map(({ document }) => document)).toEqual([
      activeDocument,
    ]);
    expect(useRecentItemsStore.getState().recentFiles).toMatchObject([
      { path: OTHER_MARKDOWN_PATH },
    ]);
  });

  it("claims the file before reading it and keeps it claimed once its tab holds it", async () => {
    const sync = new WindowDocumentsSync();
    onTestFinished(() => sync.dispose());
    mockTauriApi({
      openMarkdownFile: () => openedOtherMarkdownFile,
      scanMarkdownFolder: () => emptyNotesFolderContext,
    });

    await openMarkdownFileAtPath(OTHER_MARKDOWN_PATH);

    const calls = vi.mocked(invoke).mock.calls.map(([command]) => command);
    expect(calls.indexOf(tauriApiCommand("claimWindowDocument"))).toBeLessThan(
      calls.indexOf(tauriApiCommand("openMarkdownFile")),
    );
    await vi.waitFor(() =>
      expect(getLastTauriApiArgs("setWindowDocuments")).toEqual({
        documents: [{ path: OTHER_MARKDOWN_PATH, unsaved: false }],
      }),
    );
  });

  it("gives the claim back when the file cannot be opened", async () => {
    const sync = new WindowDocumentsSync();
    onTestFinished(() => sync.dispose());
    mockTauriApi({
      openMarkdownFile: () => Promise.reject({ kind: "missingFile", path: OTHER_MARKDOWN_PATH }),
    });
    await vi.waitFor(() => expect(countTauriApiCalls("setWindowDocuments")).toBe(1));

    await expect(openMarkdownFileAtPath(OTHER_MARKDOWN_PATH)).rejects.toMatchObject({
      kind: "missingFile",
    });

    await vi.waitFor(() => expect(countTauriApiCalls("setWindowDocuments")).toBe(2));
    expect(getLastTauriApiArgs("setWindowDocuments")).toEqual({ documents: [] });
    expect(useSessionStore.getState().tabs).toEqual([]);
  });

  it("opens a folder without the index file another window holds, leaving that window alone", async () => {
    const activeDocument = createUntitledDocument();
    setDefaultSession({ activeDocument });
    mockTauriApi({
      openMarkdownFolder: () => ({
        folder: createEmptyFolderContext({ path: OTHER_FOLDER_PATH }),
        indexDocument: createOpenedMarkdownDocument({ path: `${OTHER_FOLDER_PATH}/index.md` }),
        indexError: null,
      }),
      claimWindowDocument: () => ({ kind: "openElsewhere" }),
    });

    await expect(openFolderContextAtPath(OTHER_FOLDER_PATH)).resolves.toBe(true);

    expect(getLastTauriApiArgs("claimWindowDocument")).toEqual({
      path: `${OTHER_FOLDER_PATH}/index.md`,
      activate: false,
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: OTHER_FOLDER_PATH },
      activeDocument,
    });
    expect(useSessionStore.getState().tabs).toHaveLength(1);
  });
});
