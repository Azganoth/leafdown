import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { getMarkdown } from "@milkdown/kit/utils";

import type { CreateMilkdownEditorOptions, MilkdownEditorInstance } from "./types";

export const createMilkdownEditor = ({
  root,
  initialMarkdown,
  onMarkdownUpdated,
}: CreateMilkdownEditorOptions): MilkdownEditorInstance =>
  Editor.make()
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(clipboard)
    .use(listener)
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initialMarkdown);

      if (onMarkdownUpdated) {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, previousMarkdown) => {
          onMarkdownUpdated({ markdown, previousMarkdown });
        });
      }
    });

export const getMilkdownEditorMarkdown = (editor: MilkdownEditorInstance): string =>
  editor.action(getMarkdown());
