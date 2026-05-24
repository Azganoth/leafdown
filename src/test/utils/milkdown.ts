import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  createMilkdownEditor,
  getMilkdownEditorMarkdown,
  type MilkdownEditorInstance,
} from "@/features/editor";

export interface MountedMilkdownEditor {
  root: HTMLDivElement;
  editor: MilkdownEditorInstance;
  view: EditorView;
  getMarkdown: () => string;
  destroy: () => Promise<void>;
}

export interface MountMilkdownEditorOptions {
  rootClassName?: string;
  autoPairBracketsAndQuotes?: boolean;
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
    getAutoPairBracketsAndQuotes: () => options.autoPairBracketsAndQuotes ?? true,
  });
  await editor.create();

  return {
    root,
    editor,
    view: editor.ctx.get(editorViewCtx),
    getMarkdown: () => getMilkdownEditorMarkdown(editor),
    destroy: async () => {
      await editor.destroy();
      root.remove();
    },
  };
};
