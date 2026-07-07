import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "./MilkdownEditor.css";
import type { Ref } from "react";

import { cn } from "@/lib/cn";

import {
  useMilkdownEditorInstance,
  type MilkdownEditorBridge,
} from "../hooks/useMilkdownEditorInstance";
import type { MilkdownMarkdownUpdate } from "../utils/createMilkdownEditor";
import type { MarkdownLinkContext } from "../utils/linkActivation";
import type { MarkdownReferenceContext } from "../utils/markdownReferences";
import { EditorContextPopup } from "./EditorContextPopup";

export type { MilkdownEditorBridge } from "../hooks/useMilkdownEditorInstance";

export interface MilkdownEditorProps extends Partial<MarkdownReferenceContext> {
  initialMarkdown: string;
  onOpenMarkdownPath?: MarkdownLinkContext["onOpenMarkdownPath"];
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
