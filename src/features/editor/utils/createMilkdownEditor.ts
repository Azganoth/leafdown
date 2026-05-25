import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { highlight, highlightPluginConfig } from "@milkdown/plugin-highlight";

import { createLeafdownHighlightParser } from "./highlighting";
import { createLeafdownAutoPairPlugin } from "../plugins/autoPair";
import { createLeafdownDirtyTrackerPlugin } from "../plugins/dirtyTracker";
import type { CreateMilkdownEditorOptions, MilkdownEditorInstance } from "../types";

export const createMilkdownEditor = async ({
  root,
  initialMarkdown,
  onMarkdownUpdated,
  onContentTransaction,
  getAutoPairBracketsAndQuotes = () => true,
}: CreateMilkdownEditorOptions) => {
  const parser = await createLeafdownHighlightParser();

  return Editor.make()
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(clipboard)
    .use(listener)
    .use(highlight)
    .use(createLeafdownAutoPairPlugin(getAutoPairBracketsAndQuotes))
    .use(createLeafdownDirtyTrackerPlugin(() => onContentTransaction?.()))
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initialMarkdown);
      ctx.set(highlightPluginConfig.key, { parser });

      if (onMarkdownUpdated) {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, previousMarkdown) => {
          onMarkdownUpdated({ markdown, previousMarkdown });
        });
      }
    });
};

export const getMilkdownEditorMarkdown = (editor: MilkdownEditorInstance) =>
  editor.action(getMarkdown());
