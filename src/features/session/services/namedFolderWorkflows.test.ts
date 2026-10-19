import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestConfirmation } from "@/lib/confirmation";
import type { Disposable } from "@/lib/lifecycle";
import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { createFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { countInvokeCalls, getLastInvokeArgs, mockInvokeCommands } from "@/test/utils/tauri";

import { useNamedFoldersStore } from "../stores/namedFolders";
import { getActiveTab, useSessionStore } from "../stores/session";
import { toKeptWindowState } from "../utils/keptWindowState";
import { documentEditorBridge } from "./documentEditorBridge";
import { closeFolderContext } from "./folderContextWorkflows";
import { followKeptSession } from "./keptSession";
import type { ReportWindowSessionArgs } from "./keptSessionApi";
import type { NamedFolder } from "./namedFoldersApi";
import {
  activateNamedFolder,
  keepNamedFolder,
  locateNamedFolder,
  removeNamedFolder,
  renameNamedFolder,
} from "./namedFolderWorkflows";
import { openFolderContextAtPath, openMarkdownFileAtPath } from "./openSession";
import { confirmWindowClose } from "./windowClose";

vi.mock("@/lib/confirmation", () => ({ requestConfirmation: vi.fn(async () => false) }));

const folder: NamedFolder = {
  id: "personal",
  name: "Personal notes",
  path: TEST_NOTES_FOLDER_PATH,
  windowLabel: null,
  hasUnsavedDrafts: true,
};
let following: Disposable | undefined;

const mocks = (overrides: Record<string, (args: unknown) => unknown> = {}) =>
  mockInvokeCommands({
    list_named_folders: () => ({ revision: 1, folders: [folder] }),
    create_named_folder: () => undefined,
    select_named_folder: () => ({ kind: "selected", session: null }),
    edit_named_folder: () => undefined,
    scan_markdown_folder: () => createFolderContext(),
    inspect_markdown_file: () => ({ kind: "unchanged" }),
    ...overrides,
  });

beforeEach(() => {
  documentEditorBridge.clear();
  vi.mocked(requestConfirmation).mockReset().mockResolvedValue(false);
  mocks();
});
afterEach(() => {
  following ??= followKeptSession();
  following.dispose();
  following = undefined;
  documentEditorBridge.clear();
});

describe("named folder workflows", () => {
  it("registers the current root and flushes latest editor text before naming it", async () => {
    setDefaultSession({
      folderContext: createFolderContext(),
      activeDocument: createSavedDocument({ isDirty: true, content: "Old" }),
    });
    documentEditorBridge.set(
      TEST_MARKDOWN_FILE_PATH,
      createMilkdownEditorBridge({ getSettledMarkdown: () => "Latest unsaved text" }),
    );
    following = followKeptSession();
    expect(await keepNamedFolder(" Personal notes ")).toBe(true);
    expect(getLastInvokeArgs("report_window_session")).toMatchObject({
      snapshots: expect.any(Array),
      contextId: null,
    });
    expect(getLastInvokeArgs("create_named_folder")).toEqual({
      id: expect.any(String),
      name: "Personal notes",
      path: TEST_NOTES_FOLDER_PATH,
    });
    expect(useSessionStore.getState().activeDocument?.isDirty).toBe(true);
    expect(documentEditorBridge.getSettledMarkdown(TEST_MARKDOWN_FILE_PATH)).toBe(
      "Latest unsaved text",
    );
    expect(useNamedFoldersStore.getState().activeId).toBeTruthy();
    expect(countInvokeCalls("save_markdown_file")).toBe(0);
  });

  it("restores distinct dirty saved and untitled tabs in order, retaining their active tab", async () => {
    setDefaultSession({
      folderContext: createFolderContext(),
      documents: [
        createSavedDocument({ isDirty: true, content: "Saved draft" }),
        createUntitledDocument({ id: "untitled:42", isDirty: true, content: "Untitled draft" }),
      ],
    });
    const original = useSessionStore.getState();
    const state = toKeptWindowState(original, (tab) => ({
      snapshotId: tab.document.status === "saved" ? "saved" : "untitled",
      viewState: null,
    }));
    state.activeTabIndex = 1;
    documentEditorBridge.set(
      "untitled:42",
      createMilkdownEditorBridge({ getSettledMarkdown: () => "Previous context editor" }),
    );
    useNamedFoldersStore.setState({ activeId: "studies", folders: [folder] });
    mocks({
      select_named_folder: () => ({
        kind: "selected",
        session: {
          contextId: folder.id,
          state,
          snapshots: { saved: "Restored saved", untitled: "Restored untitled" },
        },
      }),
    });
    following = followKeptSession();
    expect(await activateNamedFolder(folder.id)).toBe(true);
    expect(useSessionStore.getState().tabs.map((tab) => tab.document.content)).toEqual([
      "Restored saved",
      "Restored untitled",
    ]);
    expect(getActiveTab(useSessionStore.getState())?.document.content).toBe("Restored untitled");
    expect(useSessionStore.getState().tabs.every((tab) => tab.document.isDirty)).toBe(true);
    expect(countInvokeCalls("open_markdown_folder")).toBe(0);
    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(await confirmWindowClose({ keepsSession: true })).toBe(true);
    expect(
      getLastInvokeArgs<ReportWindowSessionArgs>("report_window_session").snapshots.map(
        (snapshot) => snapshot.text,
      ),
    ).toContain("Restored untitled");
    expect(
      getLastInvokeArgs<ReportWindowSessionArgs>("report_window_session").snapshots.map(
        (snapshot) => snapshot.text,
      ),
    ).not.toContain("Previous context editor");
  });

  it("failed parking stops the switch and retains the current tabs and editors", async () => {
    const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setDefaultSession({
      activeDocument: createUntitledDocument({ isDirty: true, content: "Do not lose" }),
    });
    const tabs = useSessionStore.getState().tabs;
    useNamedFoldersStore.setState({ activeId: "studies" });
    mocks({
      report_window_session: () => {
        throw { kind: "writeFailed", message: "Disk full" };
      },
    });
    following = followKeptSession();
    expect(await activateNamedFolder(folder.id)).toBe(false);
    expect(countInvokeCalls("select_named_folder")).toBe(0);
    expect(useSessionStore.getState().tabs).toBe(tabs);
    expect(useNamedFoldersStore.getState()).toMatchObject({
      activeId: "studies",
      transitioning: false,
    });
    silence.mockRestore();
  });

  it("resolves an unnamed session before entering a named one", async () => {
    setDefaultSession({ activeDocument: createUntitledDocument({ isDirty: true }) });
    expect(await activateNamedFolder(folder.id)).toBe(false);
    expect(countInvokeCalls("select_named_folder")).toBe(0);
    vi.mocked(requestConfirmation).mockResolvedValue(true);
    expect(await activateNamedFolder(folder.id)).toBe(true);
    expect(useSessionStore.getState().tabs).toEqual([]);
  });

  it("focuses an active context elsewhere without resolving or releasing current work", async () => {
    useNamedFoldersStore.setState({ folders: [{ ...folder, windowLabel: "window-2" }] });
    setDefaultSession({ activeDocument: createUntitledDocument({ isDirty: true }) });
    const tabs = useSessionStore.getState().tabs;
    mocks({ select_named_folder: () => ({ kind: "focused" }) });
    expect(await activateNamedFolder(folder.id)).toBe(true);
    expect(useSessionStore.getState().tabs).toBe(tabs);
    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it("opens a parked context in a new window without parking this window", async () => {
    setDefaultSession({ activeDocument: createUntitledDocument({ isDirty: true }) });
    expect(await activateNamedFolder(folder.id, true)).toBe(true);
    expect(getLastInvokeArgs("select_named_folder")).toEqual({
      id: folder.id,
      newWindow: true,
      documentPath: null,
    });
    expect(useSessionStore.getState().tabs).toHaveLength(1);
    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it("keeps named drafts when closing a secondary window with Restore session off", async () => {
    setDefaultSettings({ restoreSession: false });
    useNamedFoldersStore.setState({ activeId: folder.id });
    setDefaultSession({
      activeDocument: createUntitledDocument({ isDirty: true, content: "Named draft" }),
    });
    following = followKeptSession();
    expect(await confirmWindowClose({ keepsSession: false })).toBe(true);
    expect(getLastInvokeArgs("report_window_session")).toMatchObject({
      contextId: folder.id,
      restoreSession: false,
    });
    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it("retains a named window on failed close persistence and during a transition", async () => {
    const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
    useNamedFoldersStore.setState({ activeId: folder.id });
    mocks({
      report_window_session: () => {
        throw { kind: "writeFailed" };
      },
    });
    following = followKeptSession();
    expect(await confirmWindowClose({ keepsSession: true })).toBe(false);
    useNamedFoldersStore.setState({ transitioning: true });
    expect(await confirmWindowClose({ keepsSession: true })).toBe(false);
    silence.mockRestore();
  });

  it("Close Folder parks a named context without discarding its drafts", async () => {
    useNamedFoldersStore.setState({ activeId: folder.id });
    setDefaultSession({ activeDocument: createUntitledDocument({ isDirty: true }) });
    expect(await closeFolderContext()).toBe(true);
    expect(getLastInvokeArgs("select_named_folder")).toMatchObject({ id: null });
    expect(useNamedFoldersStore.getState().activeId).toBeNull();
    expect(useSessionStore.getState().tabs).toHaveLength(0);
    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it("Open Folder leaves a named context parked and does not rebind it", async () => {
    useNamedFoldersStore.setState({ activeId: folder.id });
    mocks({
      open_markdown_folder: () => ({
        folder: createFolderContext(),
        indexDocument: null,
        indexError: null,
      }),
    });
    expect(await openFolderContextAtPath(TEST_NOTES_FOLDER_PATH)).toBe(true);
    expect(countInvokeCalls("select_named_folder")).toBe(1);
    expect(countInvokeCalls("edit_named_folder")).toBe(0);
    expect(useNamedFoldersStore.getState().activeId).toBeNull();
  });

  it("opening a parked file restores its owner rather than reading a second editable copy", async () => {
    mocks({
      claim_window_document: () => ({ kind: "ownedByContext", contextId: folder.id }),
      select_named_folder: () => ({ kind: "selected", session: null }),
    });
    expect(await openMarkdownFileAtPath(TEST_MARKDOWN_FILE_PATH)).toBe(true);
    expect(getLastInvokeArgs("select_named_folder")).toMatchObject({
      id: folder.id,
      documentPath: TEST_MARKDOWN_FILE_PATH,
    });
    expect(countInvokeCalls("open_markdown_file")).toBe(0);
  });

  it("requires confirmation to remove drafts and passes the confirmed revision", async () => {
    useNamedFoldersStore.setState({ revision: 12 });
    await removeNamedFolder(folder);
    expect(countInvokeCalls("edit_named_folder")).toBe(0);
    vi.mocked(requestConfirmation).mockResolvedValue(true);
    await removeNamedFolder(folder);
    expect(getLastInvokeArgs("edit_named_folder")).toEqual({
      id: folder.id,
      changes: { remove: true, discardUnsaved: true, expectedRevision: 12 },
    });
  });

  it("renames only the display label", async () => {
    await renameNamedFolder(folder.id, "Studies");
    expect(getLastInvokeArgs("edit_named_folder")).toEqual({
      id: folder.id,
      changes: { name: "Studies" },
    });
  });

  it("locating a folder can be cancelled", async () => {
    await locateNamedFolder(folder.id);
    expect(countInvokeCalls("edit_named_folder")).toBe(0);
  });
});
