import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

import { createMilkdownEditor, getMilkdownEditorMarkdown } from "./createMilkdownEditor";
import type { MilkdownEditorBridge, MilkdownEditorInstance, MilkdownMarkdownUpdate } from "./types";

export interface MilkdownEditorProps {
  documentKey: string;
  initialMarkdown: string;
  className?: string;
  onBridgeChange?: (bridge: MilkdownEditorBridge | null) => void;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
}

export function MilkdownEditor({
  documentKey,
  initialMarkdown,
  className,
  onBridgeChange,
  onMarkdownUpdated,
}: MilkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MilkdownEditorInstance | null>(null);
  const onBridgeChangeRef = useRef(onBridgeChange);
  const onMarkdownUpdatedRef = useRef(onMarkdownUpdated);

  useEffect(() => {
    onBridgeChangeRef.current = onBridgeChange;
  }, [onBridgeChange]);

  useEffect(() => {
    onMarkdownUpdatedRef.current = onMarkdownUpdated;
  }, [onMarkdownUpdated]);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return undefined;
    }

    let disposed = false;
    let createdEditor: MilkdownEditorInstance | null = null;
    const bridge: MilkdownEditorBridge = {
      getMarkdown: () => {
        const editor = editorRef.current;

        if (!editor) {
          throw new Error("Milkdown editor is not available.");
        }

        return getMilkdownEditorMarkdown(editor);
      },
    };
    const editor = createMilkdownEditor({
      root,
      initialMarkdown,
      onMarkdownUpdated: (update) => onMarkdownUpdatedRef.current?.(update),
    });

    void editor.create().then((readyEditor) => {
      createdEditor = readyEditor;

      if (disposed) {
        void readyEditor.destroy();
        return;
      }

      editorRef.current = readyEditor;
      onBridgeChangeRef.current?.(bridge);
    });

    return () => {
      disposed = true;

      if (editorRef.current === createdEditor) {
        editorRef.current = null;
      }

      onBridgeChangeRef.current?.(null);

      if (createdEditor) {
        void createdEditor.destroy();
      }
    };
  }, [documentKey, initialMarkdown]);

  return (
    <div
      className={cn(
        "min-h-full w-full px-8 py-10 text-foreground [&_.ProseMirror]:mx-auto [&_.ProseMirror]:min-h-[calc(100vh-9rem)] [&_.ProseMirror]:w-full [&_.ProseMirror]:max-w-3xl [&_.ProseMirror]:outline-none",
        className,
      )}
      data-testid="milkdown-editor-host"
    >
      <div ref={rootRef} className="min-h-full w-full" />
    </div>
  );
}
