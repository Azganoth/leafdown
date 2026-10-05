import { getActiveDocumentKey, inspectMarkdownDocument } from "@/features/document";
import {
  useArticleNavigatorStore,
  type ArticleTreeNode,
  type FolderContextState,
} from "@/features/folder-context";
import {
  FolderSearchEngine,
  FolderSearchTextCache,
  useFolderSearchStore,
  type FolderSearchActiveDocument,
  type FolderSearchMatchKey,
  type FolderSearchState,
} from "@/features/folder-search";
import { useSettingsStore } from "@/features/preferences";
import { t } from "@/lib/i18n";
import { DisposableStore, toDisposable, type Disposable } from "@/lib/lifecycle";
import { getPathParts, isSamePath, PathSet } from "@/lib/path";
import { notifyWarning } from "@/lib/toast";

import { useSessionStore, type SessionState } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { notifyOpenMarkdownFileError, openMarkdownFileAtPath } from "./openSession";

// Typing waits this long for the query to settle before the folder is read for it.
const QUERY_DELAY_MS = 200;

const getTreeArticlePaths = (nodes: readonly ArticleTreeNode[]): string[] =>
  nodes.flatMap((node) =>
    node.kind === "file" ? [node.path] : getTreeArticlePaths(node.children),
  );

const getActiveDocument = (): FolderSearchActiveDocument | null => {
  const { activeDocument } = useSessionStore.getState();

  if (activeDocument?.status !== "saved") {
    return null;
  }

  const documentKey = getActiveDocumentKey(activeDocument);

  return {
    path: activeDocument.path,
    readMatches: (query, options) =>
      documentEditorBridge.readSearchMatches(documentKey, query, options),
  };
};

const hasQueryChanged = (state: FolderSearchState, previous: FolderSearchState) =>
  state.query !== previous.query ||
  state.caseSensitive !== previous.caseSensitive ||
  state.wholeWord !== previous.wholeWord;

/**
 * Keeps a folder search in step with the session while its surface is open: the folder's articles,
 * the document the editor holds, and the query. Results belong to the folder and its open
 * surface, so closing either retires the search.
 */
class FolderSearchSession implements Disposable {
  private engine: FolderSearchEngine | null = null;
  // Parsing dominates a first search, so the text read for one outlasts closing the view and is
  // dropped with the folder.
  private readonly textCache = new FolderSearchTextCache();
  private articlePaths: string[] = [];
  private queryTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  private readonly subscriptions = new DisposableStore();

  constructor() {
    this.subscriptions.add(
      useFolderSearchStore.subscribe((state, previous) => this.handleSearchChange(state, previous)),
    );
    this.subscriptions.add(
      useSessionStore.subscribe((state, previous) => this.handleSessionChange(state, previous)),
    );

    if (useFolderSearchStore.getState().open) {
      this.search(true);
    }
  }

  searchNow() {
    this.search(true);
  }

  cancel() {
    globalThis.clearTimeout(this.queryTimeout);
    this.engine?.cancel();
  }

  searchFurther() {
    this.engine?.searchFurther();
  }

  refreshFile(path: string) {
    this.engine?.refreshFile(path);
  }

  dispose() {
    this.subscriptions.dispose();
    this.stop();
    this.textCache.clear();
  }

  private handleSearchChange(state: FolderSearchState, previous: FolderSearchState) {
    if (!state.open) {
      if (previous.open) {
        this.stop();
      }

      return;
    }

    if (!previous.open) {
      this.search(true);
    } else if (hasQueryChanged(state, previous)) {
      globalThis.clearTimeout(this.queryTimeout);
      this.queryTimeout = globalThis.setTimeout(() => this.search(true), QUERY_DELAY_MS);
    }
  }

  private handleSessionChange(state: SessionState, previous: SessionState) {
    const folder = state.folderContext;
    const previousFolder = previous.folderContext;

    if (previousFolder && (!folder || !isSamePath(folder.path, previousFolder.path))) {
      this.stop();
      this.textCache.clear();
      useFolderSearchStore.getState().reset();
      return;
    }

    if (!this.engine || !folder) {
      return;
    }

    if (folder !== previousFolder) {
      this.search(false);
    }

    const active = state.activeDocument;
    const previousActive = previous.activeDocument;
    const activeKey = active && getActiveDocumentKey(active);
    const previousKey = previousActive && getActiveDocumentKey(previousActive);

    // The document the editor let go of is read from its file again; what the editor held, such
    // as discarded changes, is no longer what the folder holds.
    if (activeKey !== previousKey) {
      if (previousActive?.status === "saved") {
        this.engine.refreshFile(previousActive.path);
      }

      return;
    }

    if (active?.status === "saved" && active.content !== previousActive?.content) {
      this.engine.refreshFile(active.path);
    }
  }

  private search(finalizeProjection: boolean) {
    globalThis.clearTimeout(this.queryTimeout);

    const { folderContext } = useSessionStore.getState();
    const { caseSensitive, open, query, wholeWord } = useFolderSearchStore.getState();

    if (!folderContext || !open) {
      return;
    }

    this.engine ??= new FolderSearchEngine(
      { getActiveDocument, textCache: this.textCache },
      (results) => useFolderSearchStore.getState().setResults(results),
    );
    this.engine.start({
      folderPath: folderContext.path,
      articlePaths: this.readArticlePaths(folderContext),
      query: { caseSensitive, text: query, wholeWord },
      finalizeProjection,
    });
  }

  // A document with unsaved changes stays among the articles it was searched with when its file
  // leaves the folder, since what is searched is the editor's text rather than the file.
  private readArticlePaths(folderContext: FolderContextState) {
    const paths = getTreeArticlePaths(folderContext.tree.children);
    const { activeDocument } = useSessionStore.getState();

    if (activeDocument?.status === "saved" && activeDocument.isDirty) {
      const previousIndex = this.articlePaths.findIndex((path) =>
        isSamePath(path, activeDocument.path),
      );

      if (previousIndex !== -1 && !new PathSet(paths).has(activeDocument.path)) {
        paths.splice(Math.min(previousIndex, paths.length), 0, activeDocument.path);
      }
    }

    this.articlePaths = paths;

    return paths;
  }

  private stop() {
    globalThis.clearTimeout(this.queryTimeout);
    this.engine?.dispose();
    this.engine = null;
    this.articlePaths = [];
  }
}

let activeSession: FolderSearchSession | null = null;

export const startFolderSearchSession = (): Disposable => {
  const session = new FolderSearchSession();

  activeSession?.dispose();
  activeSession = session;

  return toDisposable(() => {
    session.dispose();

    if (activeSession === session) {
      activeSession = null;
    }
  });
};

/** Opens the search surface in the sidebar, showing the sidebar if it is hidden. */
export const openFolderSearch = () => {
  const settings = useSettingsStore.getState();

  if (!settings.sidebarVisible) {
    settings.updateSetting("sidebarVisible", true);
  }

  useFolderSearchStore.getState().openFolderSearch();
};

export const submitFolderSearch = () => activeSession?.searchNow();

export const cancelFolderSearch = () => activeSession?.cancel();

export const searchFolderFurther = () => activeSession?.searchFurther();

/** Closes the search surface, returning focus to the editor with any chosen match selected. */
export const closeFolderSearch = () => {
  useFolderSearchStore.getState().closeFolderSearch();

  const { activeDocument, folderContext } = useSessionStore.getState();

  if (
    activeDocument &&
    documentEditorBridge.focusChosenSearchMatch(getActiveDocumentKey(activeDocument))
  ) {
    return;
  }

  const firstPath = folderContext?.tree.children[0]?.path;

  if (firstPath) {
    useArticleNavigatorStore.getState().requestFocus(firstPath);
  }
};

const reportMatchGone = (match: FolderSearchMatchKey) => {
  useFolderSearchStore.getState().markMatchUnavailable(match);
  activeSession?.refreshFile(match.path);
  notifyWarning(
    t("session.folderSearch.matchUnavailable", { name: getPathParts(match.path).name }),
  );
};

/**
 * Opens the file holding a match through the normal open workflow, then selects the match itself.
 * A file that changed is searched again; a match it no longer holds is marked rather than chosen.
 */
export const openFolderSearchMatch = async (match: FolderSearchMatchKey) => {
  const { results } = useFolderSearchStore.getState();
  const file = results?.files.find((candidate) => isSamePath(candidate.path, match.path));
  const found = file?.matches.find((candidate) => candidate.ordinal === match.ordinal);

  if (!results || !file || !found) {
    return;
  }

  const isCurrent = () => useFolderSearchStore.getState().results?.id === results.id;
  const target = { ordinal: match.ordinal, context: found.context };
  const { activeDocument } = useSessionStore.getState();
  const isActive = activeDocument?.status === "saved" && isSamePath(activeDocument.path, file.path);

  if (!isActive) {
    if (file.version.source === "disk") {
      const state = await inspectMarkdownDocument({
        path: file.path,
        metadata: file.version.metadata,
        fingerprint: file.version.fingerprint,
      }).catch(() => null);

      if (!isCurrent()) {
        return;
      }

      if (state === null || state.kind === "missing") {
        reportMatchGone(match);
        return;
      }
    }

    try {
      if (!(await openMarkdownFileAtPath(file.path)) || !isCurrent()) {
        return;
      }
    } catch (error) {
      notifyOpenMarkdownFileError(error);
      activeSession?.refreshFile(file.path);
      return;
    }
  }

  const ordinal = await documentEditorBridge.chooseSearchMatch(file.path, results.query, target);

  if (!isCurrent()) {
    return;
  }

  if (ordinal === null) {
    reportMatchGone(match);
    return;
  }

  // The file is searched again as the editor now holds it, so the row chosen is the one shown.
  activeSession?.refreshFile(file.path);
  useFolderSearchStore.getState().setChosenMatch({ path: file.path, ordinal });
};
