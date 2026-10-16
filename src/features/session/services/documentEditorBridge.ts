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
import { isSameNullablePath, isSamePath, PathMap } from "@/lib/path";
import { SignalSource } from "@/lib/signal";

interface PendingSearchMatch {
  documentKey: string;
  query: TextSearchQuery;
  target: SearchMatchTarget;
  resolve: (ordinal: number | null) => void;
}

/**
 * Holds the editor of every open document by document key. Every tab keeps its editor mounted, so
 * text can be read from any of them, while requests that scroll or focus wait until their
 * document's editor is the one shown.
 */
class DocumentEditorBridgeStore {
  private readonly bridges = new PathMap<MilkdownEditorBridge>();
  private shownDocumentKey: string | null = null;
  private pendingFocus: string | null = null;
  private pendingHeading: { documentKey: string; heading: string } | null = null;
  private pendingSearchMatch: PendingSearchMatch | null = null;
  private readonly commandStateChanged = new SignalSource();
  private readonly documentStatusChanged = new SignalSource();
  private readonly contentChanged = new SignalSource<string>();

  readonly onDidChangeCommandState = this.commandStateChanged.signal;
  readonly onDidChangeDocumentStatus = this.documentStatusChanged.signal;
  /** Fires with the document's key on each edit, without reading the editor's text. */
  readonly onDidChangeContent = this.contentChanged.signal;

  set = (documentKey: string, bridge: MilkdownEditorBridge | null) => {
    if (!bridge) {
      if (this.bridges.delete(documentKey)) {
        this.fireCommandStateChanged();
        this.fireDocumentStatusChanged();
      }

      return;
    }

    this.bridges.set(documentKey, bridge);
    this.settlePendingRequests();
    this.fireCommandStateChanged();
    this.fireDocumentStatusChanged();
  };

  /**
   * Names the document whose editor is on screen. A request waiting for another document is
   * dropped, since that document was not the one shown next.
   */
  show = (documentKey: string) => {
    this.shownDocumentKey = documentKey;

    if (this.pendingFocus !== null && !isSamePath(this.pendingFocus, documentKey)) {
      this.pendingFocus = null;
    }

    if (this.pendingHeading && !isSamePath(this.pendingHeading.documentKey, documentKey)) {
      this.pendingHeading = null;
    }

    if (this.pendingSearchMatch && !isSamePath(this.pendingSearchMatch.documentKey, documentKey)) {
      this.pendingSearchMatch.resolve(null);
      this.pendingSearchMatch = null;
    }

    this.settlePendingRequests();
  };

  getMarkdown = (documentKey: string) => this.bridges.get(documentKey)?.getMarkdown() ?? null;

  getSettledMarkdown = (documentKey: string) =>
    this.bridges.get(documentKey)?.getSettledMarkdown?.() ?? null;

  getHtmlExportSnapshot = (documentKey: string) =>
    this.bridges.get(documentKey)?.getHtmlExportSnapshot?.() ?? null;

  getCommandState = (documentKey: string): EditorCommandState => {
    const bridge = this.bridges.get(documentKey);

    return bridge
      ? (bridge.getCommandState?.() ?? READY_DISABLED_EDITOR_COMMAND_STATE)
      : INACTIVE_EDITOR_COMMAND_STATE;
  };

  getDocumentStatus = (documentKey: string): EditorDocumentStatus | null =>
    this.bridges.get(documentKey)?.getDocumentStatus?.() ?? null;

  getViewState = (documentKey: string): EditorViewState | null =>
    this.bridges.get(documentKey)?.getViewState?.() ?? null;

  /** Focuses the document's editor once it is shown, as it is after switching to its tab. */
  focusWhenShown = (documentKey: string) => {
    this.pendingFocus = documentKey;
    this.settlePendingRequests();
  };

  navigateToOutlineHeading = (documentKey: string, position: number) =>
    this.bridges.get(documentKey)?.navigateToOutlineHeading?.(position) ?? false;

  insertLink = (documentKey: string, label: string, target: string) =>
    this.bridges.get(documentKey)?.insertLink?.(label, target) ?? false;

  requestHeading = (documentKey: string, heading: string) => {
    this.pendingHeading = { documentKey, heading };
    this.settlePendingRequests();
  };

  readSearchMatches = (
    documentKey: string,
    query: TextSearchQuery,
    options: { finalizeProjection: boolean },
  ): DocumentSearchMatches | null =>
    this.bridges.get(documentKey)?.readSearchMatches?.(query, options) ?? null;

  planSearchReplacement = (
    documentKey: string,
    query: TextSearchQuery,
    replacement: string,
  ): DocumentReplacementPlan | null =>
    this.bridges.get(documentKey)?.planSearchReplacement?.(query, replacement) ?? null;

  applySearchReplacement = (
    documentKey: string,
    query: TextSearchQuery,
    replacement: string,
    baseline: string,
  ): number | null =>
    this.bridges.get(documentKey)?.applySearchReplacement?.(query, replacement, baseline) ?? null;

  /**
   * Chooses a match in the document once its editor is ready and shown, which may be after the
   * document was just opened. Resolves to the match's place, or `null` when it is gone or another
   * request took its place first.
   */
  chooseSearchMatch = (
    documentKey: string,
    query: TextSearchQuery,
    target: SearchMatchTarget,
  ): Promise<number | null> => {
    this.pendingSearchMatch?.resolve(null);

    return new Promise((resolve) => {
      this.pendingSearchMatch = { documentKey, query, target, resolve };
      this.settlePendingRequests();
    });
  };

  focusChosenSearchMatch = (documentKey: string) => {
    const bridge = this.bridges.get(documentKey);

    if (!bridge) {
      return false;
    }

    bridge.focusChosenSearchMatch?.();

    return true;
  };

  runCommand = (documentKey: string, commandId: EditorCommandId) =>
    this.bridges.get(documentKey)?.runCommand?.(commandId) ?? false;

  clear = () => {
    this.bridges.clear();
    this.shownDocumentKey = null;
    this.pendingFocus = null;
    this.pendingHeading = null;
    this.pendingSearchMatch?.resolve(null);
    this.pendingSearchMatch = null;
    this.fireCommandStateChanged();
    this.fireDocumentStatusChanged();
  };

  private getShownBridge(documentKey: string) {
    return isSameNullablePath(this.shownDocumentKey, documentKey)
      ? this.bridges.get(documentKey)
      : undefined;
  }

  private settlePendingRequests() {
    const focusBridge = this.pendingFocus !== null && this.getShownBridge(this.pendingFocus);

    if (focusBridge) {
      this.pendingFocus = null;
      focusBridge.focus?.();
    }

    const heading = this.pendingHeading;
    const headingBridge = heading && this.getShownBridge(heading.documentKey);

    if (heading && headingBridge) {
      this.pendingHeading = null;
      headingBridge.navigateToHeading?.(heading.heading);
    }

    const searchMatch = this.pendingSearchMatch;
    const searchMatchBridge = searchMatch && this.getShownBridge(searchMatch.documentKey);

    if (!searchMatch || !searchMatchBridge) {
      return;
    }

    this.pendingSearchMatch = null;

    if (!searchMatchBridge.chooseSearchMatch) {
      searchMatch.resolve(null);
      return;
    }

    void searchMatchBridge
      .chooseSearchMatch(searchMatch.query, searchMatch.target)
      .then(searchMatch.resolve, () => searchMatch.resolve(null));
  }

  fireCommandStateChanged = () => {
    this.commandStateChanged.notify();
  };

  fireDocumentStatusChanged = () => {
    this.documentStatusChanged.notify();
  };

  fireContentChanged = (documentKey: string) => {
    this.contentChanged.notify(documentKey);
  };
}

export const documentEditorBridge = new DocumentEditorBridgeStore();
