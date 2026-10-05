import type {
  DocumentReplacementPlan,
  DocumentSearchMatches,
  EditorDocumentStatus,
  EditorViewState,
  MilkdownEditorBridge,
  SearchMatchTarget,
  TextSearchQuery,
} from "@/features/editor";
import {
  INACTIVE_EDITOR_COMMAND_STATE,
  READY_DISABLED_EDITOR_COMMAND_STATE,
  type EditorCommandId,
  type EditorCommandState,
} from "@/features/editor/commands/contract";
import { isSamePath } from "@/lib/path";
import { SignalSource } from "@/lib/signal";

interface ActiveDocumentEditorBridgeEntry {
  bridge: MilkdownEditorBridge;
  documentKey: string;
}

interface PendingSearchMatch {
  documentKey: string;
  query: TextSearchQuery;
  target: SearchMatchTarget;
  resolve: (ordinal: number | null) => void;
}

class DocumentEditorBridgeStore {
  private activeBridgeEntry: ActiveDocumentEditorBridgeEntry | null = null;
  private pendingHeading: { documentKey: string; heading: string } | null = null;
  private pendingSearchMatch: PendingSearchMatch | null = null;
  private readonly commandStateChanged = new SignalSource();
  private readonly documentStatusChanged = new SignalSource();

  readonly onDidChangeCommandState = this.commandStateChanged.signal;
  readonly onDidChangeDocumentStatus = this.documentStatusChanged.signal;

  set = (documentKey: string, bridge: MilkdownEditorBridge | null) => {
    if (!bridge) {
      if (this.activeBridgeEntry?.documentKey === documentKey) {
        this.activeBridgeEntry = null;
        this.fireCommandStateChanged();
        this.fireDocumentStatusChanged();
      }

      return;
    }

    this.activeBridgeEntry = { bridge, documentKey };
    if (this.pendingHeading && isSamePath(this.pendingHeading.documentKey, documentKey)) {
      bridge.navigateToHeading?.(this.pendingHeading.heading);
      this.pendingHeading = null;
    }
    this.settlePendingSearchMatch(documentKey, bridge);
    this.fireCommandStateChanged();
    this.fireDocumentStatusChanged();
  };

  getMarkdown = (documentKey: string) => {
    if (this.activeBridgeEntry?.documentKey !== documentKey) {
      return null;
    }

    return this.activeBridgeEntry.bridge.getMarkdown();
  };

  getHtmlExportSnapshot = (documentKey: string) =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.getHtmlExportSnapshot?.() ?? null)
      : null;

  getCommandState = (documentKey: string): EditorCommandState =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.getCommandState?.() ?? READY_DISABLED_EDITOR_COMMAND_STATE)
      : INACTIVE_EDITOR_COMMAND_STATE;

  getDocumentStatus = (documentKey: string): EditorDocumentStatus | null =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.getDocumentStatus?.() ?? null)
      : null;

  getViewState = (documentKey: string): EditorViewState | null =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.getViewState?.() ?? null)
      : null;

  navigateToOutlineHeading = (documentKey: string, position: number) =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.navigateToOutlineHeading?.(position) ?? false)
      : false;

  insertLink = (documentKey: string, label: string, target: string) => {
    if (this.activeBridgeEntry?.documentKey !== documentKey) {
      return false;
    }

    return this.activeBridgeEntry.bridge.insertLink?.(label, target) ?? false;
  };

  requestHeading = (documentKey: string, heading: string) => {
    if (this.activeBridgeEntry && isSamePath(this.activeBridgeEntry.documentKey, documentKey)) {
      this.activeBridgeEntry.bridge.navigateToHeading?.(heading);
      return;
    }
    this.pendingHeading = { documentKey, heading };
  };

  readSearchMatches = (
    documentKey: string,
    query: TextSearchQuery,
    options: { finalizeProjection: boolean },
  ): DocumentSearchMatches | null =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.readSearchMatches?.(query, options) ?? null)
      : null;

  planSearchReplacement = (
    documentKey: string,
    query: TextSearchQuery,
    replacement: string,
  ): DocumentReplacementPlan | null =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.planSearchReplacement?.(query, replacement) ?? null)
      : null;

  applySearchReplacement = (
    documentKey: string,
    query: TextSearchQuery,
    replacement: string,
    baseline: string,
  ): number | null =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.applySearchReplacement?.(query, replacement, baseline) ??
        null)
      : null;

  /**
   * Chooses a match in the document once its editor is ready, which may be after the document was
   * just opened. Resolves to the match's place, or `null` when it is gone or another document took
   * the editor first.
   */
  chooseSearchMatch = (
    documentKey: string,
    query: TextSearchQuery,
    target: SearchMatchTarget,
  ): Promise<number | null> => {
    this.pendingSearchMatch?.resolve(null);
    this.pendingSearchMatch = null;

    if (this.activeBridgeEntry && isSamePath(this.activeBridgeEntry.documentKey, documentKey)) {
      return (
        this.activeBridgeEntry.bridge.chooseSearchMatch?.(query, target) ?? Promise.resolve(null)
      );
    }

    return new Promise((resolve) => {
      this.pendingSearchMatch = { documentKey, query, target, resolve };
    });
  };

  focusChosenSearchMatch = (documentKey: string) => {
    if (this.activeBridgeEntry?.documentKey !== documentKey) {
      return false;
    }

    this.activeBridgeEntry.bridge.focusChosenSearchMatch?.();

    return true;
  };

  runCommand = (documentKey: string, commandId: EditorCommandId) => {
    if (this.activeBridgeEntry?.documentKey !== documentKey) {
      return false;
    }

    return this.activeBridgeEntry.bridge.runCommand?.(commandId) ?? false;
  };

  clear = () => {
    this.activeBridgeEntry = null;
    this.pendingHeading = null;
    this.pendingSearchMatch?.resolve(null);
    this.pendingSearchMatch = null;
    this.fireCommandStateChanged();
    this.fireDocumentStatusChanged();
  };

  private settlePendingSearchMatch(documentKey: string, bridge: MilkdownEditorBridge) {
    const pending = this.pendingSearchMatch;

    if (!pending) {
      return;
    }

    this.pendingSearchMatch = null;

    if (!isSamePath(pending.documentKey, documentKey) || !bridge.chooseSearchMatch) {
      pending.resolve(null);
      return;
    }

    void bridge
      .chooseSearchMatch(pending.query, pending.target)
      .then(pending.resolve, () => pending.resolve(null));
  }

  fireCommandStateChanged = () => {
    this.commandStateChanged.notify();
  };

  fireDocumentStatusChanged = () => {
    this.documentStatusChanged.notify();
  };
}

export const documentEditorBridge = new DocumentEditorBridgeStore();
