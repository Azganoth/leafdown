import { invoke } from "@tauri-apps/api/core";
import { confirm, save } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SavedMarkdownDocument } from "@/features/document";
import { DEFAULT_IGNORED_DIRECTORIES } from "@/features/preferences";
import { useSessionStore } from "@/features/session";
import {
  createSavedDocument,
  createSavedMarkdownDocumentResult,
  createUntitledDocument,
  TEST_UNTITLED_DOCUMENT_ID,
} from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { createArticleTree, createFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH } from "@/test/fixtures/paths";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import {
  countTauriApiCalls,
  mockTauriApi,
  mockTauriApiCommand,
  tauriApiCommand,
} from "@/test/utils/tauriApi";

import { documentEditorBridge } from "./documentEditorBridge";
import {
  closeActiveMarkdownDocument,
  createNewMarkdownDocument,
  saveActiveMarkdownDocument,
  saveActiveMarkdownDocumentAs,
} from "./documentWorkflows";

const DRAFT_MARKDOWN_PATH = "C:/Notes/draft.markdown";
const DRAFT_MD_PATH = "C:/Notes/draft.md";
const OUTSIDE_DRAFT_MD_PATH = "C:/Other/draft.md";
const OUTSIDE_FOLDER_PATH = "C:/Other";
const NEXT_UNTITLED_DOCUMENT_ID = "untitled:next";
const RECOVERED_MARKDOWN_PATH = "C:/Notes/recovered.md";

const notesFolderContext = createFolderContext();
const updatedFolderContext = createFolderContext({
  tree: createArticleTree({
    children: [{ kind: "file", name: "draft.markdown", path: DRAFT_MARKDOWN_PATH }],
  }),
});

const createNextUntitledDocument = () =>
  createUntitledDocument({
    id: NEXT_UNTITLED_DOCUMENT_ID,
  });

describe("document workflows", () => {
  beforeEach(() => {
    documentEditorBridge.clear();
  });

  describe("new document", () => {
    it("creates an untitled document without changing the active folder context", async () => {
      setDefaultSettings({ defaultNewDocumentLineEnding: "lf" });
      setDefaultSession({ folderContext: notesFolderContext });

      await expect(createNewMarkdownDocument()).resolves.toBe(true);

      expect(useSessionStore.getState()).toMatchObject({
        folderContext: { path: "C:/Notes" },
        activeDocument: {
          status: "untitled",
          content: "",
          isDirty: false,
          lineEnding: "lf",
        },
      });
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        id: expect.stringMatching(/^untitled:/u),
      });
      expect(invoke).not.toHaveBeenCalled();
    });

    it("cancels New when the dirty document transition is declined", async () => {
      setDefaultSession({
        activeDocument: createUntitledDocument({ isDirty: true }),
      });

      await expect(createNewMarkdownDocument()).resolves.toBe(false);

      expect(confirm).toHaveBeenCalledOnce();
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        status: "untitled",
        id: TEST_UNTITLED_DOCUMENT_ID,
        content: "Draft",
        isDirty: true,
      });
    });
  });

  describe("save", () => {
    it("saves saved documents through the native backend command", async () => {
      const activeDocument = createSavedDocument({
        content: "# Original\n",
        lineEnding: "crlf",
      });
      const savedDocument = createSavedMarkdownDocumentResult({
        metadata: { sizeBytes: 9 },
      });

      setDefaultSettings({ insertFinalNewline: true });
      setDefaultSession({
        activeDocument,
      });
      documentEditorBridge.set(
        TEST_MARKDOWN_FILE_PATH,
        createMilkdownEditorBridge({
          getMarkdown: () => "# Saved\n",
        }),
      );
      mockTauriApiCommand("saveMarkdownFile", () => savedDocument);

      await expect(saveActiveMarkdownDocument()).resolves.toBe(true);

      expect(invoke).toHaveBeenCalledWith(tauriApiCommand("saveMarkdownFile"), {
        path: TEST_MARKDOWN_FILE_PATH,
        content: "# Saved\r\n",
        expectedMetadata: activeDocument.metadata,
        overwrite: false,
      });
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        status: "saved",
        path: TEST_MARKDOWN_FILE_PATH,
        content: "# Saved\r\n",
        isDirty: false,
        lineEnding: "crlf",
        metadata: savedDocument.metadata,
      });
      expect(save).not.toHaveBeenCalled();
    });

    it("does not apply saved document save results after the active document changes", async () => {
      const saveDeferred = Promise.withResolvers<SavedMarkdownDocument>();
      setDefaultSession({
        activeDocument: createSavedDocument(),
      });
      mockTauriApiCommand("saveMarkdownFile", () => saveDeferred.promise);

      const savePromise = saveActiveMarkdownDocument();

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(
          tauriApiCommand("saveMarkdownFile"),
          expect.any(Object),
        );
      });

      useSessionStore.getState().setActiveDocument(createNextUntitledDocument());
      saveDeferred.resolve(createSavedMarkdownDocumentResult());

      await expect(savePromise).resolves.toBe(false);
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        status: "untitled",
        id: NEXT_UNTITLED_DOCUMENT_ID,
      });
    });

    it("serializes concurrent save requests", async () => {
      const firstSave = Promise.withResolvers<SavedMarkdownDocument>();
      const secondSave = Promise.withResolvers<SavedMarkdownDocument>();
      let saveCallCount = 0;
      setDefaultSession({
        activeDocument: createSavedDocument({ isDirty: true }),
      });
      mockTauriApiCommand("saveMarkdownFile", () => {
        saveCallCount += 1;
        return saveCallCount === 1 ? firstSave.promise : secondSave.promise;
      });

      const firstSavePromise = saveActiveMarkdownDocument();

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(1);
      });

      const secondSavePromise = saveActiveMarkdownDocument();

      await Promise.resolve();
      expect(invoke).toHaveBeenCalledTimes(1);

      firstSave.resolve(createSavedMarkdownDocumentResult({ metadata: { sizeBytes: 11 } }));
      await expect(firstSavePromise).resolves.toBe(true);

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(2);
      });

      secondSave.resolve(createSavedMarkdownDocumentResult({ metadata: { sizeBytes: 12 } }));
      await expect(secondSavePromise).resolves.toBe(true);
    });
  });

  describe("save as", () => {
    it("routes untitled Save through Save As and applies the default extension", async () => {
      setDefaultSettings({
        defaultNewDocumentExtension: ".markdown",
        insertFinalNewline: false,
      });
      setDefaultSession({
        folderContext: notesFolderContext,
        activeDocument: createUntitledDocument(),
      });
      documentEditorBridge.set(
        TEST_UNTITLED_DOCUMENT_ID,
        createMilkdownEditorBridge({
          getMarkdown: () => "Draft\n",
        }),
      );
      vi.mocked(save).mockResolvedValue("C:/Notes/draft");
      mockTauriApi({
        saveMarkdownFile: () =>
          createSavedMarkdownDocumentResult({
            path: DRAFT_MARKDOWN_PATH,
            metadata: { sizeBytes: 5 },
          }),
        scanMarkdownFolder: () => updatedFolderContext,
      });

      await expect(saveActiveMarkdownDocument()).resolves.toBe(true);

      expect(save).toHaveBeenCalledWith({
        title: "Save Markdown document",
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        defaultPath: "C:/Notes/Untitled.markdown",
      });
      expect(invoke).toHaveBeenNthCalledWith(1, tauriApiCommand("saveMarkdownFile"), {
        path: DRAFT_MARKDOWN_PATH,
        content: "Draft",
        expectedMetadata: null,
        overwrite: false,
      });
      expect(invoke).toHaveBeenNthCalledWith(2, tauriApiCommand("scanMarkdownFolder"), {
        path: "C:/Notes",
        ignoredDirectories: DEFAULT_IGNORED_DIRECTORIES,
        sortOrder: "name",
      });
      expect(useSessionStore.getState()).toMatchObject({
        folderContext: { path: "C:/Notes", tree: updatedFolderContext.tree },
        activeDocument: createSavedDocument({
          path: DRAFT_MARKDOWN_PATH,
          content: "Draft",
        }),
      });
    });

    it("does not apply Save As results after the active document changes", async () => {
      const saveDeferred = Promise.withResolvers<SavedMarkdownDocument>();
      setDefaultSession({
        folderContext: notesFolderContext,
        activeDocument: createUntitledDocument(),
      });
      vi.mocked(save).mockResolvedValue(DRAFT_MD_PATH);
      mockTauriApi({
        saveMarkdownFile: () => saveDeferred.promise,
        scanMarkdownFolder: () => updatedFolderContext,
      });

      const savePromise = saveActiveMarkdownDocumentAs();

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(
          tauriApiCommand("saveMarkdownFile"),
          expect.any(Object),
        );
      });

      useSessionStore.getState().setActiveDocument(createNextUntitledDocument());
      saveDeferred.resolve(createSavedMarkdownDocumentResult());

      await expect(savePromise).resolves.toBe(false);
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        status: "untitled",
        id: NEXT_UNTITLED_DOCUMENT_ID,
      });
    });

    it("keeps the active folder context when Save As writes outside it", async () => {
      setDefaultSession({
        folderContext: notesFolderContext,
        activeDocument: createUntitledDocument(),
      });
      vi.mocked(save).mockResolvedValue(OUTSIDE_DRAFT_MD_PATH);
      mockTauriApi({
        saveMarkdownFile: () =>
          createSavedMarkdownDocumentResult({
            path: OUTSIDE_DRAFT_MD_PATH,
            parentFolderPath: OUTSIDE_FOLDER_PATH,
          }),
      });

      await expect(saveActiveMarkdownDocumentAs()).resolves.toBe(true);

      expect(countTauriApiCalls("scanMarkdownFolder")).toBe(0);
      expect(useSessionStore.getState()).toMatchObject({
        folderContext: { path: "C:/Notes" },
        activeDocument: {
          status: "saved",
          path: OUTSIDE_DRAFT_MD_PATH,
          content: "Draft\n",
          isDirty: false,
        },
      });
    });

    it("bootstraps the folder context when Save As writes without an active context", async () => {
      const outsideFolderContext = createFolderContext({
        path: OUTSIDE_FOLDER_PATH,
        tree: createArticleTree({
          name: "Other",
          path: OUTSIDE_FOLDER_PATH,
          children: [{ kind: "file", name: "draft.md", path: OUTSIDE_DRAFT_MD_PATH }],
        }),
      });
      setDefaultSession({
        activeDocument: createUntitledDocument(),
      });
      vi.mocked(save).mockResolvedValue(OUTSIDE_DRAFT_MD_PATH);
      mockTauriApi({
        saveMarkdownFile: () =>
          createSavedMarkdownDocumentResult({
            path: OUTSIDE_DRAFT_MD_PATH,
            parentFolderPath: OUTSIDE_FOLDER_PATH,
          }),
        scanMarkdownFolder: () => outsideFolderContext,
      });

      await expect(saveActiveMarkdownDocumentAs()).resolves.toBe(true);

      expect(invoke).toHaveBeenCalledWith(tauriApiCommand("scanMarkdownFolder"), {
        path: OUTSIDE_FOLDER_PATH,
        ignoredDirectories: DEFAULT_IGNORED_DIRECTORIES,
        sortOrder: "name",
      });
      expect(useSessionStore.getState()).toMatchObject({
        folderContext: { path: OUTSIDE_FOLDER_PATH },
        activeDocument: {
          status: "saved",
          path: OUTSIDE_DRAFT_MD_PATH,
          content: "Draft\n",
          isDirty: false,
        },
      });
    });

    it("leaves the active document unchanged when Save As is cancelled", async () => {
      setDefaultSession({
        activeDocument: createUntitledDocument(),
      });

      await expect(saveActiveMarkdownDocumentAs()).resolves.toBe(false);

      expect(invoke).not.toHaveBeenCalled();
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        status: "untitled",
        id: TEST_UNTITLED_DOCUMENT_ID,
        content: "Draft",
        isDirty: false,
      });
    });
  });

  describe("close", () => {
    it("closes clean active documents without prompting", async () => {
      setDefaultSession({
        folderContext: notesFolderContext,
        activeDocument: createSavedDocument(),
      });

      await expect(closeActiveMarkdownDocument()).resolves.toBe(true);

      expect(confirm).not.toHaveBeenCalled();
      expect(useSessionStore.getState()).toMatchObject({
        folderContext: { path: "C:/Notes" },
        activeDocument: null,
      });
    });

    it("keeps dirty active documents open when close document is cancelled", async () => {
      setDefaultSession({
        activeDocument: createSavedDocument({ isDirty: true }),
      });

      await expect(closeActiveMarkdownDocument()).resolves.toBe(false);

      expect(useSessionStore.getState().activeDocument).toMatchObject({
        status: "saved",
        path: TEST_MARKDOWN_FILE_PATH,
        isDirty: true,
      });
    });
  });

  describe("save conflicts", () => {
    it("routes missing saved files to Save As when confirmed", async () => {
      setDefaultSession({
        folderContext: notesFolderContext,
        activeDocument: createSavedDocument({
          content: "# Missing",
        }),
      });
      const saveMarkdownFile = vi
        .fn()
        .mockRejectedValueOnce({ kind: "missingFile", path: TEST_MARKDOWN_FILE_PATH })
        .mockResolvedValueOnce(
          createSavedMarkdownDocumentResult({
            path: RECOVERED_MARKDOWN_PATH,
          }),
        );
      mockTauriApi({
        saveMarkdownFile,
        scanMarkdownFolder: () => updatedFolderContext,
      });
      vi.mocked(confirm).mockResolvedValue(true);
      vi.mocked(save).mockResolvedValue(RECOVERED_MARKDOWN_PATH);

      await expect(saveActiveMarkdownDocument()).resolves.toBe(true);

      expect(confirm).toHaveBeenCalledWith(
        "The saved Markdown file no longer exists. Save this document to a new path?",
        {
          title: "File missing",
          kind: "warning",
          okLabel: "Save as",
          cancelLabel: "Cancel",
        },
      );
      expect(save).toHaveBeenCalledWith({
        title: "Save Markdown document",
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        defaultPath: TEST_MARKDOWN_FILE_PATH,
      });
      expect(invoke).toHaveBeenNthCalledWith(2, tauriApiCommand("saveMarkdownFile"), {
        path: RECOVERED_MARKDOWN_PATH,
        content: "# Missing\n",
        expectedMetadata: null,
        overwrite: false,
      });
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        status: "saved",
        path: RECOVERED_MARKDOWN_PATH,
      });
    });

    it("cancels Save when the saved file is missing and Save As is declined", async () => {
      const activeDocument = createSavedDocument();

      setDefaultSession({
        activeDocument,
      });
      mockTauriApiCommand("saveMarkdownFile", () =>
        Promise.reject({
          kind: "missingFile",
          path: TEST_MARKDOWN_FILE_PATH,
        }),
      );

      await expect(saveActiveMarkdownDocument()).resolves.toBe(false);

      expect(save).not.toHaveBeenCalled();
      expect(useSessionStore.getState().activeDocument).toMatchObject(activeDocument);
    });

    it("overwrites external modifications only after confirmation", async () => {
      const activeDocument = createSavedDocument({
        content: "# Local",
      });

      setDefaultSession({
        activeDocument,
      });
      const saveMarkdownFile = vi
        .fn()
        .mockRejectedValueOnce({
          kind: "externalModification",
          path: TEST_MARKDOWN_FILE_PATH,
          currentMetadata: { ...activeDocument.metadata, sizeBytes: 10 },
        })
        .mockResolvedValueOnce(
          createSavedMarkdownDocumentResult({
            metadata: { sizeBytes: 8 },
          }),
        );
      mockTauriApiCommand("saveMarkdownFile", saveMarkdownFile);
      vi.mocked(confirm).mockResolvedValue(true);

      await expect(saveActiveMarkdownDocument()).resolves.toBe(true);

      expect(confirm).toHaveBeenCalledWith(
        "The saved Markdown file changed outside Leafdown. Overwrite the file with the current document?",
        {
          title: "File changed",
          kind: "warning",
          okLabel: "Overwrite anyway",
          cancelLabel: "Cancel save",
        },
      );
      expect(invoke).toHaveBeenNthCalledWith(2, tauriApiCommand("saveMarkdownFile"), {
        path: TEST_MARKDOWN_FILE_PATH,
        content: "# Local\n",
        expectedMetadata: activeDocument.metadata,
        overwrite: true,
      });
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        metadata: { sizeBytes: 8 },
      });
    });

    it("cancels Save when external modifications are not confirmed", async () => {
      const activeDocument = createSavedDocument();

      setDefaultSession({
        activeDocument,
      });
      mockTauriApiCommand("saveMarkdownFile", () =>
        Promise.reject({
          kind: "externalModification",
          path: TEST_MARKDOWN_FILE_PATH,
          currentMetadata: { ...activeDocument.metadata, sizeBytes: 10 },
        }),
      );

      await expect(saveActiveMarkdownDocument()).resolves.toBe(false);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(useSessionStore.getState().activeDocument).toMatchObject(activeDocument);
    });
  });
});
