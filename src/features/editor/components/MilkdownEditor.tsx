import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "./MilkdownEditor.css";

import { editorViewCtx } from "@milkdown/kit/core";
import { type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/cn";

import { createMilkdownEditor, getMilkdownEditorMarkdown } from "../utils/createMilkdownEditor";
import { runEditorCommand } from "../utils/editorCommands";
import { getEditorCommandState } from "../utils/editorCommandState";
import type {
  MilkdownEditorBridge,
  MilkdownEditorInstance,
  MilkdownMarkdownUpdate,
} from "../types";

export interface MilkdownEditorProps {
  documentKey: string;
  initialMarkdown: string;
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

  const onMarkdownUpdatedRef = useRef(onMarkdownUpdated);
  const onContentTransactionRef = useRef(onContentTransaction);
  const onCommandStateChangedRef = useRef(onCommandStateChanged);
  const autoPairBracketsAndQuotesRef = useRef(autoPairBracketsAndQuotes);

  useLayoutEffect(() => {
    onMarkdownUpdatedRef.current = onMarkdownUpdated;
    onContentTransactionRef.current = onContentTransaction;
    onCommandStateChangedRef.current = onCommandStateChanged;
    autoPairBracketsAndQuotesRef.current = autoPairBracketsAndQuotes;
  }, [onMarkdownUpdated, onContentTransaction, onCommandStateChanged, autoPairBracketsAndQuotes]);

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
        const editor = editorRef.current;

        if (!editor) {
          return {
            enabledCommands: {},
            hasActiveEditor: false,
            hasSelection: false,
            hasTableSelection: false,
          };
        }

        return getEditorCommandState(editor.ctx.get(editorViewCtx));
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
        initialMarkdown,
        onMarkdownUpdated: (update) => onMarkdownUpdatedRef.current?.(update),
        onContentTransaction: () => onContentTransactionRef.current?.(),
        onCommandStateChanged: () => onCommandStateChangedRef.current?.(),
        getAutoPairBracketsAndQuotes: () => autoPairBracketsAndQuotesRef.current,
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
      onCommandStateChangedRef.current?.();
    };

    void createEditor().catch(console.error);

    return () => {
      disposed = true;

      if (editorRef.current) {
        void editorRef.current.destroy();
        editorRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey]);

  return (
    <div
      className={cn("leafdown-editor", className)}
      data-code-block-soft-wrap={softWrapCodeBlocks}
      data-testid="milkdown-editor-host"
    >
      <div ref={rootRef} className="min-h-full w-full" />
    </div>
  );
}
