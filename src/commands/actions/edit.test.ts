import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it } from "vitest";

import type { DocumentEncoding } from "@/features/document";
import { useFolderSearchStore } from "@/features/folder-search";
import { useSettingsStore } from "@/features/preferences";
import { useSessionStore } from "@/features/session";
import { createAppCommandContext } from "@/test/factories/commands";
import {
  createOpenedMarkdownDocument,
  createSavedDocument,
  createUntitledDocument,
} from "@/test/factories/document";
import { createEmptyFolderContext } from "@/test/factories/folderContext";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { mockTauriApi, tauriApiCommand } from "@/test/utils/tauriApi";

import {
  findInFolder,
  getFileEncodingState,
  getFindInFolderState,
  getReopenedEncodingName,
  getReopenWithEncodingState,
  getUtf8EncodingState,
  getUtf8WithBomEncodingState,
  reopenWithEncoding,
  setCrlfLineEnding,
  setFileEncoding,
  setUtf8WithBomEncoding,
} from "./edit";

const windows1252 = { name: "windows-1252", bom: false } as const;

describe("edit actions", () => {
  it("finds in the folder only while one is open, showing the sidebar to search in", () => {
    expect(getFindInFolderState(createAppCommandContext()).enabled).toBe(false);
    expect(
      getFindInFolderState(createAppCommandContext({ folderContext: createEmptyFolderContext() }))
        .enabled,
    ).toBe(true);

    setDefaultSettings({ sidebarVisible: false });
    findInFolder();

    expect(useSettingsStore.getState().sidebarVisible).toBe(true);
    expect(useFolderSearchStore.getState()).toMatchObject({
      open: true,
      focusRequestId: expect.any(Number),
    });
  });

  it("routes document state commands to their feature APIs", () => {
    const activeDocument = createSavedDocument();

    setDefaultSession({ activeDocument });

    setCrlfLineEnding(createAppCommandContext({ activeDocument }));

    expect(useSessionStore.getState().activeDocument?.lineEnding).toBe("crlf");
    expect(useSessionStore.getState().activeDocument?.isDirty).toBe(true);
  });

  it("converts the document to UTF-8 with a BOM and back to the file's encoding", () => {
    setDefaultSession({ activeDocument: createSavedDocument({ encoding: windows1252 }) });
    const context = () =>
      createAppCommandContext({ activeDocument: useSessionStore.getState().activeDocument });

    setUtf8WithBomEncoding(context());

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      isDirty: true,
      encoding: { name: "UTF-8", bom: true },
    });
    expect(getUtf8WithBomEncodingState(context())).toEqual({ enabled: true, checked: true });
    expect(getFileEncodingState(context())).toEqual({ enabled: true, checked: false });

    setFileEncoding(context());

    expect(useSessionStore.getState().activeDocument?.encoding).toEqual(windows1252);
    expect(getFileEncodingState(context())).toEqual({ enabled: true, checked: true });
    expect(getUtf8EncodingState(context())).toEqual({ enabled: true, checked: false });
  });

  it("offers the file's encoding only when it is not UTF-8", () => {
    expect(
      getFileEncodingState(
        createAppCommandContext({
          activeDocument: createSavedDocument({ encoding: { name: "UTF-8", bom: true } }),
        }),
      ).enabled,
    ).toBe(false);
    expect(
      getFileEncodingState(createAppCommandContext({ activeDocument: createUntitledDocument() }))
        .enabled,
    ).toBe(false);
    expect(getUtf8EncodingState(createAppCommandContext()).enabled).toBe(false);
  });

  it("offers reopening only for a saved file without a byte order mark", () => {
    expect(
      getReopenWithEncodingState(
        createAppCommandContext({ activeDocument: createSavedDocument() }),
      ),
    ).toEqual({ enabled: true });
    expect(
      getReopenWithEncodingState(
        createAppCommandContext({
          activeDocument: createSavedDocument({ encoding: { name: "UTF-16LE", bom: true } }),
        }),
      ).enabled,
    ).toBe(false);
    expect(
      getReopenWithEncodingState(
        createAppCommandContext({
          activeDocument: createSavedDocument({
            encoding: { name: "UTF-8", bom: true },
            fileEncoding: { name: "UTF-8", bom: false },
          }),
        }),
      ),
    ).toEqual({ enabled: true });
    expect(
      getReopenWithEncodingState(
        createAppCommandContext({ activeDocument: createUntitledDocument() }),
      ).enabled,
    ).toBe(false);
  });

  it("marks the chosen encoding the file was read in", () => {
    const reopenedEncoding = (encoding: DocumentEncoding) =>
      getReopenedEncodingName(
        createAppCommandContext({ activeDocument: createSavedDocument({ encoding }) }),
      );

    expect(reopenedEncoding({ name: "Shift_JIS", bom: false })).toBe("Shift_JIS");
    expect(reopenedEncoding({ name: "UTF-16LE", bom: false })).toBe("UTF-16LE");
    expect(reopenedEncoding({ name: "UTF-16LE", bom: true })).toBeNull();
    expect(reopenedEncoding({ name: "UTF-8", bom: false })).toBe("UTF-8");
    expect(reopenedEncoding({ name: "UTF-8", bom: true })).toBeNull();
  });

  it("reopens the saved file in the chosen encoding", async () => {
    const activeDocument = createSavedDocument();
    setDefaultSession({ folderContext: createEmptyFolderContext(), activeDocument });
    mockTauriApi({
      openMarkdownFile: () =>
        createOpenedMarkdownDocument({ encoding: { name: "Shift_JIS", bom: false } }),
    });

    await reopenWithEncoding(createAppCommandContext({ activeDocument }), "Shift_JIS");

    expect(invoke).toHaveBeenCalledWith(tauriApiCommand("openMarkdownFile"), {
      path: activeDocument.path,
      encoding: "Shift_JIS",
    });
    expect(useSessionStore.getState().activeDocument?.encoding).toEqual({
      name: "Shift_JIS",
      bom: false,
    });
  });
});
