// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { createSavedDocument } from "@/test/factories/document";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { setDefaultSession } from "@/test/utils/appStores";
import { act, renderHook } from "@/test/utils/react";
import { getWindowListenHandler } from "@/test/utils/tauri";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import {
  ACTIVATE_DOCUMENT_EVENT,
  DOCUMENTS_MOVED_EVENT,
  DOCUMENTS_REMOVED_EVENT,
  WINDOW_DOCUMENTS_CHANGED_EVENT,
  type DocumentPathPayload,
  type DocumentsMovedPayload,
  type WindowDocumentsSnapshot,
} from "../services/windowDocumentsApi";
import { isUnsavedInOtherWindow } from "../stores/otherWindowDocuments";
import { useSessionStore } from "../stores/session";
import { useWindowDocuments } from "./useWindowDocuments";

const OTHER_MARKDOWN_PATH = `${TEST_NOTES_FOLDER_PATH}/other.md`;

describe("useWindowDocuments", () => {
  it("reports the window's documents while mounted", async () => {
    setDefaultSession({ activeDocument: createSavedDocument({ isDirty: true }) });

    const { unmount } = renderHook(() => useWindowDocuments());

    await vi.waitFor(() =>
      expect(getLastTauriApiArgs("setWindowDocuments")).toEqual({
        documents: [{ path: TEST_MARKDOWN_FILE_PATH, unsaved: true }],
      }),
    );

    unmount();
    useSessionStore.getState().openTab(createSavedDocument({ path: OTHER_MARKDOWN_PATH }));
    await Promise.resolve();

    expect(countTauriApiCalls("setWindowDocuments")).toBe(1);
  });

  it("follows the other windows' unsaved documents, leaving out its own", async () => {
    renderHook(() => useWindowDocuments());

    await act(async () => {
      getWindowListenHandler<WindowDocumentsSnapshot>(WINDOW_DOCUMENTS_CHANGED_EVENT)({
        payload: {
          revision: 1,
          windows: [
            { windowLabel: "main", documents: [{ path: TEST_MARKDOWN_FILE_PATH, unsaved: true }] },
            {
              windowLabel: "window-2",
              documents: [{ path: OTHER_MARKDOWN_PATH, unsaved: true }],
            },
          ],
        },
      });
    });

    expect(isUnsavedInOtherWindow(OTHER_MARKDOWN_PATH)).toBe(true);
    expect(isUnsavedInOtherWindow(TEST_MARKDOWN_FILE_PATH)).toBe(false);
  });

  it("shows the tab another window asked to open", async () => {
    setDefaultSession({
      documents: [createSavedDocument(), createSavedDocument({ path: OTHER_MARKDOWN_PATH })],
      activeIndex: 1,
    });
    renderHook(() => useWindowDocuments());

    await act(async () => {
      getWindowListenHandler<DocumentPathPayload>(ACTIVATE_DOCUMENT_EVENT)({
        payload: { path: TEST_MARKDOWN_FILE_PATH },
      });
    });

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      path: TEST_MARKDOWN_FILE_PATH,
    });
  });

  it("moves its tabs after a rename in another window and checks those a deletion removed", async () => {
    const renamedPath = `${TEST_NOTES_FOLDER_PATH}/intro.md`;
    setDefaultSession({
      documents: [createSavedDocument(), createSavedDocument({ path: OTHER_MARKDOWN_PATH })],
    });
    mockTauriApi({ inspectMarkdownFile: () => ({ kind: "missing" }) });
    renderHook(() => useWindowDocuments());

    act(() => {
      getWindowListenHandler<DocumentsMovedPayload>(DOCUMENTS_MOVED_EVENT)({
        payload: { fromPath: TEST_MARKDOWN_FILE_PATH, toPath: renamedPath },
      });
      getWindowListenHandler<DocumentPathPayload>(DOCUMENTS_REMOVED_EVENT)({
        payload: { path: OTHER_MARKDOWN_PATH },
      });
    });

    await vi.waitFor(() =>
      expect(useSessionStore.getState().tabs.map(({ document }) => document)).toMatchObject([
        { path: renamedPath, externalChange: null },
        { path: OTHER_MARKDOWN_PATH, externalChange: { kind: "missing" } },
      ]),
    );
  });
});
