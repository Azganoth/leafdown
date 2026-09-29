import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "katex/dist/katex.min.css";
import "./milkdown-editor.css";
import type { Ref } from "react";

import { cn } from "@/lib/utils";

import {
  useMilkdownEditorInstance,
  type EditorViewState,
  type MilkdownEditorBridge,
} from "../hooks/useMilkdownEditorInstance";
import type { MilkdownMarkdownUpdate } from "../utils/createMilkdownEditor";
import type {
  DocumentFont,
  DocumentLineSpacing,
  DocumentTextSize,
} from "../utils/documentTypography";
import type { MarkdownLinkContext } from "../utils/linkActivation";
import type { MarkdownReferenceContext } from "../utils/markdownReferences";
import { EditorBlockInsertionMenu } from "./editor-block-insertion-menu";
import { EditorCodeBlockLanguagePicker } from "./editor-code-block-language-picker";
import { EditorContextPopup } from "./editor-context-popup";
import { EditorFootnotePreview } from "./editor-footnote-preview";
import { EditorSearchPanel } from "./editor-search-panel";

export type { EditorViewState, MilkdownEditorBridge } from "../hooks/useMilkdownEditorInstance";

export interface MilkdownEditorProps extends Partial<MarkdownReferenceContext> {
  initialMarkdown: string;
  initialViewState?: EditorViewState | null;
  onOpenMarkdownPath?: MarkdownLinkContext["onOpenMarkdownPath"];
  onReadMarkdownPath?: MarkdownLinkContext["onReadMarkdownPath"];
  wikiCompletionPaths?: string[];
  className?: string;
  ref?: Ref<MilkdownEditorBridge>;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
  onContentChanged?: () => void;
  onCommandStateChanged?: () => void;
  onDocumentStatusChanged?: () => void;
  autoPairBracketsAndQuotes?: boolean;
  displayCodeBlockLineNumbers?: boolean;
  softWrapCodeBlocks?: boolean;
  documentFont?: DocumentFont;
  textSize?: DocumentTextSize;
  lineSpacing?: DocumentLineSpacing;
}

export function MilkdownEditor({
  initialMarkdown,
  initialViewState = null,
  documentPath = null,
  folderContextPath = null,
  onOpenMarkdownPath,
  onReadMarkdownPath,
  wikiCompletionPaths = [],
  className,
  ref,
  onMarkdownUpdated,
  onContentChanged,
  onCommandStateChanged,
  onDocumentStatusChanged,
  autoPairBracketsAndQuotes = true,
  displayCodeBlockLineNumbers = false,
  softWrapCodeBlocks = false,
  documentFont = "inter",
  textSize = 16,
  lineSpacing = "default",
}: MilkdownEditorProps) {
  const {
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
  } = useMilkdownEditorInstance({
    autoPairBracketsAndQuotes,
    displayCodeBlockLineNumbers,
    documentPath,
    folderContextPath,
    initialMarkdown,
    initialViewState,
    onMarkdownUpdated,
    onContentChanged,
    onCommandStateChanged,
    onDocumentStatusChanged,
    onOpenMarkdownPath,
    onReadMarkdownPath,
    wikiCompletionPaths,
    ref,
  });

  return (
    <div
      className={cn("leafdown-editor", className)}
      data-code-block-soft-wrap={softWrapCodeBlocks}
      data-document-font={documentFont}
      data-text-size={textSize}
      data-line-spacing={lineSpacing}
      data-search-open={search.state.open || undefined}
      data-testid="milkdown-editor-host"
    >
      <EditorSearchPanel search={search} />
      <div ref={rootRef} className="min-h-full w-full" />
      <EditorContextPopup
        commandState={commandState}
        onClose={closeContextPopup}
        onExecute={executeContextCommand}
        onReturnFocus={focusEditor}
        request={contextPopupRequest}
      />
      <EditorBlockInsertionMenu
        request={blockInsertionRequest}
        onClose={closeBlockInsertion}
        onExecute={executeBlockInsertion}
        onReturnFocus={focusEditor}
      />
      <EditorCodeBlockLanguagePicker
        request={codeBlockLanguageRequest}
        onApply={applyCodeBlockLanguage}
        onCancel={cancelCodeBlockLanguage}
        onReturnFocus={focusEditor}
      />
      <EditorFootnotePreview request={footnotePreviewRequest} />
    </div>
  );
}
