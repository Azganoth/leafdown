import { editorViewCtx } from "@milkdown/kit/core";
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

import {
  INACTIVE_EDITOR_COMMAND_STATE,
  READY_DISABLED_EDITOR_COMMAND_STATE,
  getEditorCommandState,
  runEditorCommand,
  type EditorCommandId,
  type EditorCommandState,
} from "../commands";
import { insertBlockAtBoundary, type BoundaryInsertKind } from "../commands/inserting/blocks";
import { insertLinkTarget } from "../commands/inserting/links";
import type { BlockInsertionRequest } from "../plugins/blockSelectionInteraction";
import type { ContextPopupRequest } from "../plugins/contextPopup";
import type { FootnotePreviewRequest } from "../plugins/footnotePreview";
import {
  createMilkdownEditor,
  getMilkdownEditorMarkdown,
  type MilkdownEditorInstance,
  type MilkdownMarkdownUpdate,
} from "../utils/createMilkdownEditor";
import type { MarkdownLinkContext } from "../utils/linkActivation";
import type { MarkdownReferenceContext } from "../utils/markdownReferences";

export interface MilkdownEditorBridge {
  getMarkdown: () => string;
  getCommandState?: () => EditorCommandState;
  insertLink?: (label: string, target: string) => boolean;
  runCommand?: (commandId: EditorCommandId) => boolean | Promise<boolean>;
}

interface UseMilkdownEditorInstanceOptions extends Partial<MarkdownReferenceContext> {
  autoPairBracketsAndQuotes?: boolean;
  initialMarkdown: string;
  onCommandStateChanged?: () => void;
  onContentChanged?: () => void;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
  onOpenMarkdownPath?: MarkdownLinkContext["onOpenMarkdownPath"];
  ref?: Ref<MilkdownEditorBridge>;
}

const DEFAULT_OPEN_MARKDOWN_PATH: MarkdownLinkContext["onOpenMarkdownPath"] = () => false;

export const useMilkdownEditorInstance = ({
  autoPairBracketsAndQuotes = true,
  documentPath = null,
  folderContextPath = null,
  initialMarkdown,
  onCommandStateChanged,
  onContentChanged,
  onMarkdownUpdated,
  onOpenMarkdownPath = DEFAULT_OPEN_MARKDOWN_PATH,
  ref,
}: UseMilkdownEditorInstanceOptions) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MilkdownEditorInstance | null>(null);
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

  const commandStateRef = useRef<EditorCommandState>(INACTIVE_EDITOR_COMMAND_STATE);
  const liveOptionsRef = useRef({
    autoPairBracketsAndQuotes,
    documentPath,
    folderContextPath,
    initialMarkdown,
    onCommandStateChanged,
    onContentChanged,
    onMarkdownUpdated,
    onOpenMarkdownPath,
  });
  const contextPopupOpenRef = useRef(false);

  useLayoutEffect(() => {
    liveOptionsRef.current = {
      autoPairBracketsAndQuotes,
      documentPath,
      folderContextPath,
      initialMarkdown,
      onCommandStateChanged,
      onContentChanged,
      onMarkdownUpdated,
      onOpenMarkdownPath,
    };
  }, [
    autoPairBracketsAndQuotes,
    initialMarkdown,
    documentPath,
    folderContextPath,
    onCommandStateChanged,
    onContentChanged,
    onMarkdownUpdated,
    onOpenMarkdownPath,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => {
        invariant(editorRef.current, "Milkdown editor is not available.");

        return getMilkdownEditorMarkdown(editorRef.current);
      },
      getCommandState: () => commandStateRef.current,
      insertLink: (label, target) => {
        if (!editorRef.current?.ctx) {
          return false;
        }

        return insertLinkTarget(editorRef.current.ctx.get(editorViewCtx), { label, target });
      },
      runCommand: (commandId) => {
        if (!editorRef.current) {
          return false;
        }

        return runEditorCommand(editorRef.current, commandId);
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
        getMarkdownReferenceContext: () => ({
          documentPath: liveOptionsRef.current.documentPath,
          folderContextPath: liveOptionsRef.current.folderContextPath,
        }),
        isAutoPairEnabled: () => liveOptionsRef.current.autoPairBracketsAndQuotes,
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
        onOpenMarkdownPath: (path) => {
          if (!isActiveEditorCallback()) {
            return false;
          }

          return liveOptionsRef.current.onOpenMarkdownPath(path);
        },
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
      updateCommandState(readEditorCommandState(editor));
    };

    void createEditor().catch((error) => handleUnexpectedError(error, "createMilkdownEditor"));

    return () => {
      disposed = true;

      if (editorRef.current) {
        void editorRef.current.destroy();
        editorRef.current = null;
      }

      closeContextPopup();
      closeBlockInsertion();
      closeFootnotePreview();
    };
  }, [
    closeContextPopup,
    closeBlockInsertion,
    closeFootnotePreview,
    requestContextPopup,
    requestFootnotePreview,
    updateCommandState,
  ]);

  return {
    blockInsertionRequest,
    closeBlockInsertion,
    closeContextPopup,
    commandState,
    contextPopupRequest,
    executeContextCommand,
    executeBlockInsertion,
    focusEditor,
    footnotePreviewRequest,
    rootRef,
  };
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
