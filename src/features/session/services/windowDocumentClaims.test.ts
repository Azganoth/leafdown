import { afterEach, describe, expect, it, vi } from "vitest";

import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { setDefaultSession } from "@/test/utils/appStores";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { useSessionStore } from "../stores/session";
import { claimDocumentForWindow, WindowDocumentsSync } from "./windowDocumentClaims";

const OTHER_MARKDOWN_PATH = `${TEST_NOTES_FOLDER_PATH}/other.md`;

describe("window document claims", () => {
  let sync: WindowDocumentsSync | null = null;

  afterEach(() => {
    sync?.dispose();
    sync = null;
  });

  const startSync = () => {
    sync = new WindowDocumentsSync();
  };

  it("reports the window's saved documents and which have unsaved changes", async () => {
    setDefaultSession({
      documents: [
        createSavedDocument({ isDirty: true }),
        createUntitledDocument(),
        createSavedDocument({ path: OTHER_MARKDOWN_PATH }),
      ],
    });

    startSync();

    await vi.waitFor(() =>
      expect(getLastTauriApiArgs("setWindowDocuments")).toEqual({
        documents: [
          { path: TEST_MARKDOWN_FILE_PATH, unsaved: true },
          { path: OTHER_MARKDOWN_PATH, unsaved: false },
        ],
      }),
    );
  });

  it("reports again only when a saved document opens, closes, or changes its unsaved state", async () => {
    setDefaultSession({ activeDocument: createSavedDocument() });
    startSync();
    await vi.waitFor(() => expect(countTauriApiCalls("setWindowDocuments")).toBe(1));

    useSessionStore.getState().openTab(createUntitledDocument());
    useSessionStore.getState().markDocumentDirty(TEST_MARKDOWN_FILE_PATH);

    await vi.waitFor(() =>
      expect(getLastTauriApiArgs("setWindowDocuments")).toEqual({
        documents: [{ path: TEST_MARKDOWN_FILE_PATH, unsaved: true }],
      }),
    );
    expect(countTauriApiCalls("setWindowDocuments")).toBe(2);
  });

  it("keeps a claimed document reported until the claim is given back", async () => {
    startSync();
    await vi.waitFor(() => expect(countTauriApiCalls("setWindowDocuments")).toBe(1));

    const claim = await claimDocumentForWindow(OTHER_MARKDOWN_PATH, { activate: true });

    expect(getLastTauriApiArgs("claimWindowDocument")).toEqual({
      path: OTHER_MARKDOWN_PATH,
      activate: true,
    });
    expect(claim).not.toBeNull();

    useSessionStore.getState().openTab(createUntitledDocument());
    useSessionStore.getState().openTab(createSavedDocument());

    await vi.waitFor(() =>
      expect(getLastTauriApiArgs("setWindowDocuments")).toEqual({
        documents: [
          { path: TEST_MARKDOWN_FILE_PATH, unsaved: false },
          { path: OTHER_MARKDOWN_PATH, unsaved: false },
        ],
      }),
    );

    claim?.dispose();

    await vi.waitFor(() =>
      expect(getLastTauriApiArgs("setWindowDocuments")).toEqual({
        documents: [{ path: TEST_MARKDOWN_FILE_PATH, unsaved: false }],
      }),
    );
  });

  it("reports a given-back claim even when the window's documents look unchanged", async () => {
    startSync();
    await vi.waitFor(() => expect(countTauriApiCalls("setWindowDocuments")).toBe(1));

    const claim = await claimDocumentForWindow(OTHER_MARKDOWN_PATH, { activate: false });
    claim?.dispose();

    await vi.waitFor(() => expect(countTauriApiCalls("setWindowDocuments")).toBe(2));
    expect(getLastTauriApiArgs("setWindowDocuments")).toEqual({ documents: [] });
  });

  it("claims nothing for a document another window holds", async () => {
    mockTauriApi({ claimWindowDocument: () => ({ kind: "openElsewhere" }) });

    await expect(
      claimDocumentForWindow(OTHER_MARKDOWN_PATH, { activate: true }),
    ).resolves.toBeNull();
  });

  it("stops reporting once disposed", async () => {
    startSync();
    await vi.waitFor(() => expect(countTauriApiCalls("setWindowDocuments")).toBe(1));

    sync?.dispose();
    useSessionStore.getState().openTab(createSavedDocument());
    await Promise.resolve();

    expect(countTauriApiCalls("setWindowDocuments")).toBe(1);
  });
});
