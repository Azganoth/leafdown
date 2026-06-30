import { beforeEach, describe, expect, it } from "vitest";

import {
  createSavedDocument,
  createUntitledDocument,
  TEST_UNTITLED_DOCUMENT_ID,
} from "@/test/factories/document";
import { createFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";

import { getSessionMode, useSessionStore } from "./session";

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

  it("sets folder-only sessions by clearing the active document", () => {
    useSessionStore.getState().setActiveDocument(createSavedDocument());

    useSessionStore.getState().setFolderOnlySession(createFolderContext());

    expect(useSessionStore.getState()).toMatchObject({
      activeDocument: null,
      folderContext: { path: TEST_NOTES_FOLDER_PATH },
    });
  });

  it("sets active document sessions atomically", () => {
    const activeDocument = createSavedDocument();
    const folderContext = createFolderContext();

    useSessionStore.getState().setActiveDocumentSession(folderContext, activeDocument);

    expect(useSessionStore.getState()).toMatchObject({
      activeDocument,
      folderContext,
    });
  });

  it("updates saved active document content only for matching document keys", () => {
    useSessionStore.getState().setActiveDocument(createSavedDocument({ content: "# Original" }));

    useSessionStore.getState().setActiveDocumentContent("C:/Other/readme.md", "# Stale");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: "# Original",
    });

    useSessionStore.getState().setActiveDocumentContent(TEST_MARKDOWN_FILE_PATH, "# Updated");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: "# Updated",
    });
  });

  it("matches saved active document keys by path identity", () => {
    useSessionStore.getState().setActiveDocument(createSavedDocument({ content: "# Original" }));

    useSessionStore.getState().setActiveDocumentContent("c:\\notes\\readme.md", "# Updated");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: "# Updated",
    });
  });

  it("updates untitled active document content only for matching document ids", () => {
    useSessionStore.getState().setActiveDocument(createUntitledDocument());

    useSessionStore.getState().setActiveDocumentContent("untitled:stale", "Stale");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: "Draft",
    });

    useSessionStore.getState().setActiveDocumentContent(TEST_UNTITLED_DOCUMENT_ID, "Updated");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: "Updated",
    });
  });

  it("updates line endings only for the matching active document", () => {
    useSessionStore.getState().setActiveDocument(createSavedDocument());

    useSessionStore.getState().setActiveDocumentLineEnding("C:/Other/readme.md", "crlf");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: false,
      lineEnding: "lf",
    });

    useSessionStore.getState().setActiveDocumentLineEnding(TEST_MARKDOWN_FILE_PATH, "crlf");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: true,
      lineEnding: "crlf",
    });
  });

  it("keeps active documents clean when setting the current line ending", () => {
    useSessionStore.getState().setActiveDocument(createSavedDocument());
    const activeDocument = useSessionStore.getState().activeDocument;

    useSessionStore.getState().setActiveDocumentLineEnding(TEST_MARKDOWN_FILE_PATH, "lf");

    expect(useSessionStore.getState().activeDocument).toBe(activeDocument);
  });

  it("marks active documents dirty only for matching document keys", () => {
    useSessionStore.getState().setActiveDocument(createSavedDocument());

    useSessionStore.getState().markActiveDocumentDirty("C:/Other/readme.md");

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: false,
    });

    useSessionStore.getState().markActiveDocumentDirty(TEST_MARKDOWN_FILE_PATH);

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: true,
    });
  });

  it("does not rewrite already-dirty active documents", () => {
    useSessionStore.getState().setActiveDocument(createSavedDocument({ isDirty: true }));
    const activeDocument = useSessionStore.getState().activeDocument;

    useSessionStore.getState().markActiveDocumentDirty(TEST_MARKDOWN_FILE_PATH);

    expect(useSessionStore.getState().activeDocument).toBe(activeDocument);
  });

  it("resets to the welcome session", () => {
    useSessionStore
      .getState()
      .setActiveDocumentSession(createFolderContext(), createSavedDocument());

    useSessionStore.getState().reset();

    expect(useSessionStore.getState()).toMatchObject({
      activeDocument: null,
      folderContext: null,
    });
  });
});
