import { editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";

import { handleUnexpectedError, invariant } from "@/lib/errors";
import { useLocalization } from "@/lib/i18n";
import { notifyWarning } from "@/lib/toast";

import {
  INACTIVE_EDITOR_COMMAND_STATE,
  READY_DISABLED_EDITOR_COMMAND_STATE,
  getEditorCommandState,
  runEditorCommand,
  type EditorCommandId,
  type EditorCommandState,
} from "../commands";
import {
  changeSearchQuery,
  chooseSearchMatch,
  closeSearch,
  findNext,
  findPrevious,
  focusChosenSearchMatch,
  applySearchReplacement,
  planSearchReplacement,
  readDocumentSearchMatches,
  replaceAllSearchMatches,
  replaceSearchMatch,
  setSearchMode,
} from "../commands/editing/search";
import {
  applyCodeBlockLanguage as applyCodeBlockLanguageToView,
  closeCodeBlockLanguage as closeCodeBlockLanguageInView,
} from "../commands/formatting/codeBlockLanguage";
import { insertBlockAtBoundary, type BoundaryInsertKind } from "../commands/inserting/blocks";
import { insertLinkTarget } from "../commands/inserting/links";
import type { BlockInsertionRequest } from "../plugins/blockSelectionInteraction";
import type { CodeBlockLanguageRequest } from "../plugins/codeBlockLanguage";
import { setCodeLineNumbersEnabled } from "../plugins/codeLineNumbers";
import type { ContextPopupRequest } from "../plugins/contextPopup";
import type { FootnotePreviewRequest } from "../plugins/footnotePreview";
import {
  CLOSED_EDITOR_SEARCH_STATE,
  type EditorSearchState,
  type SearchMode,
  type SearchQueryChange,
} from "../plugins/search";
import type { HtmlExportSnapshot } from "../services/htmlExport";
import {
  createMilkdownEditor,
  getMilkdownEditorHtmlExportSnapshot,
  getMilkdownEditorMarkdown,
  type MilkdownEditorInstance,
  type MilkdownMarkdownUpdate,
} from "../utils/createMilkdownEditor";
import {
  getEditorDocumentStatus,
  INACTIVE_EDITOR_DOCUMENT_STATUS,
  type EditorDocumentStatus,
} from "../utils/documentStatus";
import {
  jumpToOutlineHeading,
  readHeadingOutline,
  type HeadingOutlineState,
} from "../utils/headingOutline";
import type { MarkdownLinkContext } from "../utils/linkActivation";
import type { MarkdownReferenceContext } from "../utils/markdownReferences";
import type { DocumentReplacementPlan } from "../utils/textReplacement";
import type {
  DocumentSearchMatches,
  SearchMatchTarget,
  TextSearchQuery,
} from "../utils/textSearch";
import { jumpToWikiHeading } from "../utils/wikiHeadings";

/** Carries the caret and focus across a remount that replaces the document text. */
export interface EditorViewState {
  anchor: number;
  head: number;
  focused: boolean;
}

/** The search surface's view of the editor's search, and the actions it takes on it. */
export interface EditorSearchControls {
  state: EditorSearchState;
  replacement: string;
  changeQuery: (change: SearchQueryChange) => void;
  changeReplacement: (replacement: string) => void;
  close: () => void;
  findNext: () => void;
  findPrevious: () => void;
  replace: () => void;
  replaceAll: () => void;
  setMode: (mode: SearchMode) => void;
}

export interface MilkdownEditorBridge {
  getMarkdown: () => string;
  getHtmlExportSnapshot?: () => HtmlExportSnapshot | null;
  getCommandState?: () => EditorCommandState;
  getDocumentStatus?: () => EditorDocumentStatus;
  getViewState?: () => EditorViewState | null;
  insertLink?: (label: string, target: string) => boolean;
  navigateToHeading?: (heading: string) => void;
  navigateToOutlineHeading?: (position: number) => boolean;
  runCommand?: (commandId: EditorCommandId) => boolean | Promise<boolean>;
  /** The document's matches, or `null` while the editor is not ready. */
  readSearchMatches?: (
    query: TextSearchQuery,
    options: { finalizeProjection: boolean },
  ) => DocumentSearchMatches | null;
  /** Resolves once the editor is ready, to the chosen match's place, or `null` when it is gone. */
  chooseSearchMatch?: (query: TextSearchQuery, target: SearchMatchTarget) => Promise<number | null>;
  focusChosenSearchMatch?: () => void;
  /** What replacing every match would make of the document, or `null` while the editor is not ready. */
  planSearchReplacement?: (
    query: TextSearchQuery,
    replacement: string,
  ) => DocumentReplacementPlan | null;
  /** Replaces every match while the document still saves as `baseline`; see `applySearchReplacement`. */
  applySearchReplacement?: (
    query: TextSearchQuery,
    replacement: string,
    baseline: string,
  ) => number | null;
}

interface PendingSearchMatch {
  query: TextSearchQuery;
  target: SearchMatchTarget;
  resolve: (ordinal: number | null) => void;
}

interface UseMilkdownEditorInstanceOptions extends Partial<MarkdownReferenceContext> {
  autoPairBracketsAndQuotes?: boolean;
  displayCodeBlockLineNumbers?: boolean;
  initialMarkdown: string;
  initialViewState?: EditorViewState | null;
  onCommandStateChanged?: () => void;
  onContentChanged?: () => void;
  onDocumentStatusChanged?: () => void;
  onHeadingOutlineChanged?: (outline: HeadingOutlineState) => void;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
  onOpenMarkdownPath?: MarkdownLinkContext["onOpenMarkdownPath"];
  onReadMarkdownPath?: MarkdownLinkContext["onReadMarkdownPath"];
  wikiCompletionPaths?: string[];
  ref?: Ref<MilkdownEditorBridge>;
}

const DEFAULT_OPEN_MARKDOWN_PATH: MarkdownLinkContext["onOpenMarkdownPath"] = () => false;

export const useMilkdownEditorInstance = ({
  autoPairBracketsAndQuotes = true,
  displayCodeBlockLineNumbers = false,
  documentPath = null,
  folderContextPath = null,
  initialMarkdown,
  initialViewState = null,
  onCommandStateChanged,
  onContentChanged,
  onDocumentStatusChanged,
  onHeadingOutlineChanged,
  onMarkdownUpdated,
  onOpenMarkdownPath = DEFAULT_OPEN_MARKDOWN_PATH,
  onReadMarkdownPath,
  wikiCompletionPaths = [],
  ref,
}: UseMilkdownEditorInstanceOptions) => {
  const { t } = useLocalization();
  const translationRef = useRef(t);
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MilkdownEditorInstance | null>(null);
  const pendingHeadingRef = useRef<string | null>(null);
  const pendingSearchMatchRef = useRef<PendingSearchMatch | null>(null);
  const [commandState, setCommandState] = useState<EditorCommandState>(
    INACTIVE_EDITOR_COMMAND_STATE,
  );
  const [contextPopupRequest, setContextPopupRequest] = useState<ContextPopupRequest | null>(null);
  const [blockInsertionRequest, setBlockInsertionRequest] = useState<BlockInsertionRequest | null>(
    null,
  );
  const blockInsertionRequestRef = useRef<BlockInsertionRequest | null>(null);
  const [footnotePreviewRequest, setFootnotePreviewRequest] =
    useState<FootnotePreviewRequest | null>(null);
  const [codeBlockLanguageRequest, setCodeBlockLanguageRequest] =
    useState<CodeBlockLanguageRequest | null>(null);
  const codeBlockLanguageOpenRef = useRef(false);
  const [searchState, setSearchState] = useState<EditorSearchState>(CLOSED_EDITOR_SEARCH_STATE);
  const [searchReplacement, setSearchReplacement] = useState("");
  const searchFocusRequestRef = useRef<EditorSearchState["focusRequest"]>(null);

  const commandStateRef = useRef<EditorCommandState>(INACTIVE_EDITOR_COMMAND_STATE);
  const documentStatusRef = useRef<EditorDocumentStatus>(INACTIVE_EDITOR_DOCUMENT_STATUS);
  const liveOptionsRef = useRef({
    autoPairBracketsAndQuotes,
    displayCodeBlockLineNumbers,
    documentPath,
    folderContextPath,
    initialMarkdown,
    initialViewState,
    onCommandStateChanged,
    onContentChanged,
    onDocumentStatusChanged,
    onHeadingOutlineChanged,
    onMarkdownUpdated,
    onOpenMarkdownPath,
    onReadMarkdownPath,
    wikiCompletionPaths,
  });
  const contextPopupOpenRef = useRef(false);

  useLayoutEffect(() => {
    translationRef.current = t;
  }, [t]);

  useLayoutEffect(() => {
    liveOptionsRef.current = {
      autoPairBracketsAndQuotes,
      displayCodeBlockLineNumbers,
      documentPath,
      folderContextPath,
      initialMarkdown,
      initialViewState,
      onCommandStateChanged,
      onContentChanged,
      onDocumentStatusChanged,
      onHeadingOutlineChanged,
      onMarkdownUpdated,
      onOpenMarkdownPath,
      onReadMarkdownPath,
      wikiCompletionPaths,
    };
  }, [
    autoPairBracketsAndQuotes,
    displayCodeBlockLineNumbers,
    initialMarkdown,
    initialViewState,
    documentPath,
    folderContextPath,
    onCommandStateChanged,
    onContentChanged,
    onDocumentStatusChanged,
    onHeadingOutlineChanged,
    onMarkdownUpdated,
    onOpenMarkdownPath,
    onReadMarkdownPath,
    wikiCompletionPaths,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => {
        invariant(editorRef.current, "Milkdown editor is not available.");

        return getMilkdownEditorMarkdown(editorRef.current);
      },
      getHtmlExportSnapshot: () =>
        editorRef.current?.ctx ? getMilkdownEditorHtmlExportSnapshot(editorRef.current) : null,
      getCommandState: () => commandStateRef.current,
      getDocumentStatus: () => documentStatusRef.current,
      getViewState: () => {
        if (!editorRef.current?.ctx) {
          return null;
        }

        const view = editorRef.current.ctx.get(editorViewCtx);
        const { anchor, head } = view.state.selection;

        return { anchor, head, focused: view.hasFocus() };
      },
      insertLink: (label, target) => {
        if (!editorRef.current?.ctx) {
          return false;
        }

        return insertLinkTarget(editorRef.current.ctx.get(editorViewCtx), { label, target });
      },
      navigateToHeading: (heading) => {
        if (!editorRef.current?.ctx) {
          pendingHeadingRef.current = heading;
          return;
        }
        if (!jumpToWikiHeading(editorRef.current.ctx.get(editorViewCtx), heading)) {
          notifyWarning(translationRef.current("editor.link.missing"), heading);
        }
      },
      navigateToOutlineHeading: (position) => {
        if (!editorRef.current?.ctx) return false;
        return jumpToOutlineHeading(editorRef.current.ctx.get(editorViewCtx), position);
      },
      runCommand: (commandId) => {
        if (!editorRef.current) {
          return false;
        }

        return runEditorCommand(editorRef.current, commandId);
      },
      readSearchMatches: (query, options) => {
        if (!editorRef.current?.ctx) {
          return null;
        }

        return readDocumentSearchMatches(editorRef.current.ctx.get(editorViewCtx), query, options);
      },
      chooseSearchMatch: (query, target) => {
        if (editorRef.current?.ctx) {
          return Promise.resolve(
            chooseSearchMatch(editorRef.current.ctx.get(editorViewCtx), query, target),
          );
        }

        pendingSearchMatchRef.current?.resolve(null);

        return new Promise((resolve) => {
          pendingSearchMatchRef.current = { query, target, resolve };
        });
      },
      focusChosenSearchMatch: () => {
        if (editorRef.current?.ctx) {
          focusChosenSearchMatch(editorRef.current.ctx.get(editorViewCtx));
        }
      },
      planSearchReplacement: (query, replacement) => {
        const ctx = editorRef.current?.ctx;

        return ctx
          ? planSearchReplacement(
              ctx.get(editorViewCtx),
              query,
              replacement,
              ctx.get(serializerCtx),
            )
          : null;
      },
      applySearchReplacement: (query, replacement, baseline) => {
        const ctx = editorRef.current?.ctx;

        return ctx
          ? applySearchReplacement(
              ctx.get(editorViewCtx),
              query,
              replacement,
              baseline,
              ctx.get(serializerCtx),
            )
          : null;
      },
    }),
    [],
  );

  const closeContextPopup = useCallback(() => {
    contextPopupOpenRef.current = false;
    setContextPopupRequest(null);
  }, []);

  const requestContextPopup = useCallback((request: ContextPopupRequest) => {
    contextPopupOpenRef.current = true;
    setContextPopupRequest(request);
  }, []);

  const closeBlockInsertion = useCallback(() => {
    blockInsertionRequestRef.current?.onDismiss();
    blockInsertionRequestRef.current = null;
    setBlockInsertionRequest(null);
  }, []);

  const executeBlockInsertion = useCallback(
    (kind: BoundaryInsertKind) => {
      const request = blockInsertionRequest;
      const editor = editorRef.current;
      closeBlockInsertion();
      if (!request || !editor?.ctx) return;
      const view = editor.ctx.get(editorViewCtx);
      if (view.state.doc === request.document) {
        insertBlockAtBoundary(view, request.boundary, kind);
      }
      view.focus();
    },
    [blockInsertionRequest, closeBlockInsertion],
  );

  const closeFootnotePreview = useCallback(() => setFootnotePreviewRequest(null), []);

  const requestCodeBlockLanguage = useCallback(
    (request: CodeBlockLanguageRequest) => {
      closeContextPopup();
      codeBlockLanguageOpenRef.current = true;
      setCodeBlockLanguageRequest(request);
    },
    [closeContextPopup],
  );

  const releaseCodeBlockLanguage = useCallback(() => {
    codeBlockLanguageOpenRef.current = false;
    setCodeBlockLanguageRequest(null);
  }, []);

  const cancelCodeBlockLanguage = useCallback(() => {
    const editor = editorRef.current;

    if (editor?.ctx) {
      closeCodeBlockLanguageInView(editor.ctx.get(editorViewCtx));
    }

    releaseCodeBlockLanguage();
  }, [releaseCodeBlockLanguage]);

  const applyCodeBlockLanguage = useCallback(
    (language: string) => {
      const request = codeBlockLanguageRequest;
      const editor = editorRef.current;

      if (!request || !editor?.ctx) {
        return false;
      }

      return applyCodeBlockLanguageToView(editor.ctx.get(editorViewCtx), request, language);
    },
    [codeBlockLanguageRequest],
  );

  const requestFootnotePreview = useCallback(
    (request: FootnotePreviewRequest) => setFootnotePreviewRequest(request),
    [],
  );

  const focusEditor = useCallback(() => {
    const editor = editorRef.current;

    if (!editor?.ctx) {
      return;
    }

    try {
      editor.ctx.get(editorViewCtx).focus();
    } catch (error) {
      handleUnexpectedError(error, "focusEditor");
    }
  }, []);

  const updateCommandState = useCallback((nextCommandState: EditorCommandState) => {
    commandStateRef.current = nextCommandState;
    setCommandState(nextCommandState);
    liveOptionsRef.current.onCommandStateChanged?.();
  }, []);

  const updateDocumentStatus = useCallback((nextDocumentStatus: EditorDocumentStatus) => {
    documentStatusRef.current = nextDocumentStatus;
    liveOptionsRef.current.onDocumentStatusChanged?.();
  }, []);

  const executeContextCommand = useCallback(
    (commandId: EditorCommandId) => {
      const editor = editorRef.current;

      if (!editor) {
        return;
      }

      closeContextPopup();
      void Promise.resolve(runEditorCommand(editor, commandId)).catch((error) =>
        handleUnexpectedError(error, "runEditorContextCommand"),
      );
      window.requestAnimationFrame(() => {
        if (
          editorRef.current === editor &&
          !contextPopupOpenRef.current &&
          !codeBlockLanguageOpenRef.current &&
          document.activeElement === document.body
        ) {
          focusEditor();
        }
      });
    },
    [closeContextPopup, focusEditor],
  );

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return undefined;
    }

    let disposed = false;
    let activeEditor: MilkdownEditorInstance | null = null;
    const isActiveEditorCallback = () => !disposed && editorRef.current === activeEditor;

    const createEditor = async () => {
      if (disposed) return;

      const editor = await createMilkdownEditor({
        root,
        initialMarkdown: liveOptionsRef.current.initialMarkdown,
        contextPopup: {
          isOpen: () => contextPopupOpenRef.current,
          onClose: closeContextPopup,
          onRequest: requestContextPopup,
        },
        blockInsertion: {
          onRequest: (request) => {
            closeContextPopup();
            blockInsertionRequestRef.current?.onDismiss();
            blockInsertionRequestRef.current = request;
            setBlockInsertionRequest(request);
          },
        },
        footnotePreview: {
          onClose: closeFootnotePreview,
          onRequest: requestFootnotePreview,
        },
        codeBlockLanguage: {
          onClose: releaseCodeBlockLanguage,
          onRequest: requestCodeBlockLanguage,
        },
        search: {
          onStateChanged: (nextSearchState) => {
            if (!isActiveEditorCallback()) {
              return;
            }

            // Search takes focus into its own surface, which a popup on the selection would
            // otherwise stand over.
            if (nextSearchState.focusRequest !== searchFocusRequestRef.current) {
              searchFocusRequestRef.current = nextSearchState.focusRequest;
              closeContextPopup();
            }

            setSearchState(nextSearchState);
          },
        },
        getMarkdownReferenceContext: () => ({
          documentPath: liveOptionsRef.current.documentPath,
          folderContextPath: liveOptionsRef.current.folderContextPath,
        }),
        isAutoPairEnabled: () => liveOptionsRef.current.autoPairBracketsAndQuotes,
        areCodeLineNumbersEnabled: () => liveOptionsRef.current.displayCodeBlockLineNumbers,
        onMarkdownUpdated: (update) => {
          if (isActiveEditorCallback()) {
            liveOptionsRef.current.onMarkdownUpdated?.(update);
          }
        },
        onContentChanged: () => {
          if (isActiveEditorCallback()) {
            liveOptionsRef.current.onContentChanged?.();
          }
        },
        onCommandStateChanged: (nextCommandState) => {
          if (isActiveEditorCallback()) {
            updateCommandState(nextCommandState);
          }
        },
        onDocumentStatusChanged: (nextDocumentStatus) => {
          if (isActiveEditorCallback()) {
            updateDocumentStatus(nextDocumentStatus);
          }
        },
        onHeadingOutlineChanged: (outline) => {
          if (isActiveEditorCallback()) {
            liveOptionsRef.current.onHeadingOutlineChanged?.(outline);
          }
        },
        onOpenMarkdownPath: (path, heading) => {
          if (!isActiveEditorCallback()) {
            return false;
          }

          return heading
            ? liveOptionsRef.current.onOpenMarkdownPath(path, heading)
            : liveOptionsRef.current.onOpenMarkdownPath(path);
        },
        onReadMarkdownPath: (path) =>
          liveOptionsRef.current.onReadMarkdownPath?.(path) ??
          Promise.reject(new Error("Markdown reader is unavailable.")),
        getWikiCompletionPaths: () => liveOptionsRef.current.wikiCompletionPaths,
      });

      activeEditor = editor;

      if (disposed) {
        void editor.destroy();
        return;
      }

      await editor.create();

      if (disposed) {
        void editor.destroy();
        return;
      }

      editorRef.current = editor;
      syncCodeLineNumbers(editor, liveOptionsRef.current.displayCodeBlockLineNumbers);
      restoreViewState(editor, liveOptionsRef.current.initialViewState);
      if (pendingHeadingRef.current) {
        const heading = pendingHeadingRef.current;
        pendingHeadingRef.current = null;
        if (!jumpToWikiHeading(editor.ctx.get(editorViewCtx), heading)) {
          notifyWarning(translationRef.current("editor.link.missing"), heading);
        }
      }
      if (pendingSearchMatchRef.current) {
        const { query, resolve, target } = pendingSearchMatchRef.current;
        pendingSearchMatchRef.current = null;
        resolve(chooseSearchMatch(editor.ctx.get(editorViewCtx), query, target));
      }
      updateCommandState(readEditorCommandState(editor));
      updateDocumentStatus(readEditorDocumentStatus(editor));
      liveOptionsRef.current.onHeadingOutlineChanged?.(
        readHeadingOutline(editor.ctx.get(editorViewCtx)),
      );
    };

    void createEditor().catch((error) => handleUnexpectedError(error, "createMilkdownEditor"));

    return () => {
      disposed = true;
      pendingSearchMatchRef.current?.resolve(null);
      pendingSearchMatchRef.current = null;

      if (editorRef.current) {
        void editorRef.current.destroy();
        editorRef.current = null;
      }

      closeContextPopup();
      closeBlockInsertion();
      closeFootnotePreview();
      releaseCodeBlockLanguage();
      setSearchState(CLOSED_EDITOR_SEARCH_STATE);
    };
  }, [
    closeContextPopup,
    closeBlockInsertion,
    closeFootnotePreview,
    releaseCodeBlockLanguage,
    requestCodeBlockLanguage,
    requestContextPopup,
    requestFootnotePreview,
    updateCommandState,
    updateDocumentStatus,
  ]);

  useEffect(() => {
    if (editorRef.current) {
      syncCodeLineNumbers(editorRef.current, displayCodeBlockLineNumbers);
    }
  }, [displayCodeBlockLineNumbers]);

  const runSearch = (run: (view: EditorView) => unknown) => {
    const editor = editorRef.current;

    if (!editor?.ctx) {
      return;
    }

    try {
      run(editor.ctx.get(editorViewCtx));
    } catch (error) {
      handleUnexpectedError(error, "runEditorSearch");
    }
  };

  const search: EditorSearchControls = {
    state: searchState,
    replacement: searchReplacement,
    changeQuery: (change) => runSearch((view) => changeSearchQuery(view, change)),
    changeReplacement: setSearchReplacement,
    close: () => runSearch(closeSearch),
    findNext: () => runSearch(findNext),
    findPrevious: () => runSearch(findPrevious),
    replace: () => runSearch((view) => replaceSearchMatch(view, searchReplacement)),
    replaceAll: () => runSearch((view) => replaceAllSearchMatches(view, searchReplacement)),
    setMode: (mode) => runSearch((view) => setSearchMode(view, mode)),
  };

  return {
    applyCodeBlockLanguage,
    blockInsertionRequest,
    cancelCodeBlockLanguage,
    closeBlockInsertion,
    codeBlockLanguageRequest,
    closeContextPopup,
    commandState,
    contextPopupRequest,
    executeContextCommand,
    executeBlockInsertion,
    focusEditor,
    footnotePreviewRequest,
    rootRef,
    search,
  };
};

// The setting can change while the editor is still being created, after its state has read the
// value it started with, so the value in effect is applied again once the editor is ready.
const syncCodeLineNumbers = (editor: MilkdownEditorInstance, enabled: boolean) => {
  if (!editor.ctx) {
    return;
  }

  try {
    setCodeLineNumbersEnabled(editor.ctx.get(editorViewCtx), enabled);
  } catch (error) {
    handleUnexpectedError(error, "syncCodeLineNumbers");
  }
};

// The replacement text can be shorter or shaped differently, so each end moves to the nearest
// position that can hold a text selection.
const restoreViewState = (editor: MilkdownEditorInstance, viewState: EditorViewState | null) => {
  if (!viewState || !editor.ctx) {
    return;
  }

  try {
    const view = editor.ctx.get(editorViewCtx);
    const { doc } = view.state;
    const resolve = (position: number) =>
      doc.resolve(Math.min(Math.max(position, 0), doc.content.size));

    if (viewState.focused) {
      view.focus();
    }

    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.between(resolve(viewState.anchor), resolve(viewState.head)))
        .scrollIntoView(),
    );
  } catch (error) {
    handleUnexpectedError(error, "restoreEditorViewState");
  }
};

const readEditorCommandState = (editor: MilkdownEditorInstance) => {
  if (!editor.ctx) {
    return READY_DISABLED_EDITOR_COMMAND_STATE;
  }

  try {
    return getEditorCommandState(editor.ctx.get(editorViewCtx));
  } catch (error) {
    handleUnexpectedError(error, "readEditorCommandState");
    return READY_DISABLED_EDITOR_COMMAND_STATE;
  }
};

const readEditorDocumentStatus = (editor: MilkdownEditorInstance) => {
  if (!editor.ctx) {
    return INACTIVE_EDITOR_DOCUMENT_STATUS;
  }

  try {
    return getEditorDocumentStatus(editor.ctx.get(editorViewCtx).state);
  } catch (error) {
    handleUnexpectedError(error, "readEditorDocumentStatus");
    return INACTIVE_EDITOR_DOCUMENT_STATUS;
  }
};
