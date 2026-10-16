import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import { afterEach } from "vitest";

import {
  type CalloutTypeRequest,
  type CodeBlockLanguageRequest,
  type CodeBlockSetting,
  type ContextPopupRequest,
  type ControlTooltipRequest,
  type BlockInsertionRequest,
  createMilkdownEditor,
  type FootnotePreviewRequest,
  type LinkPreviewRequest,
  type EditorCommandState,
  type EditorDocumentStatus,
  type HeadingOutlineState,
  getMilkdownEditorMarkdown,
  type MarkdownReferenceContext,
  type MilkdownEditorInstance,
} from "@/features/editor";

export interface MountedMilkdownEditor {
  root: HTMLDivElement;
  editor: MilkdownEditorInstance;
  view: EditorView;
  getMarkdown: () => string;
  destroy: () => Promise<void>;
}

export interface MountMilkdownEditorOptions extends Partial<MarkdownReferenceContext> {
  rootClassName?: string;
  autoPairBracketsAndQuotes?: boolean;
  displayCodeBlockLineNumbers?: boolean;
  softWrapCodeBlocks?: boolean;
  onCodeBlockSettingChange?: (setting: CodeBlockSetting, enabled: boolean) => void;
  onContentChanged?: () => void;
  onCommandStateChanged?: (state: EditorCommandState) => void;
  onDocumentStatusChanged?: (status: EditorDocumentStatus) => void;
  onHeadingOutlineChanged?: (outline: HeadingOutlineState) => void;
  onOpenMarkdownPath?: (path: string) => boolean | Promise<boolean>;
  onReadMarkdownPath?: (path: string) => Promise<string>;
  wikiCompletionPaths?: string[];
  onContextPopupClosed?: () => void;
  onContextPopupRequested?: (request: ContextPopupRequest) => void;
  onBlockInsertionRequested?: (request: BlockInsertionRequest) => void;
  getContextPopupOpen?: () => boolean;
  onFootnotePreviewClosed?: () => void;
  onFootnotePreviewRequested?: (request: FootnotePreviewRequest) => void;
  footnotePreviewDelayMs?: number;
  onLinkPreviewClosed?: () => void;
  onControlTooltipClosed?: () => void;
  onControlTooltipRequested?: (request: ControlTooltipRequest) => void;
  onLinkPreviewRequested?: (request: LinkPreviewRequest) => void;
  linkPreviewDelayMs?: number;
  onCodeBlockLanguageClosed?: () => void;
  onCodeBlockLanguageRequested?: (request: CodeBlockLanguageRequest) => void;
  onCalloutTypeClosed?: () => void;
  onCalloutTypeRequested?: (request: CalloutTypeRequest) => void;
}

export const mountMilkdownEditor = async (
  initialMarkdown: string,
  options: MountMilkdownEditorOptions = {},
): Promise<MountedMilkdownEditor> => {
  const root = document.createElement("div");
  root.className = options.rootClassName ?? "";
  document.body.append(root);

  const editor = await createMilkdownEditor({
    root,
    initialMarkdown,
    contextPopup: {
      isOpen: options.getContextPopupOpen,
      onClose: options.onContextPopupClosed,
      onRequest: options.onContextPopupRequested,
    },
    blockInsertion: { onRequest: options.onBlockInsertionRequested },
    footnotePreview: {
      onClose: options.onFootnotePreviewClosed,
      onRequest: options.onFootnotePreviewRequested,
      pointerDelayMs: options.footnotePreviewDelayMs,
    },
    linkPreview: {
      onClose: options.onLinkPreviewClosed,
      onRequest: options.onLinkPreviewRequested,
      pointerDelayMs: options.linkPreviewDelayMs,
    },
    codeBlockLanguage: {
      onClose: options.onCodeBlockLanguageClosed,
      onRequest: options.onCodeBlockLanguageRequested,
    },
    controlTooltip: {
      onClose: options.onControlTooltipClosed,
      onRequest: options.onControlTooltipRequested,
    },
    calloutType: {
      onClose: options.onCalloutTypeClosed,
      onRequest: options.onCalloutTypeRequested,
    },
    getMarkdownReferenceContext: () => ({
      documentPath: options.documentPath ?? null,
      folderContextPath: options.folderContextPath ?? null,
    }),
    isAutoPairEnabled: () => options.autoPairBracketsAndQuotes ?? true,
    areCodeLineNumbersEnabled: () => options.displayCodeBlockLineNumbers ?? false,
    isCodeBlockSoftWrapEnabled: () => options.softWrapCodeBlocks ?? false,
    onCodeBlockSettingChange: options.onCodeBlockSettingChange,
    onContentChanged: options.onContentChanged,
    onCommandStateChanged: options.onCommandStateChanged,
    onDocumentStatusChanged: options.onDocumentStatusChanged,
    onHeadingOutlineChanged: options.onHeadingOutlineChanged,
    onOpenMarkdownPath: options.onOpenMarkdownPath ?? (() => false),
    onReadMarkdownPath: options.onReadMarkdownPath,
    getWikiCompletionPaths: () => options.wikiCompletionPaths ?? [],
  });
  await editor.create();

  return {
    root,
    editor,
    view: editor.ctx.get(editorViewCtx),
    getMarkdown: () => getMilkdownEditorMarkdown(editor),
    destroy: async () => {
      try {
        await editor.destroy();
      } finally {
        root.remove();
      }
    },
  };
};

export const setupMilkdownEditorMount = (defaults: MountMilkdownEditorOptions = {}) => {
  const mountedEditors: MountedMilkdownEditor[] = [];

  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  return async (initialMarkdown: string, options: MountMilkdownEditorOptions = {}) => {
    const mounted = await mountMilkdownEditor(initialMarkdown, { ...defaults, ...options });
    mountedEditors.push(mounted);
    return mounted;
  };
};
