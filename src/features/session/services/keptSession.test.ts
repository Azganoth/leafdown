import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MilkdownEditorBridge } from "@/features/editor";
import { useSettingsStore } from "@/features/preferences";
import type { Disposable } from "@/lib/lifecycle";
import { toastManager } from "@/lib/toast";
import {
  createFileMetadata,
  createOpenedMarkdownDocument,
  createSavedDocument,
  createUntitledDocument,
  TEST_FILE_FINGERPRINT,
} from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { createFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { getActiveTab, useSessionStore } from "../stores/session";
import type { KeptSavedTab, KeptUntitledTab, KeptWindowState } from "../utils/keptWindowState";
import { documentEditorBridge } from "./documentEditorBridge";
import { followKeptSession, keepWindowSession, restoreKeptWindowSession } from "./keptSession";
import type { ReportWindowSessionArgs, RestoredWindowSession } from "./keptSessionApi";

const OTHER_MARKDOWN_PATH = `${TEST_NOTES_FOLDER_PATH}/plan.md`;
const KEPT_METADATA = createFileMetadata({ sizeBytes: 12 });

const keptSavedTab = (overrides: Partial<KeptSavedTab> = {}): KeptSavedTab => ({
  kind: "saved",
  path: TEST_MARKDOWN_FILE_PATH,
  snapshotId: null,
  isDirty: false,
  preview: false,
  lineEnding: "lf",
  encoding: { name: "UTF-8", bom: false },
  fileEncoding: { name: "UTF-8", bom: false },
  metadata: KEPT_METADATA,
  fingerprint: TEST_FILE_FINGERPRINT,
  viewState: null,
  ...overrides,
});

const keptUntitledTab = (overrides: Partial<KeptUntitledTab> = {}): KeptUntitledTab => ({
  kind: "untitled",
  id: "untitled:1",
  snapshotId: null,
  isDirty: false,
  lineEnding: "lf",
  encoding: { name: "UTF-8", bom: false },
  viewState: null,
  ...overrides,
});

const keptWindow = (
  overrides: Partial<KeptWindowState> = {},
  snapshots: Record<string, string> = {},
): RestoredWindowSession => ({
  state: {
    version: 1,
    folderPath: null,
    activeTabIndex: 0,
    tabs: [],
    ...overrides,
  } satisfies KeptWindowState,
  snapshots,
});

const editorWithText = (
  text: () => string,
  overrides: Partial<MilkdownEditorBridge> = {},
): MilkdownEditorBridge => createMilkdownEditorBridge({ getSettledMarkdown: text, ...overrides });

describe("kept session", () => {
  let following: Disposable | null = null;

  const follow = () => {
    following = followKeptSession();
  };

  beforeEach(() => {
    documentEditorBridge.clear();
    setDefaultSettings();
  });

  afterEach(() => {
    following?.dispose();
    following = null;
  });

  describe("restoreKeptWindowSession", () => {
    it("reopens the kept tabs with their unsaved text, active tab, and folder", async () => {
      const folderContext = createFolderContext();
      mockTauriApi({
        restoreWindowSession: () =>
          keptWindow(
            {
              folderPath: TEST_NOTES_FOLDER_PATH,
              activeTabIndex: 1,
              tabs: [
                keptSavedTab({ preview: true, viewState: { anchor: 3, head: 3, focused: false } }),
                keptSavedTab({ path: OTHER_MARKDOWN_PATH, snapshotId: "plan", isDirty: true }),
                keptUntitledTab({ id: "untitled:2", snapshotId: "draft", isDirty: true }),
              ],
            },
            { plan: "# Plan, edited\n", draft: "Draft text" },
          ),
        openMarkdownFile: () => createOpenedMarkdownDocument({ content: "# On disk\n" }),
        inspectMarkdownFile: () => ({ kind: "unchanged" }),
        scanMarkdownFolder: () => folderContext,
      });

      await restoreKeptWindowSession();

      const { tabs } = useSessionStore.getState();

      expect(
        tabs.map(({ document, preview, viewState }) => ({ document, preview, viewState })),
      ).toMatchObject([
        {
          document: { status: "saved", content: "# On disk\n", isDirty: false },
          preview: true,
          viewState: { anchor: 3, head: 3, focused: false },
        },
        {
          document: {
            status: "saved",
            path: OTHER_MARKDOWN_PATH,
            content: "# Plan, edited\n",
            isDirty: true,
            metadata: KEPT_METADATA,
            fingerprint: TEST_FILE_FINGERPRINT,
          },
          preview: false,
        },
        {
          document: { status: "untitled", id: "untitled:2", content: "Draft text", isDirty: true },
        },
      ]);
      expect(getActiveTab(useSessionStore.getState())?.id).toBe(tabs[1].id);
      expect(getLastTauriApiArgs("inspectMarkdownFile")).toEqual({
        path: OTHER_MARKDOWN_PATH,
        metadata: KEPT_METADATA,
        fingerprint: TEST_FILE_FINGERPRINT,
      });
      await vi.waitFor(() =>
        expect(useSessionStore.getState().folderContext).toEqual(folderContext),
      );
      expect(toastManager.add).not.toHaveBeenCalled();
    });

    it("keeps the unsaved text of a document whose file changed between runs and warns once", async () => {
      mockTauriApi({
        restoreWindowSession: () =>
          keptWindow({ tabs: [keptSavedTab({ snapshotId: "a", isDirty: true })] }, { a: "Mine" }),
        inspectMarkdownFile: () => ({
          kind: "contentChanged",
          metadata: createFileMetadata({ sizeBytes: 99 }),
          fingerprint: "changed",
        }),
      });

      await restoreKeptWindowSession();

      await vi.waitFor(() =>
        expect(useSessionStore.getState().activeDocument).toMatchObject({
          content: "Mine",
          isDirty: true,
          externalChange: { kind: "modified", fingerprint: "changed" },
        }),
      );
      expect(toastManager.add).not.toHaveBeenCalled();
    });

    it("accepts a file touched between runs without warning", async () => {
      const touchedMetadata = createFileMetadata({ modifiedAtUnixMs: 1_900_000_000_000 });
      mockTauriApi({
        restoreWindowSession: () =>
          keptWindow({ tabs: [keptSavedTab({ snapshotId: "a", isDirty: true })] }, { a: "Mine" }),
        inspectMarkdownFile: () => ({ kind: "metadataChanged", metadata: touchedMetadata }),
      });

      await restoreKeptWindowSession();

      await vi.waitFor(() =>
        expect(useSessionStore.getState().activeDocument).toMatchObject({
          metadata: touchedMetadata,
          externalChange: null,
          isDirty: true,
        }),
      );
      expect(toastManager.add).not.toHaveBeenCalled();
    });

    it("keeps the unsaved text of a document whose file went missing between runs", async () => {
      mockTauriApi({
        restoreWindowSession: () =>
          keptWindow({ tabs: [keptSavedTab({ snapshotId: "a", isDirty: true })] }, { a: "Mine" }),
        inspectMarkdownFile: () => ({ kind: "missing" }),
      });

      await restoreKeptWindowSession();

      await vi.waitFor(() =>
        expect(useSessionStore.getState().activeDocument).toMatchObject({
          content: "Mine",
          externalChange: { kind: "missing" },
        }),
      );
      expect(toastManager.add).not.toHaveBeenCalled();
    });

    it("leaves out a clean document whose file is gone and an untitled one whose text is lost", async () => {
      mockTauriApi({
        restoreWindowSession: () =>
          keptWindow({
            tabs: [
              keptSavedTab(),
              keptUntitledTab({ snapshotId: "lost", isDirty: true }),
              keptUntitledTab({ id: "untitled:2" }),
            ],
          }),
        openMarkdownFile: () => {
          throw { kind: "missingFile", path: TEST_MARKDOWN_FILE_PATH };
        },
      });

      await restoreKeptWindowSession();

      expect(useSessionStore.getState().tabs.map((tab) => tab.document)).toMatchObject([
        { status: "untitled", id: "untitled:2", content: "", isDirty: false },
      ]);
    });

    it("reopens a document as saved and says so when its unsaved text cannot be read", async () => {
      mockTauriApi({
        restoreWindowSession: () =>
          keptWindow({ tabs: [keptSavedTab({ snapshotId: "lost", isDirty: true })] }),
        openMarkdownFile: () => createOpenedMarkdownDocument({ content: "# On disk\n" }),
      });

      await restoreKeptWindowSession();

      expect(useSessionStore.getState().activeDocument).toMatchObject({
        content: "# On disk\n",
        isDirty: false,
      });
      expect(toastManager.add).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 0,
          title: "Unsaved changes lost",
          description: 'The unsaved changes kept for "readme.md" could not be read.',
        }),
      );
    });

    it("reopens a clean document in the encoding it was read in", async () => {
      const windows1252 = { name: "windows-1252", bom: false } as const;
      mockTauriApi({
        restoreWindowSession: () =>
          keptWindow({
            tabs: [keptSavedTab({ encoding: windows1252, fileEncoding: windows1252 })],
          }),
        openMarkdownFile: () => createOpenedMarkdownDocument({ encoding: windows1252 }),
      });

      await restoreKeptWindowSession();

      expect(getLastTauriApiArgs("openMarkdownFile")).toEqual({
        path: TEST_MARKDOWN_FILE_PATH,
        encoding: "windows-1252",
      });
    });

    it("opens each kept tab once when the window restores again before the first finishes", async () => {
      mockTauriApi({
        restoreWindowSession: () =>
          keptWindow(
            {
              activeTabIndex: 1,
              tabs: [
                keptSavedTab(),
                keptUntitledTab({ id: "untitled:2", snapshotId: "draft", isDirty: true }),
              ],
            },
            { draft: "Draft text" },
          ),
        openMarkdownFile: () => createOpenedMarkdownDocument(),
      });

      await Promise.all([restoreKeptWindowSession(), restoreKeptWindowSession()]);

      const state = useSessionStore.getState();

      expect(state.tabs.map((tab) => tab.document)).toMatchObject([
        { status: "saved", path: TEST_MARKDOWN_FILE_PATH },
        { status: "untitled", id: "untitled:2", content: "Draft text" },
      ]);
      expect(getActiveTab(state)?.id).toBe(state.tabs[1].id);
    });

    it("opens a document kept in more than one tab once, active when any of its tabs was", async () => {
      mockTauriApi({
        restoreWindowSession: () =>
          keptWindow(
            {
              activeTabIndex: 2,
              tabs: [
                keptSavedTab(),
                keptUntitledTab({ snapshotId: "draft", isDirty: true }),
                keptSavedTab(),
                keptUntitledTab({ snapshotId: "draft", isDirty: true }),
              ],
            },
            { draft: "Draft text" },
          ),
        openMarkdownFile: () => createOpenedMarkdownDocument(),
      });

      await restoreKeptWindowSession();

      const state = useSessionStore.getState();

      expect(state.tabs.map((tab) => tab.document)).toMatchObject([
        { status: "saved", path: TEST_MARKDOWN_FILE_PATH },
        { status: "untitled", id: "untitled:1", content: "Draft text" },
      ]);
      expect(getActiveTab(state)?.id).toBe(state.tabs[0].id);
    });

    it("leaves out a document another window already holds", async () => {
      mockTauriApi({
        restoreWindowSession: () => keptWindow({ tabs: [keptSavedTab()] }),
        claimWindowDocument: () => ({ kind: "openElsewhere" }),
      });

      await restoreKeptWindowSession();

      expect(useSessionStore.getState().tabs).toEqual([]);
      expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
    });

    it("drops kept tabs it cannot read and restores nothing from a state it cannot read", async () => {
      mockTauriApi({
        restoreWindowSession: () => ({
          state: { version: 1, folderPath: null, activeTabIndex: 0, tabs: [{ kind: "saved" }] },
          snapshots: {},
        }),
      });

      await restoreKeptWindowSession();

      expect(useSessionStore.getState().tabs).toEqual([]);

      mockTauriApi({ restoreWindowSession: () => ({ state: { version: 9 }, snapshots: {} }) });

      await restoreKeptWindowSession();

      expect(useSessionStore.getState().tabs).toEqual([]);
    });

    it("lets the kept session go instead while Restore session is off", async () => {
      setDefaultSettings({ restoreSession: false });
      mockTauriApi({ clearKeptSession: () => undefined });

      await restoreKeptWindowSession();

      expect(countTauriApiCalls("clearKeptSession")).toBe(1);
      expect(countTauriApiCalls("restoreWindowSession")).toBe(0);
    });
  });

  describe("followKeptSession", () => {
    const captureReports = () => {
      const reports: ReportWindowSessionArgs[] = [];

      mockTauriApi({
        reportWindowSession: (args) => {
          reports.push(args);
        },
      });

      return reports;
    };

    it("snapshots unsaved text without finalizing the edit in progress, and only once it changes", async () => {
      const reports = captureReports();
      let text = "First";
      const getMarkdown = vi.fn(() => text);
      setDefaultSession({ activeDocument: createSavedDocument({ isDirty: true }) });
      documentEditorBridge.set(
        TEST_MARKDOWN_FILE_PATH,
        editorWithText(() => text, { getMarkdown }),
      );

      follow();

      await vi.waitFor(() => expect(reports).toHaveLength(1));
      expect(reports[0].snapshots).toEqual([{ id: expect.any(String), text: "First" }]);
      expect(reports[0].session.snapshotIds).toEqual([reports[0].snapshots[0].id]);

      await keepWindowSession();

      expect(reports[1].snapshots).toEqual([]);

      text = "Second";
      documentEditorBridge.fireContentChanged(TEST_MARKDOWN_FILE_PATH);
      await keepWindowSession();

      expect(reports[2].snapshots).toEqual([{ id: expect.any(String), text: "Second" }]);
      expect(reports[2].snapshots[0].id).not.toBe(reports[0].snapshots[0].id);
      expect(getMarkdown).not.toHaveBeenCalled();
    });

    it("keeps no snapshot for a clean document", async () => {
      const reports = captureReports();
      setDefaultSession({ documents: [createSavedDocument(), createUntitledDocument()] });

      follow();

      await vi.waitFor(() => expect(reports).toHaveLength(1));
      expect(reports[0]).toEqual({
        contextId: null,
        restoreSession: true,
        session: {
          state: expect.objectContaining({
            tabs: [
              expect.objectContaining({ kind: "saved", snapshotId: null }),
              expect.objectContaining({ kind: "untitled", snapshotId: null }),
            ],
          }),
          snapshotIds: [],
        },
        snapshots: [],
      });
    });

    it("does not send a restored document's unchanged text again", async () => {
      const reports: ReportWindowSessionArgs[] = [];
      mockTauriApi({
        restoreWindowSession: () =>
          keptWindow(
            { tabs: [keptUntitledTab({ snapshotId: "kept", isDirty: true })] },
            {
              kept: "Kept",
            },
          ),
        reportWindowSession: (args) => {
          reports.push(args);
        },
      });

      await restoreKeptWindowSession();
      follow();

      await vi.waitFor(() => expect(reports).toHaveLength(1));
      expect(reports[0].session.snapshotIds).toEqual(["kept"]);
      expect(reports[0].snapshots).toEqual([]);
    });

    it("reports a failure to keep the session once until a report succeeds", async () => {
      let fail = true;
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockTauriApi({
        reportWindowSession: () => {
          if (fail) {
            throw { kind: "writeFailed", message: "Disk full." };
          }
        },
      });
      setDefaultSession({ activeDocument: createUntitledDocument({ isDirty: true }) });

      try {
        follow();

        await vi.waitFor(() => expect(countTauriApiCalls("reportWindowSession")).toBe(1));
        expect(await keepWindowSession()).toBe(false);
        expect(toastManager.add).toHaveBeenCalledOnce();
        expect(toastManager.add).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Unsaved changes not kept", timeout: 0 }),
        );

        fail = false;

        expect(await keepWindowSession()).toBe(true);
        expect(getLastTauriApiArgs("reportWindowSession").snapshots).toEqual([
          { id: expect.any(String), text: "Draft" },
        ]);
      } finally {
        consoleError.mockRestore();
      }
    });

    it("lets the kept session go and stops keeping it when Restore session is turned off", async () => {
      captureReports();
      mockTauriApi({ reportWindowSession: () => undefined, clearKeptSession: () => undefined });
      setDefaultSession({ activeDocument: createUntitledDocument({ isDirty: true }) });

      follow();
      await vi.waitFor(() => expect(countTauriApiCalls("reportWindowSession")).toBe(1));

      useSettingsStore.getState().updateSetting("restoreSession", false);

      expect(countTauriApiCalls("clearKeptSession")).toBe(1);
      expect(await keepWindowSession()).toBe(false);
      expect(countTauriApiCalls("reportWindowSession")).toBe(1);
    });
  });
});
