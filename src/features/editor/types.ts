import type { Editor } from "@milkdown/kit/core";
import type { AppCommandId, EditorCommandState } from "@/features/commands/types";
import type { MarkdownImageContext } from "./plugins/imageView";
import type { MarkdownLinkContext } from "./utils/linkActivation";

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
  getAutoPairBracketsAndQuotes?: () => boolean;
  getImageContext?: () => MarkdownImageContext;
  getLinkContext?: () => MarkdownLinkContext;
}

export type MilkdownEditorInstance = Editor;
