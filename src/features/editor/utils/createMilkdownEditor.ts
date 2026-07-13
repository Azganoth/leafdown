import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  rootAttrsCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import {
  commonmark,
  emphasisKeymap,
  inlineCodeKeymap,
  strongKeymap,
} from "@milkdown/kit/preset/commonmark";
import { gfm, strikethroughKeymap } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { highlight, highlightPluginConfig } from "@milkdown/plugin-highlight";

import { runEditorCommand, type EditorCommandId, type EditorCommandState } from "../commands";
import { createLeafdownAutoPairPlugin } from "../plugins/autoPair";
import { createLeafdownCommandKeymapPlugin } from "../plugins/commandKeymap";
import { createLeafdownCommandStatePlugin } from "../plugins/commandState";
import {
  createLeafdownContextPopupPlugin,
  type LeafdownContextPopupPluginOptions,
} from "../plugins/contextPopup";
import { createLeafdownDirtyTrackerPlugin } from "../plugins/dirtyTracker";
import { createLeafdownDoubleClickSelectionPlugin } from "../plugins/doubleClickSelection";
import { createLeafdownImageViewPlugin } from "../plugins/imageView";
import { createLeafdownLinkActivationPlugin } from "../plugins/linkActivation";
import { createLeafdownMarkerPresentationPlugin } from "../plugins/markerPresentation";
import {
  createLeafdownSourceProjectionPlugin,
  finalizeSourceProjection,
  hasTransientSourceProjection,
} from "../plugins/sourceProjection";
import { createLeafdownTableKeyboardPlugin } from "../plugins/tableKeyboard";
import { createLeafdownTaskListCheckboxPlugin } from "../plugins/taskListCheckbox";
import { createLeafdownHighlightParser } from "./highlighting";
import type { MarkdownLinkContext } from "./linkActivation";
import {
  EMPTY_MARKDOWN_REFERENCE_CONTEXT,
  type MarkdownReferenceContext,
} from "./markdownReferences";

export interface MilkdownMarkdownUpdate {
  markdown: string;
  previousMarkdown: string;
}

export interface CreateMilkdownEditorOptions {
  root: HTMLElement;
  initialMarkdown: string;
  contextPopup?: LeafdownContextPopupPluginOptions;
  getMarkdownReferenceContext?: () => MarkdownReferenceContext;
  isAutoPairEnabled?: () => boolean;
  onCommandStateChanged?: (state: EditorCommandState) => void;
  onContentChanged?: () => void;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
  onOpenMarkdownPath?: MarkdownLinkContext["onOpenMarkdownPath"];
}

export type MilkdownEditorInstance = Editor;

const DEFAULT_OPEN_MARKDOWN_PATH: MarkdownLinkContext["onOpenMarkdownPath"] = () => false;
const DISABLED_TEXT_ASSISTANCE_ATTRIBUTES = {
  spellcheck: "false",
  writingsuggestions: "false",
  autocorrect: "off",
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
  "data-ms-editor": "false",
};

export const createMilkdownEditor = async ({
  root,
  initialMarkdown,
  contextPopup,
  getMarkdownReferenceContext = () => EMPTY_MARKDOWN_REFERENCE_CONTEXT,
  isAutoPairEnabled = () => true,
  onCommandStateChanged,
  onContentChanged,
  onMarkdownUpdated,
  onOpenMarkdownPath = DEFAULT_OPEN_MARKDOWN_PATH,
}: CreateMilkdownEditorOptions) => {
  const parser = await createLeafdownHighlightParser();
  const getLinkContext = (): MarkdownLinkContext => ({
    ...getMarkdownReferenceContext(),
    onOpenMarkdownPath,
  });
  const editor = Editor.make();
  const runCommand = (commandId: EditorCommandId) => {
    const result = runEditorCommand(editor, commandId);

    return typeof result === "boolean" ? result : false;
  };

  return editor
    .use(commonmark)
    .use(createLeafdownTableKeyboardPlugin())
    .use(gfm)
    .use(createLeafdownCommandKeymapPlugin(runCommand))
    .use(history)
    .use(clipboard)
    .use(listener)
    .use(highlight)
    .use(createLeafdownImageViewPlugin(getMarkdownReferenceContext))
    .use(createLeafdownLinkActivationPlugin(getLinkContext))
    .use(createLeafdownSourceProjectionPlugin())
    .use(createLeafdownDoubleClickSelectionPlugin())
    .use(createLeafdownMarkerPresentationPlugin())
    .use(createLeafdownContextPopupPlugin(contextPopup))
    .use(createLeafdownAutoPairPlugin(isAutoPairEnabled))
    .use(createLeafdownCommandStatePlugin((state) => onCommandStateChanged?.(state)))
    .use(createLeafdownTaskListCheckboxPlugin())
    .use(createLeafdownDirtyTrackerPlugin(() => onContentChanged?.()))
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.update(rootAttrsCtx, (attributes) => ({
        ...attributes,
        ...DISABLED_TEXT_ASSISTANCE_ATTRIBUTES,
      }));
      ctx.update(editorViewOptionsCtx, (options) => ({
        ...options,
        attributes: {
          ...options.attributes,
          ...DISABLED_TEXT_ASSISTANCE_ATTRIBUTES,
        },
      }));
      ctx.set(defaultValueCtx, initialMarkdown);
      ctx.set(highlightPluginConfig.key, { parser });
      ctx.update(strongKeymap.key, (keymap) => ({
        ...keymap,
        ToggleBold: { ...keymap.ToggleBold, shortcuts: [] },
      }));
      ctx.update(emphasisKeymap.key, (keymap) => ({
        ...keymap,
        ToggleEmphasis: { ...keymap.ToggleEmphasis, shortcuts: [] },
      }));
      ctx.update(inlineCodeKeymap.key, (keymap) => ({
        ...keymap,
        ToggleInlineCode: { ...keymap.ToggleInlineCode, shortcuts: [] },
      }));
      ctx.update(strikethroughKeymap.key, (keymap) => ({
        ...keymap,
        ToggleStrikethrough: { ...keymap.ToggleStrikethrough, shortcuts: [] },
      }));

      if (onMarkdownUpdated) {
        ctx.get(listenerCtx).markdownUpdated((listenerCtx, markdown, previousMarkdown) => {
          if (hasTransientSourceProjection(listenerCtx.get(editorViewCtx).state)) {
            return;
          }

          onMarkdownUpdated({ markdown, previousMarkdown });
        });
      }
    });
};

export const getMilkdownEditorMarkdown = (editor: MilkdownEditorInstance) => {
  finalizeSourceProjection(editor.ctx.get(editorViewCtx));

  return editor.action(getMarkdown());
};
