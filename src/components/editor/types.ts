import type { Editor } from "@milkdown/kit/core";

export interface MilkdownMarkdownUpdate {
  markdown: string;
  previousMarkdown: string;
}

export interface MilkdownEditorBridge {
  getMarkdown: () => string;
}

export interface CreateMilkdownEditorOptions {
  root: HTMLElement;
  initialMarkdown: string;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
  getAutoPairBracketsAndQuotes?: () => boolean;
}

export type MilkdownEditorInstance = Editor;
