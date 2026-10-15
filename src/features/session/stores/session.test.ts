import { beforeEach, describe, expect, it } from "vitest";

import {
  createSavedDocument,
  createUntitledDocument,
  TEST_UNTITLED_DOCUMENT_ID,
} from "@/test/factories/document";
import { createFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";

import { findTab, getActiveTab, getSessionMode, useSessionStore } from "./session";

const OTHER_PATH = "C:/Notes/other.md";
const THIRD_PATH = "C:/Notes/third.md";

const getPaths = () =>
  useSessionStore
    .getState()
    .tabs.map(({ document }) => (document.status === "saved" ? document.path : document.id));

describe("session store", () => {
  beforeEach(() => useSessionStore.getState().reset());

  it("derives the current session mode from active document and folder context", () => {
    expect(getSessionMode({ activeDocument: null, folderContext: null })).toBe("welcome");
    expect(
      getSessionMode({
        activeDocument: null,
        folderContext: createFolderContext(),
      }),
    ).toBe("folder-only");
    expect(
      getSessionMode({
        activeDocument: createSavedDocument(),
        folderContext: null,
      }),
    ).toBe("document");
  });

  it("opens each document in a new tab after the active one and activates it", () => {
    const { openTab } = useSessionStore.getState();
    const first = openTab(createSavedDocument());
    openTab(createSavedDocument({ path: OTHER_PATH }));

    useSessionStore.getState().activateTab(first.id);
    const third = openTab(createSavedDocument({ path: THIRD_PATH }));

    expect(getPaths()).toEqual([TEST_MARKDOWN_FILE_PATH, THIRD_PATH, OTHER_PATH]);
    expect(useSessionStore.getState()).toMatchObject({
      activeTabId: third.id,
      activeDocument: { path: THIRD_PATH },
    });
  });

  it("opens a preview after the active tab and later previews in its place", () => {
    const { openTab } = useSessionStore.getState();
    const first = openTab(createSavedDocument());
    const preview = openTab(createSavedDocument({ path: OTHER_PATH }), { preview: true });

    useSessionStore.getState().activateTab(first.id);
    const replacement = openTab(createSavedDocument({ path: THIRD_PATH }), { preview: true });

    expect(getPaths()).toEqual([TEST_MARKDOWN_FILE_PATH, THIRD_PATH]);
    expect(findTab(useSessionStore.getState(), preview.id)).toBeNull();
    expect(replacement).toMatchObject({ preview: true });
    expect(useSessionStore.getState().activeTabId).toBe(replacement.id);
  });

  it("opens a preview beside a kept preview rather than in its place", () => {
    const { keepTab, openTab } = useSessionStore.getState();
    const kept = openTab(createSavedDocument(), { preview: true });

    keepTab(kept.id);
    openTab(createSavedDocument({ path: OTHER_PATH }), { preview: true });

    expect(getPaths()).toEqual([TEST_MARKDOWN_FILE_PATH, OTHER_PATH]);
    expect(useSessionStore.getState().tabs.map((tab) => tab.preview)).toEqual([false, true]);
  });

  it("keeps a preview tab once its document is edited", () => {
    const preview = useSessionStore.getState().openTab(createSavedDocument(), { preview: true });

    useSessionStore.getState().markDocumentDirty(TEST_MARKDOWN_FILE_PATH);
    useSessionStore.getState().openTab(createSavedDocument({ path: OTHER_PATH }), {
      preview: true,
    });

    expect(findTab(useSessionStore.getState(), preview.id)).toMatchObject({
      preview: false,
      document: { isDirty: true },
    });
    expect(getPaths()).toEqual([TEST_MARKDOWN_FILE_PATH, OTHER_PATH]);
  });

  it("keeps a preview tab only through a replacement that asks to keep it", () => {
    const { openTab, replaceTabDocument } = useSessionStore.getState();
    const preview = openTab(createSavedDocument(), { preview: true });

    replaceTabDocument(preview.id, createSavedDocument(), { reload: true });

    expect(findTab(useSessionStore.getState(), preview.id)?.preview).toBe(true);

    replaceTabDocument(preview.id, createSavedDocument(), { keep: true });

    expect(findTab(useSessionStore.getState(), preview.id)?.preview).toBe(false);
  });

  it("never previews an untitled document", () => {
    const tab = useSessionStore.getState().openTab(createUntitledDocument(), { preview: true });

    expect(tab.preview).toBe(false);
  });

  it("replaces the folder context together with a tab it opens", () => {
    const folderContext = createFolderContext();

    useSessionStore.getState().openTab(createSavedDocument(), { folderContext });

    expect(useSessionStore.getState()).toMatchObject({
      activeDocument: { path: TEST_MARKDOWN_FILE_PATH },
      folderContext: { path: TEST_NOTES_FOLDER_PATH },
    });
  });

  it("closes tabs, activating the next tab to the right, or else to the left", () => {
    const { openTab } = useSessionStore.getState();
    const first = openTab(createSavedDocument());
    const second = openTab(createSavedDocument({ path: OTHER_PATH }));
    const third = openTab(createSavedDocument({ path: THIRD_PATH }));

    useSessionStore.getState().activateTab(second.id);
    useSessionStore.getState().closeTabs([second.id]);

    expect(useSessionStore.getState().activeTabId).toBe(third.id);

    useSessionStore.getState().closeTabs([third.id]);

    expect(useSessionStore.getState().activeTabId).toBe(first.id);

    useSessionStore.getState().closeTabs([first.id]);

    expect(useSessionStore.getState()).toMatchObject({
      tabs: [],
      activeTabId: null,
      activeDocument: null,
    });
  });

  it("keeps the active tab when another tab closes", () => {
    const { openTab } = useSessionStore.getState();
    const first = openTab(createSavedDocument());
    const second = openTab(createSavedDocument({ path: OTHER_PATH }));

    useSessionStore.getState().closeTabs([first.id]);

    expect(useSessionStore.getState().activeTabId).toBe(second.id);
  });

  it("ignores activating a tab that is not open", () => {
    const tab = useSessionStore.getState().openTab(createSavedDocument());
    const state = useSessionStore.getState();

    useSessionStore.getState().activateTab("tab:missing");

    expect(useSessionStore.getState()).toBe(state);
    expect(useSessionStore.getState().activeTabId).toBe(tab.id);
  });

  it("tracks document replacement separately from edits to the current document", () => {
    const tab = useSessionStore.getState().openTab(createSavedDocument());

    useSessionStore.getState().setDocumentContent(TEST_MARKDOWN_FILE_PATH, "Edited");
    expect(findTab(useSessionStore.getState(), tab.id)?.generation).toBe(tab.generation);

    useSessionStore.getState().replaceTabDocument(tab.id, createSavedDocument());
    expect(findTab(useSessionStore.getState(), tab.id)?.generation).not.toBe(tab.generation);
  });

  it("does not replace a document when another tab is activated", () => {
    const tab = useSessionStore.getState().openTab(createSavedDocument());
    useSessionStore.getState().openTab(createSavedDocument({ path: OTHER_PATH }));

    useSessionStore.getState().activateTab(tab.id);

    expect(getActiveTab(useSessionStore.getState())).toMatchObject({
      generation: tab.generation,
      document: tab.document,
    });
  });

  it("updates saved document content only for matching document keys", () => {
    useSessionStore.getState().openTab(createSavedDocument({ content: "# Original" }));

    useSessionStore.getState().setDocumentContent("C:/Other/readme.md", "# Stale");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: "# Original",
    });

    useSessionStore.getState().setDocumentContent(TEST_MARKDOWN_FILE_PATH, "# Updated");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: "# Updated",
    });
  });

  it("updates the document of an inactive tab without changing the active one", () => {
    useSessionStore.getState().openTab(createSavedDocument());
    useSessionStore.getState().openTab(createSavedDocument({ path: OTHER_PATH }));
    const activeDocument = useSessionStore.getState().activeDocument;

    useSessionStore.getState().markDocumentDirty(TEST_MARKDOWN_FILE_PATH);

    expect(useSessionStore.getState().activeDocument).toBe(activeDocument);
    expect(useSessionStore.getState().tabs[0].document.isDirty).toBe(true);
  });

  it("matches saved document keys by path identity", () => {
    useSessionStore.getState().openTab(createSavedDocument({ content: "# Original" }));

    useSessionStore.getState().setDocumentContent("c:\\notes\\readme.md", "# Updated");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: "# Updated",
    });
  });

  it("updates untitled document content only for matching document ids", () => {
    useSessionStore.getState().openTab(createUntitledDocument());

    useSessionStore.getState().setDocumentContent("untitled:stale", "Stale");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: "Draft",
    });

    useSessionStore.getState().setDocumentContent(TEST_UNTITLED_DOCUMENT_ID, "Updated");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: "Updated",
    });
  });

  it("updates line endings only for the matching document", () => {
    useSessionStore.getState().openTab(createSavedDocument());

    useSessionStore.getState().setDocumentLineEnding("C:/Other/readme.md", "crlf");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: false,
      lineEnding: "lf",
    });

    useSessionStore.getState().setDocumentLineEnding(TEST_MARKDOWN_FILE_PATH, "crlf");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: true,
      lineEnding: "crlf",
    });
  });

  it("marks a document dirty when its encoding changes, keeping the file's encoding", () => {
    const windows1252 = { name: "windows-1252", bom: false } as const;
    useSessionStore.getState().openTab(createSavedDocument({ encoding: windows1252 }));
    const activeDocument = useSessionStore.getState().activeDocument;

    useSessionStore.getState().setDocumentEncoding(TEST_MARKDOWN_FILE_PATH, windows1252);

    expect(useSessionStore.getState().activeDocument).toBe(activeDocument);

    useSessionStore
      .getState()
      .setDocumentEncoding(TEST_MARKDOWN_FILE_PATH, { name: "UTF-8", bom: true });

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: true,
      encoding: { name: "UTF-8", bom: true },
      fileEncoding: windows1252,
    });
  });

  it("changes the editor load only for a reload", () => {
    const tab = useSessionStore.getState().openTab(createSavedDocument());

    useSessionStore.getState().replaceTabDocument(tab.id, createSavedDocument());

    expect(findTab(useSessionStore.getState(), tab.id)?.loadId).toBe(tab.loadId);

    useSessionStore.getState().replaceTabDocument(tab.id, createSavedDocument(), { reload: true });

    expect(findTab(useSessionStore.getState(), tab.id)?.loadId).toBe(tab.loadId + 1);
  });

  it("keeps a view state only for the reload that carries it", () => {
    const viewState = { anchor: 3, head: 5, focused: true };
    const tab = useSessionStore.getState().openTab(createSavedDocument());
    const getViewState = () => findTab(useSessionStore.getState(), tab.id)?.viewState;

    useSessionStore.getState().replaceTabDocument(tab.id, createSavedDocument(), { viewState });

    expect(getViewState()).toBeNull();

    useSessionStore
      .getState()
      .replaceTabDocument(tab.id, createSavedDocument(), { reload: true, viewState });

    expect(getViewState()).toBe(viewState);

    useSessionStore.getState().replaceTabDocument(tab.id, createSavedDocument());

    expect(getViewState()).toBeNull();
  });

  it("records the file's state without replacing the document", () => {
    const activeDocument = createSavedDocument({ isDirty: true });
    const tab = useSessionStore.getState().openTab(activeDocument);
    const metadata = { sizeBytes: 12, modifiedAtUnixMs: 1_800_000_000_000 };

    useSessionStore.getState().setDocumentFileState("C:/Other/readme.md", {
      metadata,
      externalChange: { kind: "missing" },
    });

    expect(useSessionStore.getState().activeDocument).toBe(activeDocument);

    useSessionStore.getState().setDocumentFileState(TEST_MARKDOWN_FILE_PATH, {
      metadata,
      externalChange: { kind: "missing" },
    });

    expect(getActiveTab(useSessionStore.getState())).toMatchObject({
      document: { ...activeDocument, metadata, externalChange: { kind: "missing" } },
      generation: tab.generation,
      loadId: tab.loadId,
    });
  });

  it("does not record a file state for an untitled document", () => {
    const untitledDocument = createUntitledDocument();
    useSessionStore.getState().openTab(untitledDocument);

    useSessionStore.getState().setDocumentFileState(TEST_UNTITLED_DOCUMENT_ID, {
      metadata: { sizeBytes: 1, modifiedAtUnixMs: 1 },
      externalChange: null,
    });

    expect(useSessionStore.getState().activeDocument).toBe(untitledDocument);
  });

  it("keeps documents clean when setting the current line ending", () => {
    useSessionStore.getState().openTab(createSavedDocument());
    const activeDocument = useSessionStore.getState().activeDocument;

    useSessionStore.getState().setDocumentLineEnding(TEST_MARKDOWN_FILE_PATH, "lf");

    expect(useSessionStore.getState().activeDocument).toBe(activeDocument);
  });

  it("marks documents dirty only for matching document keys", () => {
    useSessionStore.getState().openTab(createSavedDocument());

    useSessionStore.getState().markDocumentDirty("C:/Other/readme.md");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: false,
    });

    useSessionStore.getState().markDocumentDirty(TEST_MARKDOWN_FILE_PATH);

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: true,
    });
  });

  it("does not rewrite already-dirty documents", () => {
    useSessionStore.getState().openTab(createSavedDocument({ isDirty: true }));
    const activeDocument = useSessionStore.getState().activeDocument;

    useSessionStore.getState().markDocumentDirty(TEST_MARKDOWN_FILE_PATH);

    expect(useSessionStore.getState().activeDocument).toBe(activeDocument);
  });

  it("applies a folder scan only while its load is still the current one", () => {
    const { folderContextLoad } = useSessionStore
      .getState()
      .openTabWithFolderContextLoad(TEST_NOTES_FOLDER_PATH, createSavedDocument());

    expect(useSessionStore.getState().folderContextLoad).toBe(folderContextLoad);
    expect(
      useSessionStore
        .getState()
        .finishFolderContextLoad(folderContextLoad.id + 1, createFolderContext()),
    ).toBe(false);
    expect(
      useSessionStore
        .getState()
        .finishFolderContextLoad(folderContextLoad.id, createFolderContext()),
    ).toBe(true);
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: TEST_NOTES_FOLDER_PATH },
      folderContextLoad: null,
    });
  });

  it("resets to the welcome session", () => {
    useSessionStore
      .getState()
      .openTab(createSavedDocument(), { folderContext: createFolderContext() });

    useSessionStore.getState().reset();

    expect(useSessionStore.getState()).toMatchObject({
      activeDocument: null,
      activeTabId: null,
      folderContext: null,
      tabs: [],
    });
  });
});
