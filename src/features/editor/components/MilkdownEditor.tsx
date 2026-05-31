import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "./MilkdownEditor.css";

import { editorViewCtx } from "@milkdown/kit/core";
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/cn";
import { inactiveEditorCommandState } from "@/lib/documentEditorBridge";

import { createMilkdownEditor, getMilkdownEditorMarkdown } from "../utils/createMilkdownEditor";
import { runEditorCommand } from "../utils/editorCommands";
import { getEditorCommandState } from "../utils/editorCommandState";
import { EditorContextPopup } from "./EditorContextPopup";
import type {
  EditorContextPopupRequest,
  MilkdownEditorBridge,
  MilkdownEditorInstance,
  MilkdownMarkdownUpdate,
} from "../types";

export interface MilkdownEditorProps {
  documentKey: string;
  initialMarkdown: string;
  documentPath?: string | null;
  folderContextPath?: string | null;
  className?: string;
  ref?: Ref<MilkdownEditorBridge>;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
  onContentTransaction?: () => void;
  onCommandStateChanged?: () => void;
  autoPairBracketsAndQuotes?: boolean;
  softWrapCodeBlocks?: boolean;
}

export function MilkdownEditor({
  documentKey,
  initialMarkdown,
  documentPath = null,
  folderContextPath = null,
  className,
  ref,
  onMarkdownUpdated,
  onContentTransaction,
  onCommandStateChanged,
  autoPairBracketsAndQuotes = true,
  softWrapCodeBlocks = false,
}: MilkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MilkdownEditorInstance | null>(null);
  const [commandStateVersion, setCommandStateVersion] = useState(0);
  const [contextPopupRequest, setContextPopupRequest] = useState<EditorContextPopupRequest | null>(
    null,
  );

  const onMarkdownUpdatedRef = useRef(onMarkdownUpdated);
  const onContentTransactionRef = useRef(onContentTransaction);
  const onCommandStateChangedRef = useRef(onCommandStateChanged);
  const autoPairBracketsAndQuotesRef = useRef(autoPairBracketsAndQuotes);
  const initialMarkdownRef = useRef(initialMarkdown);
  const documentPathRef = useRef(documentPath);
  const folderContextPathRef = useRef(folderContextPath);
  const contextPopupOpenRef = useRef(false);

  useLayoutEffect(() => {
    onMarkdownUpdatedRef.current = onMarkdownUpdated;
    onContentTransactionRef.current = onContentTransaction;
    onCommandStateChangedRef.current = onCommandStateChanged;
    autoPairBracketsAndQuotesRef.current = autoPairBracketsAndQuotes;
    initialMarkdownRef.current = initialMarkdown;
    documentPathRef.current = documentPath;
    folderContextPathRef.current = folderContextPath;
  }, [
    onMarkdownUpdated,
    onContentTransaction,
    onCommandStateChanged,
    autoPairBracketsAndQuotes,
    initialMarkdown,
    documentPath,
    folderContextPath,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => {
        const editor = editorRef.current;

        if (!editor) {
          throw new Error("Milkdown editor is not available.");
        }

        return getMilkdownEditorMarkdown(editor);
      },
      getCommandState: () => {
        return getCurrentCommandState();
      },
      runCommand: (commandId) => {
        const editor = editorRef.current;

        if (!editor) {
          return false;
        }

        return runEditorCommand(editor, commandId);
      },
    }),
    [],
  );

  const closeContextPopup = useCallback(() => {
    contextPopupOpenRef.current = false;
    setContextPopupRequest(null);
  }, []);

  const requestContextPopup = useCallback((request: EditorContextPopupRequest) => {
    contextPopupOpenRef.current = true;
    setContextPopupRequest(request);
  }, []);

  const notifyCommandStateChanged = useCallback(() => {
    setCommandStateVersion((version) => version + 1);
    onCommandStateChangedRef.current?.();
  }, []);

  const executeContextCommand = useCallback(
    (commandId: Parameters<typeof runEditorCommand>[1]) => {
      const editor = editorRef.current;

      if (!editor) {
        return;
      }

      closeContextPopup();
      void Promise.resolve(runEditorCommand(editor, commandId)).catch(console.error);
    },
    [closeContextPopup],
  );

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return undefined;
    }

    let disposed = false;

    const createEditor = async () => {
      if (disposed) return;

      const editor = await createMilkdownEditor({
        root,
        initialMarkdown: initialMarkdownRef.current,
        onMarkdownUpdated: (update) => onMarkdownUpdatedRef.current?.(update),
        onContentTransaction: () => onContentTransactionRef.current?.(),
        onCommandStateChanged: notifyCommandStateChanged,
        onContextPopupClosed: closeContextPopup,
        onContextPopupRequested: requestContextPopup,
        getContextPopupOpen: () => contextPopupOpenRef.current,
        getAutoPairBracketsAndQuotes: () => autoPairBracketsAndQuotesRef.current,
        getImageContext: () => ({
          documentPath: documentPathRef.current,
          folderContextPath: folderContextPathRef.current,
        }),
        getLinkContext: () => ({
          documentPath: documentPathRef.current,
          folderContextPath: folderContextPathRef.current,
        }),
      });

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
      notifyCommandStateChanged();
    };

    void createEditor().catch(console.error);

    return () => {
      disposed = true;

      if (editorRef.current) {
        void editorRef.current.destroy();
        editorRef.current = null;
      }

      closeContextPopup();
    };
  }, [closeContextPopup, documentKey, notifyCommandStateChanged, requestContextPopup]);

  const getCurrentCommandState = () => {
    const editor = editorRef.current;

    if (!editor) {
      return inactiveEditorCommandState;
    }

    try {
      return getEditorCommandState(editor.ctx.get(editorViewCtx));
    } catch {
      return {
        ...inactiveEditorCommandState,
        hasActiveEditor: true,
      };
    }
  };

  const contextPopupCommandState = getCurrentCommandState();

  void commandStateVersion;

  return (
    <div
      className={cn("leafdown-editor", className)}
      data-code-block-soft-wrap={softWrapCodeBlocks}
      data-testid="milkdown-editor-host"
    >
      <div ref={rootRef} className="min-h-full w-full" />
      <EditorContextPopup
        anchor={contextPopupRequest?.anchor ?? null}
        commandState={contextPopupCommandState}
        onClose={closeContextPopup}
        onExecuteCommand={executeContextCommand}
        open={Boolean(contextPopupRequest)}
      />
    </div>
  );
}
