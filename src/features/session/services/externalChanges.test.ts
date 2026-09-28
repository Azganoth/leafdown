import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  MarkdownFileState,
  OpenedMarkdownDocument,
  SavedMarkdownDocument,
} from "@/features/document";
import { useRecentItemsStore } from "@/features/preferences";
import { CancellationToken } from "@/lib/cancellation";
import { requestConfirmation } from "@/lib/confirmation";
import { toastManager } from "@/lib/toast";
import {
  createFileMetadata,
  createOpenedMarkdownDocument,
  createSavedDocument,
  createSavedMarkdownDocumentResult,
  createUntitledDocument,
  TEST_FILE_FINGERPRINT,
} from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { createFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { setDefaultRecentItems, setDefaultSession } from "@/test/utils/appStores";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { saveActiveMarkdownDocument } from "./documentWorkflows";
import { checkActiveDocumentFile } from "./externalChanges";
import { renameFolderEntry } from "./folderEntryWorkflows";

vi.mock("@/lib/confirmation", () => ({ requestConfirmation: vi.fn(async () => false) }));

const CHANGED_METADATA = createFileMetadata({ modifiedAtUnixMs: 1_800_000_000_000, sizeBytes: 9 });
const LATER_METADATA = createFileMetadata({ modifiedAtUnixMs: 1_800_000_060_000, sizeBytes: 9 });
const CHANGED_FINGERPRINT = "fedcba9876543210";
const OTHER_FINGERPRINT = "0f0f0f0f0f0f0f0f";
const OTHER_MARKDOWN_PATH = `${TEST_NOTES_FOLDER_PATH}/other.md`;

const folderContext = createFolderContext();

const contentChanged = (
  overrides: Partial<Extract<MarkdownFileState, { kind: "contentChanged" }>> = {},
): MarkdownFileState => ({
  kind: "contentChanged",
  metadata: CHANGED_METADATA,
  fingerprint: CHANGED_FINGERPRINT,
  ...overrides,
});

const createReloadedDocument = (content = "# After\n") =>
  createOpenedMarkdownDocument({
    content,
    metadata: CHANGED_METADATA,
    fingerprint: CHANGED_FINGERPRINT,
  });

const modifiedWarning = {
  title: "File changed on disk",
  description:
    '"readme.md" changed outside Leafdown. Your unsaved changes are kept, and saving asks before overwriting the file.',
  type: "warning",
};

const missingWarning = {
  title: "File missing",
  description: '"readme.md" was moved or deleted outside Leafdown. The document stays open.',
  type: "warning",
};

describe("external document changes", () => {
  beforeEach(() => {
    vi.mocked(requestConfirmation).mockReset().mockResolvedValue(false);
    documentEditorBridge.clear();
  });

  it("does not inspect an untitled document", async () => {
    setDefaultSession({ activeDocument: createUntitledDocument() });
    mockTauriApi({});

    await checkActiveDocumentFile();

    expect(countTauriApiCalls("inspectMarkdownFile")).toBe(0);
  });

  it("compares the file with the document's metadata and fingerprint", async () => {
    const activeDocument = createSavedDocument();
    setDefaultSession({ activeDocument });
    mockTauriApi({ inspectMarkdownFile: () => ({ kind: "unchanged" }) });
    const sessionBeforeCheck = useSessionStore.getState();

    await checkActiveDocumentFile();

    expect(getLastTauriApiArgs("inspectMarkdownFile")).toEqual({
      path: TEST_MARKDOWN_FILE_PATH,
      metadata: activeDocument.metadata,
      fingerprint: TEST_FILE_FINGERPRINT,
    });
    expect(useSessionStore.getState()).toBe(sessionBeforeCheck);
    expect(toastManager.add).not.toHaveBeenCalled();
  });

  describe("clean documents", () => {
    it("reloads a changed file into a new clean baseline", async () => {
      setDefaultSession({
        folderContext,
        activeDocument: createSavedDocument({ content: "# Before\n", lineEnding: "lf" }),
      });
      setDefaultRecentItems();
      documentEditorBridge.set(
        TEST_MARKDOWN_FILE_PATH,
        createMilkdownEditorBridge({
          getViewState: () => ({ anchor: 4, head: 6, focused: true }),
        }),
      );
      mockTauriApi({
        inspectMarkdownFile: () => contentChanged(),
        openMarkdownFile: () =>
          createOpenedMarkdownDocument({
            content: "# After\r\n",
            lineEnding: "crlf",
            encoding: { name: "UTF-8", bom: true },
            metadata: CHANGED_METADATA,
            fingerprint: CHANGED_FINGERPRINT,
          }),
      });
      const { activeDocumentGeneration, activeDocumentLoadId } = useSessionStore.getState();

      await checkActiveDocumentFile();

      expect(useSessionStore.getState()).toMatchObject({
        folderContext,
        activeDocumentGeneration: activeDocumentGeneration + 1,
        activeDocumentLoadId: activeDocumentLoadId + 1,
        activeDocumentViewState: { anchor: 4, head: 6, focused: true },
        activeDocument: {
          status: "saved",
          path: TEST_MARKDOWN_FILE_PATH,
          content: "# After\r\n",
          isDirty: false,
          lineEnding: "crlf",
          encoding: { name: "UTF-8", bom: true },
          fileEncoding: { name: "UTF-8", bom: true },
          metadata: CHANGED_METADATA,
          fingerprint: CHANGED_FINGERPRINT,
          externalChange: null,
        },
      });
      expect(useRecentItemsStore.getState().recentFiles).toEqual([]);
      expect(toastManager.add).toHaveBeenCalledExactlyOnceWith({
        title: "Reloaded from disk",
        description: '"readme.md" changed outside Leafdown.',
        type: "success",
      });
    });

    it("reads the reloaded file in the encoding the document was read in", async () => {
      setDefaultSession({
        activeDocument: createSavedDocument({ encoding: { name: "windows-1252", bom: false } }),
      });
      mockTauriApi({
        inspectMarkdownFile: () => contentChanged(),
        openMarkdownFile: () => createReloadedDocument(),
      });

      await checkActiveDocumentFile();

      expect(getLastTauriApiArgs("openMarkdownFile")).toEqual({
        path: TEST_MARKDOWN_FILE_PATH,
        encoding: "windows-1252",
      });
    });

    it("accepts a touched file's metadata without reloading or warning", async () => {
      const activeDocument = createSavedDocument();
      setDefaultSession({ activeDocument });
      mockTauriApi({
        inspectMarkdownFile: () => ({ kind: "metadataChanged", metadata: CHANGED_METADATA }),
      });
      const { activeDocumentGeneration, activeDocumentLoadId } = useSessionStore.getState();

      await checkActiveDocumentFile();

      expect(useSessionStore.getState()).toMatchObject({
        activeDocument: { ...activeDocument, metadata: CHANGED_METADATA },
        activeDocumentGeneration,
        activeDocumentLoadId,
      });
      expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
      expect(toastManager.add).not.toHaveBeenCalled();
    });

    it("reports a file that cannot be reloaded once and keeps the document", async () => {
      const activeDocument = createSavedDocument();
      const invalidEncoding = { kind: "invalidEncoding", path: TEST_MARKDOWN_FILE_PATH };
      setDefaultSession({ activeDocument });
      mockTauriApi({
        inspectMarkdownFile: () => contentChanged(),
        openMarkdownFile: () => Promise.reject(invalidEncoding),
      });

      await checkActiveDocumentFile();
      await checkActiveDocumentFile();

      expect(useSessionStore.getState().activeDocument).toEqual({
        ...activeDocument,
        externalChange: {
          kind: "modified",
          metadata: CHANGED_METADATA,
          fingerprint: CHANGED_FINGERPRINT,
        },
      });
      expect(countTauriApiCalls("openMarkdownFile")).toBe(1);
      expect(toastManager.add).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ title: "Invalid Markdown file encoding.", type: "error" }),
      );
    });
  });

  describe("dirty documents", () => {
    it("keeps unsaved edits and the save baseline, warning once per external version", async () => {
      const activeDocument = createSavedDocument({ content: "# Local edit\n", isDirty: true });
      setDefaultSession({ activeDocument });
      mockTauriApi({ inspectMarkdownFile: () => contentChanged() });
      const { activeDocumentGeneration, activeDocumentLoadId } = useSessionStore.getState();

      await checkActiveDocumentFile();
      await checkActiveDocumentFile();

      expect(useSessionStore.getState()).toMatchObject({
        activeDocument: {
          ...activeDocument,
          externalChange: {
            kind: "modified",
            metadata: CHANGED_METADATA,
            fingerprint: CHANGED_FINGERPRINT,
          },
        },
        activeDocumentGeneration,
        activeDocumentLoadId,
      });
      expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
      expect(toastManager.add).toHaveBeenCalledExactlyOnceWith(modifiedWarning);

      mockTauriApi({ inspectMarkdownFile: () => contentChanged({ metadata: LATER_METADATA }) });

      await checkActiveDocumentFile();

      expect(useSessionStore.getState().activeDocument).toMatchObject({
        metadata: activeDocument.metadata,
        externalChange: { metadata: LATER_METADATA, fingerprint: CHANGED_FINGERPRINT },
      });
      expect(toastManager.add).toHaveBeenCalledOnce();

      mockTauriApi({
        inspectMarkdownFile: () => contentChanged({ fingerprint: OTHER_FINGERPRINT }),
      });

      await checkActiveDocumentFile();

      expect(useSessionStore.getState().activeDocument).toMatchObject({
        content: "# Local edit\n",
        externalChange: { fingerprint: OTHER_FINGERPRINT },
      });
      expect(toastManager.add).toHaveBeenCalledTimes(2);
    });

    it("still asks before a later save overwrites the external version", async () => {
      const activeDocument = createSavedDocument({ isDirty: true });
      setDefaultSession({ activeDocument });
      mockTauriApi({
        inspectMarkdownFile: () => contentChanged(),
        saveMarkdownFile: () =>
          Promise.reject({
            kind: "externalModification",
            path: TEST_MARKDOWN_FILE_PATH,
            currentMetadata: CHANGED_METADATA,
          }),
      });

      await checkActiveDocumentFile();
      await expect(saveActiveMarkdownDocument()).resolves.toBe(false);

      expect(getLastTauriApiArgs("saveMarkdownFile")).toMatchObject({
        expectedMetadata: activeDocument.metadata,
        overwrite: false,
      });
      expect(requestConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ confirmLabel: "Overwrite anyway", title: "File changed" }),
      );
    });

    it("clears the conflict when the file returns to the document's version", async () => {
      setDefaultSession({
        activeDocument: createSavedDocument({
          isDirty: true,
          externalChange: {
            kind: "modified",
            metadata: CHANGED_METADATA,
            fingerprint: CHANGED_FINGERPRINT,
          },
        }),
      });
      mockTauriApi({
        inspectMarkdownFile: () => ({ kind: "metadataChanged", metadata: LATER_METADATA }),
      });

      await checkActiveDocumentFile();

      expect(useSessionStore.getState().activeDocument).toMatchObject({
        metadata: LATER_METADATA,
        externalChange: null,
      });
      expect(toastManager.add).not.toHaveBeenCalled();
    });
  });

  describe("missing files", () => {
    it.each([false, true])(
      "keeps a document open when its file goes missing (dirty: %s)",
      async (isDirty) => {
        const activeDocument = createSavedDocument({ content: "# Kept\n", isDirty });
        setDefaultSession({ activeDocument });
        mockTauriApi({ inspectMarkdownFile: () => ({ kind: "missing" }) });

        await checkActiveDocumentFile();
        await checkActiveDocumentFile();

        expect(useSessionStore.getState().activeDocument).toEqual({
          ...activeDocument,
          externalChange: { kind: "missing" },
        });
        expect(toastManager.add).toHaveBeenCalledExactlyOnceWith(missingWarning);
      },
    );

    it("clears the missing state when the same file comes back", async () => {
      setDefaultSession({
        activeDocument: createSavedDocument({ externalChange: { kind: "missing" } }),
      });
      mockTauriApi({ inspectMarkdownFile: () => ({ kind: "unchanged" }) });

      await checkActiveDocumentFile();

      expect(useSessionStore.getState().activeDocument).toMatchObject({ externalChange: null });
      expect(toastManager.add).not.toHaveBeenCalled();
    });

    it("reloads a clean document when a different file appears at its path", async () => {
      setDefaultSession({
        activeDocument: createSavedDocument({ externalChange: { kind: "missing" } }),
      });
      mockTauriApi({
        inspectMarkdownFile: () => contentChanged(),
        openMarkdownFile: () => createReloadedDocument("# Recreated\n"),
      });

      await checkActiveDocumentFile();

      expect(useSessionStore.getState().activeDocument).toMatchObject({
        content: "# Recreated\n",
        externalChange: null,
      });
    });

    it("records a file removed between inspecting and reloading it as missing", async () => {
      const activeDocument = createSavedDocument();
      setDefaultSession({ activeDocument });
      mockTauriApi({
        inspectMarkdownFile: () => contentChanged(),
        openMarkdownFile: () =>
          Promise.reject({ kind: "missingFile", path: TEST_MARKDOWN_FILE_PATH }),
      });

      await checkActiveDocumentFile();

      expect(useSessionStore.getState().activeDocument).toEqual({
        ...activeDocument,
        externalChange: { kind: "missing" },
      });
      expect(toastManager.add).toHaveBeenCalledExactlyOnceWith(missingWarning);
    });
  });

  describe("Leafdown's own changes", () => {
    it("waits for a pending save and compares with the baseline it leaves", async () => {
      setDefaultSession({ activeDocument: createSavedDocument({ isDirty: true }) });
      const save = Promise.withResolvers<SavedMarkdownDocument>();
      mockTauriApi({
        saveMarkdownFile: () => save.promise,
        inspectMarkdownFile: () => ({ kind: "unchanged" }),
      });

      const saving = saveActiveMarkdownDocument();
      const checking = checkActiveDocumentFile();

      await vi.waitFor(() => expect(countTauriApiCalls("saveMarkdownFile")).toBe(1));
      expect(countTauriApiCalls("inspectMarkdownFile")).toBe(0);

      save.resolve(
        createSavedMarkdownDocumentResult({
          metadata: CHANGED_METADATA,
          fingerprint: CHANGED_FINGERPRINT,
        }),
      );
      await Promise.all([saving, checking]);

      expect(getLastTauriApiArgs("inspectMarkdownFile")).toEqual({
        path: TEST_MARKDOWN_FILE_PATH,
        metadata: CHANGED_METADATA,
        fingerprint: CHANGED_FINGERPRINT,
      });
      expect(toastManager.add).not.toHaveBeenCalled();
    });

    it("waits for a pending rename and checks the document at its new path", async () => {
      const renamedPath = `${TEST_NOTES_FOLDER_PATH}/intro.md`;
      setDefaultSession({ activeDocument: createSavedDocument(), folderContext });
      const rename = Promise.withResolvers<{ path: string }>();
      mockTauriApi({
        renameFolderEntry: () => rename.promise,
        scanMarkdownFolder: () => folderContext,
        inspectMarkdownFile: () => ({ kind: "unchanged" }),
      });

      const renaming = renameFolderEntry(TEST_MARKDOWN_FILE_PATH, "intro");
      const checking = checkActiveDocumentFile();

      await vi.waitFor(() => expect(countTauriApiCalls("renameFolderEntry")).toBe(1));
      expect(countTauriApiCalls("inspectMarkdownFile")).toBe(0);

      rename.resolve({ path: renamedPath });
      await Promise.all([renaming, checking]);

      expect(getLastTauriApiArgs("inspectMarkdownFile")).toMatchObject({ path: renamedPath });
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        path: renamedPath,
        externalChange: null,
      });
      expect(toastManager.add).not.toHaveBeenCalled();
    });
  });

  describe("stale results", () => {
    it("discards an inspection that finishes after another document opened", async () => {
      setDefaultSession({ activeDocument: createSavedDocument() });
      const inspection = Promise.withResolvers<MarkdownFileState>();
      mockTauriApi({ inspectMarkdownFile: () => inspection.promise });
      const otherDocument = createSavedDocument({ path: OTHER_MARKDOWN_PATH });

      const checking = checkActiveDocumentFile();
      await vi.waitFor(() => expect(countTauriApiCalls("inspectMarkdownFile")).toBe(1));
      useSessionStore.getState().setActiveDocument(otherDocument);
      inspection.resolve({ kind: "missing" });
      await checking;

      expect(useSessionStore.getState().activeDocument).toEqual(otherDocument);
      expect(toastManager.add).not.toHaveBeenCalled();
    });

    it("records a conflict instead of reloading when the document is edited during the reload", async () => {
      const activeDocument = createSavedDocument({ content: "# Before\n" });
      setDefaultSession({ activeDocument });
      const reload = Promise.withResolvers<OpenedMarkdownDocument>();
      mockTauriApi({
        inspectMarkdownFile: () => contentChanged(),
        openMarkdownFile: () => reload.promise,
      });
      const { activeDocumentLoadId } = useSessionStore.getState();

      const checking = checkActiveDocumentFile();
      await vi.waitFor(() => expect(countTauriApiCalls("openMarkdownFile")).toBe(1));
      useSessionStore.getState().setActiveDocumentContent(TEST_MARKDOWN_FILE_PATH, "# Typed\n");
      useSessionStore.getState().markActiveDocumentDirty(TEST_MARKDOWN_FILE_PATH);
      reload.resolve(createReloadedDocument());
      await checking;

      expect(useSessionStore.getState()).toMatchObject({
        activeDocumentLoadId,
        activeDocument: {
          content: "# Typed\n",
          isDirty: true,
          metadata: activeDocument.metadata,
          externalChange: {
            kind: "modified",
            metadata: CHANGED_METADATA,
            fingerprint: CHANGED_FINGERPRINT,
          },
        },
      });
      expect(toastManager.add).toHaveBeenCalledExactlyOnceWith(modifiedWarning);
    });

    it("stops a cancelled check before it inspects the file", async () => {
      setDefaultSession({ activeDocument: createSavedDocument() });
      mockTauriApi({});

      await checkActiveDocumentFile(CancellationToken.Cancelled);

      expect(countTauriApiCalls("inspectMarkdownFile")).toBe(0);
    });
  });
});
