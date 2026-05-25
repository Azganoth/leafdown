import type { Editor } from "@milkdown/kit/core";
import type { AppCommandId, EditorCommandState } from "@/features/commands/types";

export interface MilkdownMarkdownUpdate {
  markdown: string;
  previousMarkdown: string;
}

export interface MilkdownEditorBridge {
  getMarkdown: () => string;
  getCommandState?: () => EditorCommandState;
  runCommand?: (commandId: AppCommandId) => boolean;
}

export interface CreateMilkdownEditorOptions {
  root: HTMLElement;
  initialMarkdown: string;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
  onContentTransaction?: () => void;
  getAutoPairBracketsAndQuotes?: () => boolean;
}

export type MilkdownEditorInstance = Editor;
