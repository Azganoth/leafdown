import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

import { createMilkdownEditor } from "./createMilkdownEditor";

export interface MilkdownEditorProps {
  documentKey: string;
  initialMarkdown: string;
  className?: string;
}

export function MilkdownEditor({ documentKey, initialMarkdown, className }: MilkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return undefined;
    }

    let disposed = false;
    const editor = createMilkdownEditor({ root, initialMarkdown });

    void editor.create().then((createdEditor) => {
      if (disposed) {
        void createdEditor.destroy();
      }
    });

    return () => {
      disposed = true;
      void editor.destroy();
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
