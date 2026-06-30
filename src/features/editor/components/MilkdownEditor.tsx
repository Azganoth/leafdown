import { editorViewCtx } from "@milkdown/kit/core";

import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "./MilkdownEditor.css";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";

import { cn } from "@/lib/cn";
import { handleUnexpectedError, invariant } from "@/lib/errors";

import {
  INACTIVE_EDITOR_COMMAND_STATE,
  READY_DISABLED_EDITOR_COMMAND_STATE,
  getEditorCommandState,
  runEditorCommand,
  type EditorCommandId,
  type EditorCommandState,
} from "../commands";
import type { ContextPopupAnchor } from "../plugins/contextPopup";
import {
  createMilkdownEditor,
  getMilkdownEditorMarkdown,
  type MilkdownEditorInstance,
  type MilkdownMarkdownUpdate,
} from "../utils/createMilkdownEditor";
import type { MarkdownLinkContext } from "../utils/linkActivation";
import type { MarkdownReferenceContext } from "../utils/markdownReferences";
import { EditorContextPopup } from "./EditorContextPopup";

export interface MilkdownEditorBridge {
  getMarkdown: () => string;
  getCommandState?: () => EditorCommandState;
  runCommand?: (commandId: EditorCommandId) => boolean | Promise<boolean>;
}

const DEFAULT_OPEN_MARKDOWN_PATH: MarkdownLinkContext["onOpenMarkdownPath"] = () => false;

export interface MilkdownEditorProps extends Partial<MarkdownReferenceContext> {
  initialMarkdown: string;
  onOpenMarkdownPath?: (path: string) => boolean | Promise<boolean>;
  className?: string;
  ref?: Ref<MilkdownEditorBridge>;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
  onContentChanged?: () => void;
  onCommandStateChanged?: () => void;
  autoPairBracketsAndQuotes?: boolean;
  softWrapCodeBlocks?: boolean;
}

export function MilkdownEditor({
  initialMarkdown,
  documentPath = null,
  folderContextPath = null,
  onOpenMarkdownPath,
  className,
  ref,
  onMarkdownUpdated,
  onContentChanged,
  onCommandStateChanged,
  autoPairBracketsAndQuotes = true,
  softWrapCodeBlocks = false,
}: MilkdownEditorProps) {
  const { closeContextPopup, commandState, contextPopupAnchor, executeContextCommand, rootRef } =
    useMilkdownEditorInstance({
      autoPairBracketsAndQuotes,
      documentPath,
      folderContextPath,
      initialMarkdown,
      onMarkdownUpdated,
      onContentChanged,
      onCommandStateChanged,
      onOpenMarkdownPath,
      ref,
    });

  return (
    <div
      className={cn("leafdown-editor", className)}
      data-code-block-soft-wrap={softWrapCodeBlocks}
      data-testid="milkdown-editor-host"
    >
      <div ref={rootRef} className="min-h-full w-full" />
      <EditorContextPopup
        anchor={contextPopupAnchor}
        commandState={commandState}
        onClose={closeContextPopup}
        onExecute={executeContextCommand}
      />
    </div>
  );
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

const useMilkdownEditorInstance = ({
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
  const [contextPopupAnchor, setContextPopupAnchor] = useState<ContextPopupAnchor | null>(null);

  const commandStateRef = useRef<EditorCommandState>(INACTIVE_EDITOR_COMMAND_STATE);
  const onMarkdownUpdatedRef = useRef(onMarkdownUpdated);
  const onContentChangedRef = useRef(onContentChanged);
  const onCommandStateChangedRef = useRef(onCommandStateChanged);
  const autoPairBracketsAndQuotesRef = useRef(autoPairBracketsAndQuotes);
  const initialMarkdownRef = useRef(initialMarkdown);
  const documentPathRef = useRef(documentPath);
  const folderContextPathRef = useRef(folderContextPath);
  const onOpenMarkdownPathRef = useRef(onOpenMarkdownPath);
  const contextPopupOpenRef = useRef(false);

  useLayoutEffect(() => {
    onMarkdownUpdatedRef.current = onMarkdownUpdated;
    onContentChangedRef.current = onContentChanged;
    onCommandStateChangedRef.current = onCommandStateChanged;
    autoPairBracketsAndQuotesRef.current = autoPairBracketsAndQuotes;
    initialMarkdownRef.current = initialMarkdown;
    documentPathRef.current = documentPath;
    folderContextPathRef.current = folderContextPath;
    onOpenMarkdownPathRef.current = onOpenMarkdownPath;
  }, [
    onMarkdownUpdated,
    onContentChanged,
    onCommandStateChanged,
    autoPairBracketsAndQuotes,
    initialMarkdown,
    documentPath,
    folderContextPath,
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
    setContextPopupAnchor(null);
  }, []);

  const requestContextPopup = useCallback((anchor: ContextPopupAnchor) => {
    contextPopupOpenRef.current = true;
    setContextPopupAnchor(anchor);
  }, []);

  const updateCommandState = useCallback((nextCommandState: EditorCommandState) => {
    commandStateRef.current = nextCommandState;
    setCommandState(nextCommandState);
    onCommandStateChangedRef.current?.();
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
    },
    [closeContextPopup],
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
        initialMarkdown: initialMarkdownRef.current,
        contextPopup: {
          isOpen: () => contextPopupOpenRef.current,
          onClose: closeContextPopup,
          onRequest: requestContextPopup,
        },
        getMarkdownReferenceContext: () => ({
          documentPath: documentPathRef.current,
          folderContextPath: folderContextPathRef.current,
        }),
        isAutoPairEnabled: () => autoPairBracketsAndQuotesRef.current,
        onMarkdownUpdated: (update) => {
          if (isActiveEditorCallback()) {
            onMarkdownUpdatedRef.current?.(update);
          }
        },
        onContentChanged: () => {
          if (isActiveEditorCallback()) {
            onContentChangedRef.current?.();
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

          return onOpenMarkdownPathRef.current(path);
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
    };
  }, [closeContextPopup, requestContextPopup, updateCommandState]);

  return {
    closeContextPopup,
    commandState,
    contextPopupAnchor,
    executeContextCommand,
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
