import {
  getActiveDocumentKey,
  inspectMarkdownDocument,
  type SavedDocumentState,
} from "@/features/document";
import {
  getArticlePaths,
  useArticleNavigatorStore,
  type FolderContextState,
} from "@/features/folder-context";
import {
  FolderSearchEngine,
  FolderSearchTextCache,
  useFolderSearchStore,
  type FolderSearchOpenDocument,
  type FolderSearchMatchKey,
  type FolderSearchState,
} from "@/features/folder-search";
import { useSettingsStore } from "@/features/preferences";
import { t } from "@/lib/i18n";
import { DisposableStore, toDisposable, type Disposable } from "@/lib/lifecycle";
import { getPathParts, isSamePath, PathSet } from "@/lib/path";
import { notifyWarning } from "@/lib/toast";

import {
  findTabByDocumentKey,
  findTabByPath,
  useSessionStore,
  type SessionState,
} from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { notifyOpenMarkdownFileError, openMarkdownFileAtPath } from "./openSession";

// Typing waits this long for the query to settle before the folder is read for it.
const QUERY_DELAY_MS = 200;
// Reading an open document's text costs as much as the document is long, so an edit waits this
// long for typing to settle before the document is searched again.
const EDIT_DELAY_MS = 200;

const toOpenDocument = (document: SavedDocumentState): FolderSearchOpenDocument => {
  const documentKey = getActiveDocumentKey(document);

  return {
    path: document.path,
    readMatches: (query, options) =>
      documentEditorBridge.readSearchMatches(documentKey, query, options),
    planReplacement: (query, replacement) =>
      documentEditorBridge.planSearchReplacement(documentKey, query, replacement),
  };
};

const getActiveDocument = () => {
  const { activeDocument } = useSessionStore.getState();

  return activeDocument?.status === "saved" ? toOpenDocument(activeDocument) : null;
};

const getOpenDocument = (path: string) => {
  const document = findTabByPath(useSessionStore.getState(), path)?.document;

  return document?.status === "saved" ? toOpenDocument(document) : null;
};

const getSavedDocuments = (state: Pick<SessionState, "tabs">) =>
  state.tabs.flatMap(({ document }) => (document.status === "saved" ? [document] : []));

const hasQueryChanged = (state: FolderSearchState, previous: FolderSearchState) =>
  state.query !== previous.query ||
  state.caseSensitive !== previous.caseSensitive ||
  state.wholeWord !== previous.wholeWord ||
  state.replaceOpen !== previous.replaceOpen ||
  (state.replaceOpen && state.replacement !== previous.replacement);

const getReplaceRequest = ({ replaceOpen, replacement }: FolderSearchState) => {
  if (!replaceOpen) {
    return null;
  }

  const { defaultNewDocumentLineEnding, insertFinalNewline } = useSettingsStore.getState();

  return {
    text: replacement,
    save: { defaultLineEnding: defaultNewDocumentLineEnding, insertFinalNewline },
  };
};

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
  private editTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  private readonly editedDocumentKeys = new Set<string>();
  private readonly subscriptions = new DisposableStore();

  constructor() {
    this.subscriptions.add(
      useFolderSearchStore.subscribe((state, previous) => this.handleSearchChange(state, previous)),
    );
    this.subscriptions.add(
      useSessionStore.subscribe((state, previous) => this.handleSessionChange(state, previous)),
    );
    this.subscriptions.add(
      documentEditorBridge.onDidChangeContent((documentKey) =>
        this.handleContentChange(documentKey),
      ),
    );
    // A planned replacement is written as Save writes, so it follows the settings Save follows.
    this.subscriptions.add(
      useSettingsStore.subscribe((state, previous) => {
        if (
          this.engine &&
          useFolderSearchStore.getState().replaceOpen &&
          (state.defaultNewDocumentLineEnding !== previous.defaultNewDocumentLineEnding ||
            state.insertFinalNewline !== previous.insertFinalNewline)
        ) {
          this.search(false);
        }
      }),
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

    if (state.tabs === previous.tabs) {
      return;
    }

    // A document an editor let go of is read from its file again; what the editor held, such as
    // discarded changes, is no longer what the folder holds. One whose text was replaced, by a
    // save or a reload, is read again as it now stands.
    for (const document of getSavedDocuments(previous)) {
      const current = findTabByPath(state, document.path)?.document;

      if (current?.status !== "saved" || current.content !== document.content) {
        this.engine.refreshFile(document.path);
      }
    }
  }

  private handleContentChange(documentKey: string) {
    if (!this.engine) {
      return;
    }

    this.editedDocumentKeys.add(documentKey);
    globalThis.clearTimeout(this.editTimeout);
    this.editTimeout = globalThis.setTimeout(() => {
      const session = useSessionStore.getState();
      const editedKeys = [...this.editedDocumentKeys];

      this.editedDocumentKeys.clear();

      for (const key of editedKeys) {
        const document = findTabByDocumentKey(session, key)?.document;

        if (document?.status === "saved") {
          this.engine?.refreshFile(document.path);
        }
      }
    }, EDIT_DELAY_MS);
  }

  private search(finalizeProjection: boolean) {
    globalThis.clearTimeout(this.queryTimeout);

    const { folderContext } = useSessionStore.getState();
    const searchState = useFolderSearchStore.getState();
    const { caseSensitive, open, query, wholeWord } = searchState;

    if (!folderContext || !open) {
      return;
    }

    this.engine ??= new FolderSearchEngine(
      { getActiveDocument, getOpenDocument, textCache: this.textCache },
      (results) => useFolderSearchStore.getState().setResults(results),
    );
    this.engine.start({
      folderPath: folderContext.path,
      articlePaths: this.readArticlePaths(folderContext),
      query: { caseSensitive, text: query, wholeWord },
      replacement: getReplaceRequest(searchState),
      finalizeProjection,
    });
  }

  // A document with unsaved changes stays among the articles it was searched with when its file
  // leaves the folder, since what is searched is the editor's text rather than the file.
  private readArticlePaths(folderContext: FolderContextState) {
    const paths = getArticlePaths(folderContext.tree);
    const folderPaths = new PathSet(paths);

    for (const document of getSavedDocuments(useSessionStore.getState())) {
      if (!document.isDirty || folderPaths.has(document.path)) {
        continue;
      }

      const previousIndex = this.articlePaths.findIndex((path) => isSamePath(path, document.path));

      if (previousIndex !== -1) {
        paths.splice(Math.min(previousIndex, paths.length), 0, document.path);
      }
    }

    this.articlePaths = paths;

    return paths;
  }

  private stop() {
    globalThis.clearTimeout(this.queryTimeout);
    globalThis.clearTimeout(this.editTimeout);
    this.editedDocumentKeys.clear();
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
export const openFolderSearch = (mode: "find" | "replace" = "find") => {
  const settings = useSettingsStore.getState();

  if (!settings.sidebarVisible) {
    settings.updateSetting("sidebarVisible", true);
  }

  useFolderSearchStore.getState().openFolderSearch(mode);
};

export const submitFolderSearch = () => activeSession?.searchNow();

/** Searches again in place, as a folder refresh does, so a plan reads every file as it now is. */
export const refreshFolderSearch = () => activeSession?.searchNow();

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
  const openTab = findTabByPath(useSessionStore.getState(), file.path);

  if (openTab) {
    useSessionStore.getState().activateTab(openTab.id);
  } else {
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
