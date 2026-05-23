import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  createMilkdownEditor,
  getMilkdownEditorMarkdown,
  type MilkdownEditorInstance,
} from "@/components/editor";

export interface MountedMilkdownEditor {
  root: HTMLDivElement;
  editor: MilkdownEditorInstance;
  view: EditorView;
  getMarkdown: () => string;
  destroy: () => Promise<void>;
}

export const mountMilkdownEditor = async (
  initialMarkdown: string,
): Promise<MountedMilkdownEditor> => {
  const root = document.createElement("div");
  document.body.append(root);

  const editor = createMilkdownEditor({ root, initialMarkdown });
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
