import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "./MilkdownEditor.css";

import { type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/cn";

import { createMilkdownEditor, getMilkdownEditorMarkdown } from "../utils/createMilkdownEditor";
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
  autoPairBracketsAndQuotes = true,
  softWrapCodeBlocks = false,
}: MilkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MilkdownEditorInstance | null>(null);

  const onMarkdownUpdatedRef = useRef(onMarkdownUpdated);
  const onContentTransactionRef = useRef(onContentTransaction);
  const autoPairBracketsAndQuotesRef = useRef(autoPairBracketsAndQuotes);

  useLayoutEffect(() => {
    onMarkdownUpdatedRef.current = onMarkdownUpdated;
    onContentTransactionRef.current = onContentTransaction;
    autoPairBracketsAndQuotesRef.current = autoPairBracketsAndQuotes;
  }, [onMarkdownUpdated, onContentTransaction, autoPairBracketsAndQuotes]);

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
