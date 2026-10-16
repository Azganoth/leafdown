import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  isOpenMarkdownFileError,
  openMarkdownDocument,
  toSavedDocument,
  toUntitledDocument,
  type ActiveDocumentState,
} from "@/features/document";
import { getScanFolderContextErrorMessage, scanFolderContext } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { SequentialTaskQueue } from "@/lib/async";
import { handleUnexpectedError } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { DisposableStore, toDisposable, type Disposable } from "@/lib/lifecycle";
import { getPathParts } from "@/lib/path";
import { notifyError, notifyWarning } from "@/lib/toast";

import {
  getTabDocumentKey,
  useSessionStore,
  type DocumentTab,
  type FolderContextLoad,
  type RestoredTab,
} from "../stores/session";
import {
  getKeptSnapshotIds,
  parseKeptWindowState,
  toKeptWindowState,
  type KeptSavedTab,
  type KeptTab,
} from "../utils/keptWindowState";
import { documentEditorBridge } from "./documentEditorBridge";
import { checkDocumentFile } from "./externalChanges";
import { getSessionFolderScanOptions } from "./folderContextWorkflows";
import {
  clearKeptSession,
  reportWindowSession,
  restoreWindowSession,
  type SnapshotText,
} from "./keptSessionApi";
import { claimDocumentForWindow } from "./windowDocumentClaims";

const SNAPSHOT_INTERVAL_MS = 5_000;
const MAIN_WINDOW_LABEL = "main";

/**
 * Keeps the window's tabs and unsaved text for the next launch. Every few seconds after a change it
 * reports the window to the backend, with a snapshot of each document whose unsaved text changed
 * since its last one. A snapshot reads the editor without dispatching, so an edit in progress goes
 * on.
 */
class KeptSessionReporter {
  /** The snapshot holding each dirty tab's unsaved text, by tab id. */
  private readonly snapshotIds = new Map<string, string>();
  /** Tabs edited since their last snapshot was written. */
  private readonly edited = new Set<string>();
  private readonly queue = new SequentialTaskQueue();
  private changed = true;
  private failureReported = false;
  private running: Disposable | null = null;

  get isRunning() {
    return this.running !== null;
  }

  start() {
    if (this.running) {
      return;
    }

    const disposables = new DisposableStore();

    disposables.add(
      toDisposable(
        useSessionStore.subscribe(() => {
          this.changed = true;
        }),
      ),
    );
    disposables.add(
      documentEditorBridge.onDidChangeContent((documentKey) => {
        const tab = useSessionStore
          .getState()
          .tabs.find((candidate) => getTabDocumentKey(candidate) === documentKey);

        if (tab) {
          this.edited.add(tab.id);
          this.changed = true;
        }
      }),
    );

    const interval = setInterval(() => void this.report(), SNAPSHOT_INTERVAL_MS);

    disposables.add(toDisposable(() => clearInterval(interval)));
    this.changed = true;
    this.running = disposables;
    void this.report();
  }

  /** Forgets every snapshot, since what was kept is let go or belongs to a window no longer here. */
  stop() {
    this.running?.dispose();
    this.running = null;
    this.snapshotIds.clear();
    this.edited.clear();
    this.failureReported = false;
  }

  /** Counts the restored tabs' snapshots as written, so unchanged text is not sent again. */
  adopt(snapshotIds: ReadonlyMap<string, string>) {
    for (const [tabId, snapshotId] of snapshotIds) {
      this.snapshotIds.set(tabId, snapshotId);
    }
  }

  /** Reports the window now, whether or not anything changed, and resolves whether it was kept. */
  flush() {
    this.changed = true;

    return this.report();
  }

  private report() {
    return this.queue.run(async () => {
      if (!this.running || !this.changed) {
        return this.running !== null;
      }

      this.changed = false;

      const snapshots: SnapshotText[] = [];
      const snapshotTabIds: string[] = [];
      const session = useSessionStore.getState();
      const openTabIds = new Set(session.tabs.map((tab) => tab.id));

      for (const tabId of [...this.snapshotIds.keys(), ...this.edited]) {
        if (!openTabIds.has(tabId)) {
          this.snapshotIds.delete(tabId);
          this.edited.delete(tabId);
        }
      }

      try {
        const state = toKeptWindowState(session, (tab) => {
          const documentKey = getTabDocumentKey(tab);
          const viewState = documentEditorBridge.getViewState(documentKey) ?? tab.viewState;

          if (!tab.document.isDirty) {
            this.snapshotIds.delete(tab.id);
            this.edited.delete(tab.id);

            return { snapshotId: null, viewState };
          }

          let snapshotId = this.snapshotIds.get(tab.id);

          if (!snapshotId || this.edited.has(tab.id)) {
            snapshotId ??= crypto.randomUUID();
            snapshotTabIds.push(tab.id);
            this.snapshotIds.set(tab.id, snapshotId);
            this.edited.delete(tab.id);
            snapshots.push({ id: snapshotId, text: readUnsavedText(tab) });
          }

          return { snapshotId, viewState };
        });

        await reportWindowSession({
          session: { state, snapshotIds: getKeptSnapshotIds(state) },
          snapshots,
        });
      } catch (error) {
        this.changed = true;

        for (const tabId of snapshotTabIds) {
          this.edited.add(tabId);
        }

        this.reportFailure(error);

        return false;
      }

      this.failureReported = false;

      return true;
    });
  }

  private reportFailure(error: unknown) {
    handleUnexpectedError(error, "reportWindowSession");

    if (this.failureReported) {
      return;
    }

    this.failureReported = true;
    notifyWarning({
      title: t("session.keepSession.failed.title"),
      description: t("session.keepSession.failed.description"),
    });
  }
}

const reporter = new KeptSessionReporter();

const readUnsavedText = (tab: DocumentTab) =>
  documentEditorBridge.getSettledMarkdown(getTabDocumentKey(tab)) ?? tab.document.content;

const applyRestoreSessionSetting = (restoreSession: boolean) => {
  if (restoreSession) {
    reporter.start();
    return;
  }

  if (reporter.isRunning) {
    reporter.stop();
    clearKeptSession().catch((error) => handleUnexpectedError(error, "clearKeptSession"));
  }
};

/**
 * Keeps the window's tabs and unsaved text while `Restore session` is on, and lets the kept session
 * go when it is turned off.
 */
export const followKeptSession = (): Disposable => {
  applyRestoreSessionSetting(useSettingsStore.getState().restoreSession);

  const unsubscribe = useSettingsStore.subscribe((state, previous) => {
    if (state.restoreSession !== previous.restoreSession) {
      applyRestoreSessionSetting(state.restoreSession);
    }
  });

  return toDisposable(() => {
    unsubscribe();
    reporter.stop();
  });
};

/**
 * Takes a final snapshot of the window as it closes for good, so its unsaved documents need not be
 * asked about. Resolves `false` when nothing could be kept, and the window asks as usual.
 */
export const keepWindowSession = () =>
  useSettingsStore.getState().restoreSession && reporter.isRunning
    ? reporter.flush()
    : Promise.resolve(false);

/**
 * Reopens the tabs this window held when the session was last kept. With `Restore session` off,
 * the first window lets any kept session go instead.
 */
export const restoreKeptWindowSession = async () => {
  if (!useSettingsStore.getState().restoreSession) {
    if (getCurrentWindow().label === MAIN_WINDOW_LABEL) {
      await clearKeptSession();
    }

    return;
  }

  const restored = await restoreWindowSession();
  const state = restored && parseKeptWindowState(restored.state);

  if (!restored || !state) {
    return;
  }

  const restoredTabs: (RestoredTab & { snapshotId: string | null; claim: Disposable | null })[] =
    [];
  let activeIndex: number | null = null;

  for (const [index, tab] of state.tabs.entries()) {
    const restoredTab = await restoreTab(tab, restored.snapshots);

    if (!restoredTab) {
      continue;
    }

    if (index === state.activeTabIndex) {
      activeIndex = restoredTabs.length;
    }

    restoredTabs.push(restoredTab);
  }

  try {
    const { tabs, folderContextLoad } = useSessionStore
      .getState()
      .restoreTabs(restoredTabs, activeIndex, state.folderPath);

    reporter.adopt(
      new Map(
        tabs.flatMap((tab, index) => {
          const { snapshotId } = restoredTabs[index];

          return snapshotId ? [[tab.id, snapshotId] as const] : [];
        }),
      ),
    );

    for (const tab of tabs) {
      if (tab.document.status === "saved" && tab.document.isDirty) {
        void checkDocumentFile(tab.document.path);
      }
    }

    if (folderContextLoad) {
      void loadRestoredFolderContext(folderContextLoad);
    }
  } finally {
    for (const { claim } of restoredTabs) {
      claim?.dispose();
    }
  }
};

const restoreTab = async (tab: KeptTab, snapshots: Readonly<Record<string, string>>) => {
  const text = tab.snapshotId === null ? undefined : snapshots[tab.snapshotId];

  if (tab.kind === "untitled") {
    if (tab.isDirty && text === undefined) {
      return null;
    }

    return {
      document: toUntitledDocument({
        id: tab.id,
        content: text ?? "",
        lineEnding: tab.lineEnding,
        encoding: tab.encoding,
        isDirty: tab.isDirty,
      }),
      preview: false,
      viewState: tab.viewState,
      snapshotId: tab.isDirty ? tab.snapshotId : null,
      claim: null,
    };
  }

  const claim = await claimDocumentForWindow(tab.path, { activate: false });

  if (!claim) {
    return null;
  }

  const document =
    tab.isDirty && text !== undefined
      ? toUnsavedDocument(tab, text)
      : await reopenSavedDocument(tab, tab.isDirty);

  if (!document) {
    claim.dispose();

    return null;
  }

  return {
    document,
    preview: tab.preview && !document.isDirty,
    viewState: tab.viewState,
    snapshotId: document.isDirty ? tab.snapshotId : null,
    claim,
  };
};

/** The document with its kept unsaved text, based on the version of the file it was kept with. */
const toUnsavedDocument = (tab: KeptSavedTab, text: string): ActiveDocumentState => ({
  ...toSavedDocument({
    path: tab.path,
    content: text,
    lineEnding: tab.lineEnding,
    encoding: tab.encoding,
    metadata: tab.metadata,
    fingerprint: tab.fingerprint,
    isDirty: true,
  }),
  fileEncoding: tab.fileEncoding,
});

/**
 * Reads a clean document's file again in the encoding it was read in. A file that is gone is not
 * restored; neither is a document whose unsaved text was lost, which is reported.
 */
const reopenSavedDocument = async (tab: KeptSavedTab, unsavedTextLost: boolean) => {
  if (unsavedTextLost) {
    notifyError({
      title: t("session.keepSession.textLost.title"),
      description: t("session.keepSession.textLost.description", {
        name: getPathParts(tab.path).name,
      }),
    });
  }

  try {
    const { parentFolderPath: _parentFolderPath, ...documentFields } = await openMarkdownDocument(
      tab.path,
      undefined,
      tab.fileEncoding.name,
    );

    return toSavedDocument(documentFields);
  } catch (error) {
    if (!isOpenMarkdownFileError(error)) {
      handleUnexpectedError(error, "restoreKeptTab");
    }

    return null;
  }
};

const loadRestoredFolderContext = async ({ id, path }: FolderContextLoad) => {
  try {
    const folderContext = await scanFolderContext(path, getSessionFolderScanOptions());

    useSessionStore.getState().finishFolderContextLoad(id, folderContext);
  } catch (error) {
    if (useSessionStore.getState().abandonFolderContextLoad(id)) {
      notifyError(getScanFolderContextErrorMessage(error));
    }
  }
};
