import { describe, expect, it } from "vitest";

import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import { createFolderContext } from "@/test/factories/folderContext";
import { TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";

import type { DocumentTab, SessionState } from "../stores/session";
import { getKeptSnapshotIds, parseKeptWindowState, toKeptWindowState } from "./keptWindowState";

const tab = (id: string, document: DocumentTab["document"], preview = false): DocumentTab => ({
  id,
  document,
  generation: 0,
  loadId: 0,
  viewState: null,
  preview,
});

const session = (overrides: Partial<SessionState> = {}): SessionState => ({
  folderContext: null,
  folderContextLoad: null,
  tabs: [],
  activeTabId: null,
  activeDocument: null,
  ...overrides,
});

describe("kept window state", () => {
  it("reads back the state it describes", () => {
    const state = toKeptWindowState(
      session({
        folderContext: createFolderContext(),
        tabs: [
          tab("tab:1", createSavedDocument({ isDirty: true }), false),
          tab("tab:2", createUntitledDocument()),
        ],
        activeTabId: "tab:2",
      }),
      ({ id }) => ({
        snapshotId: id === "tab:1" ? "kept" : null,
        viewState: { anchor: 1, head: 2, focused: true },
      }),
    );

    expect(state).toMatchObject({
      folderPath: TEST_NOTES_FOLDER_PATH,
      activeTabIndex: 1,
      tabs: [
        { kind: "saved", snapshotId: "kept", isDirty: true },
        { kind: "untitled", snapshotId: null, isDirty: false },
      ],
    });
    expect(getKeptSnapshotIds(state)).toEqual(["kept"]);
    expect(parseKeptWindowState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("keeps the folder a window is still loading", () => {
    expect(
      toKeptWindowState(session({ folderContextLoad: { id: 1, path: "C:/Loading" } }), () => ({
        snapshotId: null,
        viewState: null,
      })).folderPath,
    ).toBe("C:/Loading");
  });

  it("drops a tab it cannot read and keeps the others", () => {
    const state = toKeptWindowState(
      session({ tabs: [tab("tab:1", createUntitledDocument())], activeTabId: "tab:1" }),
      () => ({ snapshotId: null, viewState: null }),
    );
    const [untitled] = state.tabs;
    const stored = {
      ...state,
      tabs: [
        { ...untitled, kind: "saved" },
        { ...untitled, encoding: { name: "windows-1252", bom: true } },
        { ...untitled, lineEnding: "cr" },
        untitled,
      ],
    };

    expect(parseKeptWindowState(stored)?.tabs).toEqual(state.tabs);
  });

  it.each([
    ["another version", { version: 2, folderPath: null, activeTabIndex: null, tabs: [] }],
    ["a missing field", { version: 1, folderPath: null, tabs: [] }],
    ["something else", "tabs"],
  ])("reads nothing from %s", (_label, value) => {
    expect(parseKeptWindowState(value)).toBeNull();
  });
});
