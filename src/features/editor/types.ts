import type { Editor } from "@milkdown/kit/core";
import type { AppCommandId, EditorCommandState } from "@/features/commands/types";
import type { MarkdownImageContext } from "./plugins/imageView";
import type { MarkdownLinkContext } from "./utils/linkActivation";

export type EditorContextPopupSource = "rightClick" | "selection";

export interface EditorContextPopupAnchor {
  x: number;
  y: number;
}

export interface EditorContextPopupRequest {
  anchor: EditorContextPopupAnchor;
  source: EditorContextPopupSource;
}

export interface MilkdownMarkdownUpdate {
  markdown: string;
  previousMarkdown: string;
}

export interface MilkdownEditorBridge {
  getMarkdown: () => string;
  getCommandState?: () => EditorCommandState;
  runCommand?: (commandId: AppCommandId) => boolean | Promise<boolean>;
}

export interface CreateMilkdownEditorOptions {
  root: HTMLElement;
  initialMarkdown: string;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
  onContentTransaction?: () => void;
  onCommandStateChanged?: () => void;
  onContextPopupClosed?: () => void;
  onContextPopupRequested?: (request: EditorContextPopupRequest) => void;
  getContextPopupOpen?: () => boolean;
  getAutoPairBracketsAndQuotes?: () => boolean;
  getImageContext?: () => MarkdownImageContext;
  getLinkContext?: () => MarkdownLinkContext;
}

export type MilkdownEditorInstance = Editor;
