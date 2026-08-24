import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
  rootAttrsCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history, historyKeymap } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import {
  blockquoteKeymap,
  bulletListKeymap,
  bulletListSchema,
  codeBlockKeymap,
  commonmark,
  emphasisKeymap,
  hardbreakSchema,
  headingKeymap,
  htmlSchema,
  inlineCodeKeymap,
  linkSchema,
  orderedListKeymap,
  paragraphKeymap,
  remarkPreserveEmptyLinePlugin,
  strongKeymap,
} from "@milkdown/kit/preset/commonmark";
import {
  extendListItemSchemaForTask,
  gfm,
  strikethroughInputRule,
  strikethroughKeymap,
} from "@milkdown/kit/preset/gfm";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorProps } from "@milkdown/kit/prose/view";
import { getMarkdown } from "@milkdown/kit/utils";
import { highlight, highlightPluginConfig } from "@milkdown/plugin-highlight";

import {
  getEditorCommandState,
  runEditorCommand,
  type EditorCommandId,
  type EditorCommandState,
} from "../commands";
import { createLeafdownAutoPairPlugin } from "../plugins/autoPair";
import { createLeafdownBlockStructurePlugin } from "../plugins/blockStructure";
import { createLeafdownClipboardPlugin } from "../plugins/clipboard";
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
import { createLeafdownLinkPresentationPlugin } from "../plugins/linkPresentation";
import { createLeafdownLogicalLinkSerializerPlugin } from "../plugins/logicalLinkSerializer";
import { createLeafdownMarkerPresentationPlugin } from "../plugins/markerPresentation";
import { createLeafdownMarkNestingPlugin } from "../plugins/markNesting";
import {
  createLeafdownSourceProjectionPlugin,
  finalizeSourceProjection,
  hasTransientSourceProjection,
} from "../plugins/sourceProjection";
import { createLeafdownStrikethroughInputRule } from "../plugins/strikethroughInputRule";
import { createLeafdownTableKeyboardPlugin } from "../plugins/tableKeyboard";
import {
  createLeafdownTableShapeGuardPlugin,
  createLeafdownTableShapePlugin,
} from "../plugins/tableShape";
import { createLeafdownTaskListCheckboxPlugin } from "../plugins/taskListCheckbox";
import { createLeafdownTrailingParagraphPlugin } from "../plugins/trailingParagraph";
import {
  BARE_AUTOLINK_MARKDOWN_TYPE,
  serializeBareAutolink,
  withBareAutolinkForm,
} from "./bareAutolinkMarkdown";
import { createClipboardTextSerializer } from "./clipboard";
import { normalizeProseMirrorClipboardHtml } from "./clipboardHtml";
import { createLeafdownHighlightParser } from "./highlighting";
import type { MarkdownLinkContext } from "./linkActivation";
import {
  EMPTY_MARKDOWN_REFERENCE_CONTEXT,
  type MarkdownReferenceContext,
} from "./markdownReferences";
import { serializeMarkdownText } from "./markdownText";
import {
  getRawHtmlMarkdownType,
  RAW_HTML_MARKDOWN_TYPE,
  serializeRawHtml,
} from "./rawHtmlMarkdown";

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

type EditorViewAttributes = EditorProps["attributes"];

// ProseMirror resolves attributes per state when given a function, so compose in whichever
// form arrives instead of flattening one into the other.
export const composeEditorViewAttributes = (
  previous: EditorViewAttributes,
  added: Record<string, string>,
): EditorViewAttributes =>
  typeof previous === "function"
    ? (state) => ({ ...previous(state), ...added })
    : { ...previous, ...added };

// The list item schema requires a leading paragraph, so an item whose source starts with any other
// block parses with an empty one filled in ahead of it. Written out it becomes a blank line, and
// CommonMark ends the item at the second one.
const withoutFilledLeadingParagraph = (node: ProseNode) => {
  const firstChild = node.firstChild;

  if (
    node.childCount < 2 ||
    !firstChild ||
    firstChild.type.name !== "paragraph" ||
    firstChild.content.size > 0 ||
    // GFM writes the checkbox into the item's first paragraph and drops it when that paragraph is
    // not there to hold it.
    node.attrs.checked != null
  ) {
    return node;
  }

  return node.copy(node.content.cut(firstChild.nodeSize));
};

// `parseMarkdown` builds `spread` with a template literal, so the attribute holds the string
// "false" where mdast expects a boolean. Forwarded raw, it reads as spread and writes every tight
// list loose.
const withBooleanSpread = (node: ProseNode) =>
  typeof node.attrs.spread === "boolean"
    ? node
    : node.type.create(
        { ...node.attrs, spread: node.attrs.spread === "true" },
        node.content,
        node.marks,
      );

const DEFAULT_OPEN_MARKDOWN_PATH: MarkdownLinkContext["onOpenMarkdownPath"] = () => false;
// Marks serialize in `spec.priority` order, 50 unless declared, and inline code declares 100 to
// stay innermost.
const LINK_MARK_PRIORITY = 75;
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
    const commandState = getEditorCommandState(editor.ctx.get(editorViewCtx));

    if (!commandState.enabledCommands[commandId]) {
      return false;
    }

    const result = runEditorCommand(editor, commandId);

    return typeof result === "boolean" ? result : false;
  };

  const configuredEditor = editor
    .use(createLeafdownBlockStructurePlugin())
    .use(createLeafdownMarkNestingPlugin())
    .use(createLeafdownTableShapePlugin())
    .use(commonmark)
    .use(createLeafdownTableKeyboardPlugin())
    .use(createLeafdownTableShapeGuardPlugin())
    .use(gfm)
    .use(createLeafdownStrikethroughInputRule())
    .use(createLeafdownLogicalLinkSerializerPlugin())
    .use(createLeafdownCommandKeymapPlugin(runCommand))
    .use(history)
    .use(clipboard)
    .use(createLeafdownClipboardPlugin())
    .use(listener)
    .use(highlight)
    .use(createLeafdownImageViewPlugin(getMarkdownReferenceContext))
    .use(createLeafdownLinkActivationPlugin(getLinkContext))
    .use(createLeafdownLinkPresentationPlugin())
    .use(createLeafdownSourceProjectionPlugin())
    .use(createLeafdownDoubleClickSelectionPlugin())
    .use(createLeafdownMarkerPresentationPlugin())
    .use(createLeafdownContextPopupPlugin(contextPopup))
    .use(createLeafdownAutoPairPlugin(isAutoPairEnabled))
    .use(createLeafdownCommandStatePlugin((state) => onCommandStateChanged?.(state)))
    .use(createLeafdownTaskListCheckboxPlugin())
    .use(createLeafdownTrailingParagraphPlugin())
    .use(createLeafdownDirtyTrackerPlugin(() => onContentChanged?.()))
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.update(rootAttrsCtx, (attributes) => ({
        ...attributes,
        ...DISABLED_TEXT_ASSISTANCE_ATTRIBUTES,
      }));
      ctx.update(editorViewOptionsCtx, (options) => {
        const previousTransformPastedHTML = options.transformPastedHTML;

        return {
          ...options,
          attributes: composeEditorViewAttributes(
            options.attributes,
            DISABLED_TEXT_ASSISTANCE_ATTRIBUTES,
          ),
          clipboardTextSerializer: createClipboardTextSerializer(ctx),
          transformPastedHTML: (html, view) =>
            normalizeProseMirrorClipboardHtml(previousTransformPastedHTML?.(html, view) ?? html),
        };
      });
      ctx.update(remarkStringifyOptionsCtx, (options) => ({
        ...options,
        handlers: {
          ...options.handlers,
          [BARE_AUTOLINK_MARKDOWN_TYPE]: serializeBareAutolink,
          [RAW_HTML_MARKDOWN_TYPE]: serializeRawHtml,
          text: serializeMarkdownText,
        },
      }));
      ctx.update(htmlSchema.key, (getSchema) => (schemaCtx) => {
        const schema = getSchema(schemaCtx);

        return {
          ...schema,
          toMarkdown: {
            ...schema.toMarkdown,
            runner: (state, node) => {
              const value = node.attrs.value as string;

              state.addNode(getRawHtmlMarkdownType(value), undefined, value);
            },
          },
        };
      });
      ctx.update(bulletListSchema.key, (getSchema) => (schemaCtx) => {
        const schema = getSchema(schemaCtx);

        return {
          ...schema,
          toMarkdown: {
            ...schema.toMarkdown,
            runner: (state, node) => schema.toMarkdown.runner(state, withBooleanSpread(node)),
          },
        };
      });
      ctx.update(hardbreakSchema.key, (getSchema) => (schemaCtx) => ({
        ...getSchema(schemaCtx),
        linebreakReplacement: true,
      }));
      ctx.update(linkSchema.key, (getSchema) => (schemaCtx) => ({
        ...withBareAutolinkForm(getSchema(schemaCtx)),
        priority: LINK_MARK_PRIORITY,
      }));
      // `extendSchema` registers a new slice, so an override on `listItemSchema` never reaches the
      // schema the editor holds.
      ctx.update(extendListItemSchemaForTask.key, (getSchema) => (schemaCtx) => {
        const schema = getSchema(schemaCtx);

        return {
          ...schema,
          toMarkdown: {
            ...schema.toMarkdown,
            runner: (state, node) =>
              schema.toMarkdown.runner(
                state,
                withBooleanSpread(withoutFilledLeadingParagraph(node)),
              ),
          },
        };
      });
      ctx.set(defaultValueCtx, initialMarkdown);
      ctx.set(highlightPluginConfig.key, { parser });
      ctx.update(historyKeymap.key, (keymap) => ({
        ...keymap,
        Redo: { ...keymap.Redo, shortcuts: [] },
        Undo: { ...keymap.Undo, shortcuts: [] },
      }));
      ctx.update(paragraphKeymap.key, (keymap) => ({
        ...keymap,
        TurnIntoText: { ...keymap.TurnIntoText, shortcuts: [] },
      }));
      ctx.update(headingKeymap.key, (keymap) => ({
        ...keymap,
        TurnIntoH1: { ...keymap.TurnIntoH1, shortcuts: [] },
        TurnIntoH2: { ...keymap.TurnIntoH2, shortcuts: [] },
        TurnIntoH3: { ...keymap.TurnIntoH3, shortcuts: [] },
        TurnIntoH4: { ...keymap.TurnIntoH4, shortcuts: [] },
        TurnIntoH5: { ...keymap.TurnIntoH5, shortcuts: [] },
        TurnIntoH6: { ...keymap.TurnIntoH6, shortcuts: [] },
      }));
      ctx.update(orderedListKeymap.key, (keymap) => ({
        ...keymap,
        WrapInOrderedList: { ...keymap.WrapInOrderedList, shortcuts: [] },
      }));
      ctx.update(bulletListKeymap.key, (keymap) => ({
        ...keymap,
        WrapInBulletList: { ...keymap.WrapInBulletList, shortcuts: [] },
      }));
      ctx.update(blockquoteKeymap.key, (keymap) => ({
        ...keymap,
        WrapInBlockquote: { ...keymap.WrapInBlockquote, shortcuts: [] },
      }));
      ctx.update(codeBlockKeymap.key, (keymap) => ({
        ...keymap,
        CreateCodeBlock: { ...keymap.CreateCodeBlock, shortcuts: [] },
      }));
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

  // The preset pairs empty-paragraph serialization with a parse-time plugin that deletes every
  // `<br>` it finds, authored ones included. Leafdown represents a blank paragraph with blank
  // lines instead, so raw HTML stays document content.
  await configuredEditor.remove(remarkPreserveEmptyLinePlugin);

  await configuredEditor.remove(strikethroughInputRule);

  return configuredEditor;
};

export const getMilkdownEditorMarkdown = (editor: MilkdownEditorInstance) => {
  finalizeSourceProjection(editor.ctx.get(editorViewCtx));

  return editor.action(getMarkdown());
};
