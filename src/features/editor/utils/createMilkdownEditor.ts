import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
  rootAttrsCtx,
  rootCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history, historyKeymap } from "@milkdown/kit/plugin/history";
import {
  blockquoteKeymap,
  blockquoteSchema,
  bulletListKeymap,
  bulletListSchema,
  codeBlockKeymap,
  codeBlockSchema,
  commonmark,
  emphasisKeymap,
  hardbreakSchema,
  imageSchema,
  headingAttr,
  headingKeymap,
  headingSchema,
  hrSchema,
  htmlSchema,
  inlineCodeInputRule,
  inlineCodeKeymap,
  inlineCodeSchema,
  insertHrInputRule,
  linkSchema,
  orderedListKeymap,
  orderedListSchema,
  paragraphKeymap,
  paragraphSchema,
  remarkInlineLinkPlugin,
  remarkPreserveEmptyLinePlugin,
  strongKeymap,
  syncHeadingIdPlugin,
} from "@milkdown/kit/preset/commonmark";
import {
  extendListItemSchemaForTask,
  footnoteDefinitionSchema,
  gfm,
  strikethroughInputRule,
  strikethroughKeymap,
  tableSchema,
} from "@milkdown/kit/preset/gfm";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorProps } from "@milkdown/kit/prose/view";
import { getMarkdown } from "@milkdown/kit/utils";

import {
  getEditorCommandState,
  runEditorCommand,
  type EditorCommandId,
  type EditorCommandState,
} from "../commands";
import { createLeafdownAttentionPairingPlugin } from "../plugins/attentionPairing";
import { createLeafdownAutolinkLiteralPositionPlugin } from "../plugins/autolinkLiteralPosition";
import { createLeafdownAutoPairPlugin } from "../plugins/autoPair";
import {
  createLeafdownBlockSelectionPlugin,
  type BlockInsertionOptions,
} from "../plugins/blockSelectionInteraction";
import { createLeafdownBlockSelectionKeyboardPlugin } from "../plugins/blockSelectionKeyboard";
import { createLeafdownBlockSelectionOperationsPlugin } from "../plugins/blockSelectionOperations";
import { createLeafdownBlockStructurePlugin } from "../plugins/blockStructure";
import { calloutSchema, createLeafdownCalloutPlugin } from "../plugins/callout";
import { createLeafdownCalloutInputPlugin } from "../plugins/calloutInput";
import {
  createLeafdownCalloutTypePlugin,
  type LeafdownCalloutTypePluginOptions,
} from "../plugins/calloutType";
import { createLeafdownCalloutViewPlugin } from "../plugins/calloutView";
import {
  createLeafdownCharacterReferencePlugin,
  leafdownCharacterReferenceSchema,
} from "../plugins/characterReference";
import {
  createLeafdownCitationRemarkPlugin,
  createLeafdownCitationViewPlugin,
  leafdownCitationSchema,
  serializeCitation,
} from "../plugins/citation";
import { createLeafdownClipboardPlugin } from "../plugins/clipboard";
import { createLeafdownCodeBlockCollapsePlugin } from "../plugins/codeBlockCollapse";
import {
  createLeafdownCodeBlockControlsPlugin,
  type CodeBlockSetting,
} from "../plugins/codeBlockControls";
import {
  createLeafdownCodeBlockLanguagePlugin,
  type LeafdownCodeBlockLanguagePluginOptions,
} from "../plugins/codeBlockLanguage";
import { createLeafdownCodeBlockViewPlugin } from "../plugins/codeBlockView";
import { createLeafdownCodeFormPlugin } from "../plugins/codeForm";
import { createLeafdownCodeHighlightPlugin } from "../plugins/codeHighlight";
import { createLeafdownCodeLineNumbersPlugin } from "../plugins/codeLineNumbers";
import { createLeafdownCodeSpanInputRule } from "../plugins/codeSpanInputRule";
import { createLeafdownCommandKeymapPlugin } from "../plugins/commandKeymap";
import { createLeafdownCommandStatePlugin } from "../plugins/commandState";
import {
  createLeafdownContextPopupPlugin,
  type LeafdownContextPopupPluginOptions,
} from "../plugins/contextPopup";
import { createLeafdownContinuationFormPlugin } from "../plugins/continuationForm";
import {
  createLeafdownControlTooltipPlugin,
  type LeafdownControlTooltipPluginOptions,
} from "../plugins/controlTooltip";
import {
  createLeafdownDefinitionListPlugin,
  leafdownDefinitionDescriptionSchema,
  leafdownDefinitionListSchema,
  leafdownDefinitionTermSchema,
} from "../plugins/definitionList";
import {
  createLeafdownDefinitionListInputRule,
  createLeafdownDefinitionSpacingPlugin,
} from "../plugins/definitionListInputRule";
import { createLeafdownDirtyTrackerPlugin } from "../plugins/dirtyTracker";
import {
  createLeafdownDocumentEndPlugin,
  createLeafdownDocumentEndRemarkPlugin,
} from "../plugins/documentEnd";
import { createLeafdownDocumentStatusPlugin } from "../plugins/documentStatus";
import { createLeafdownDoubleClickSelectionPlugin } from "../plugins/doubleClickSelection";
import {
  commitFootnoteDefinitionLabels,
  createLeafdownFootnoteDefinitionLabelPlugin,
  leafdownFootnoteDefinitionLabelSchema,
  settleFootnoteDefinitionLabels,
} from "../plugins/footnoteDefinitionLabel";
import { createLeafdownFootnoteLabelPlugin } from "../plugins/footnoteLabel";
import { createLeafdownFootnoteNavigationPlugin } from "../plugins/footnoteNavigation";
import {
  createLeafdownFootnotePreviewPlugin,
  type LeafdownFootnotePreviewPluginOptions,
} from "../plugins/footnotePreview";
import {
  createLeafdownFrontmatterRemarkPlugin,
  createLeafdownFrontmatterInputPlugin,
  leafdownDocumentSchema,
  createLeafdownFrontmatterViewPlugin,
  leafdownFrontmatterSchema,
  serializeFrontmatter,
} from "../plugins/frontmatter";
import { createLeafdownHardBreakFormPlugin } from "../plugins/hardBreakForm";
import { createLeafdownHeadingFoldPlugin } from "../plugins/headingFold";
import { createLeafdownHeadingFormPlugin } from "../plugins/headingForm";
import { createLeafdownHeadingOutlinePlugin } from "../plugins/headingOutline";
import { createLeafdownHtmlViewPlugin } from "../plugins/htmlView";
import { createLeafdownImageViewPlugin } from "../plugins/imageView";
import { createLeafdownLinkActivationPlugin } from "../plugins/linkActivation";
import { createLeafdownLinkPresentationPlugin } from "../plugins/linkPresentation";
import {
  createLeafdownLinkPreviewPlugin,
  type LeafdownLinkPreviewPluginOptions,
} from "../plugins/linkPreview";
import { createLeafdownListFormPlugin } from "../plugins/listForm";
import { createLeafdownLogicalLinkSerializerPlugin } from "../plugins/logicalLinkSerializer";
import { createLeafdownMarkerPresentationPlugin } from "../plugins/markerPresentation";
import { createLeafdownMarkNestingPlugin } from "../plugins/markNesting";
import {
  createLeafdownMathRemarkPlugin,
  createLeafdownMathViewPlugin,
  leafdownMathSchema,
  serializeMath,
} from "../plugins/math";
import { createLeafdownMermaidModePlugin } from "../plugins/mermaidMode";
import { createLeafdownPrevailingFormPlugin } from "../plugins/prevailingForm";
import { createLeafdownReactSelectionOptOutPlugin } from "../plugins/reactSelectionOptOut";
import {
  commitReferenceDefinitionFields,
  createLeafdownReferenceDefinitionFieldsPlugin,
  leafdownDefinitionDestinationSchema,
  leafdownDefinitionLabelSchema,
  leafdownDefinitionTitleSchema,
  settleReferenceDefinitionFields,
} from "../plugins/referenceDefinitionFields";
import {
  createLeafdownReferenceLinkPlugin,
  leafdownDefinitionSchema,
} from "../plugins/referenceLink";
import { createLeafdownSearchPlugin, type LeafdownSearchPluginOptions } from "../plugins/search";
import { createLeafdownSelectionOccurrencesPlugin } from "../plugins/selectionOccurrences";
import {
  createLeafdownSourceProjectionContinuationPlugin,
  createLeafdownSourceProjectionPlugin,
  finalizeSourceProjection,
  settleSourceProjection,
} from "../plugins/sourceProjection";
import { createLeafdownStrikethroughInputRule } from "../plugins/strikethroughInputRule";
import { createLeafdownTableColumnsPlugin } from "../plugins/tableColumns";
import { createLeafdownTableControlsPlugin } from "../plugins/tableControls";
import { createLeafdownTableFormPlugin } from "../plugins/tableForm";
import { createLeafdownTableKeyboardPlugin } from "../plugins/tableKeyboard";
import {
  createLeafdownTableShapeGuardPlugin,
  createLeafdownTableShapePlugin,
} from "../plugins/tableShape";
import { createLeafdownTableViewPlugin } from "../plugins/tableView";
import { createLeafdownTaskListCheckboxPlugin } from "../plugins/taskListCheckbox";
import {
  createLeafdownThematicBreakInputRule,
  createLeafdownThematicBreakPlugin,
} from "../plugins/thematicBreak";
import { createLeafdownTrailingParagraphPlugin } from "../plugins/trailingParagraph";
import { createLeafdownWikiCompletionPlugin } from "../plugins/wikiCompletion";
import { createLeafdownWikiLinkPlugin, leafdownWikiLinkSchema } from "../plugins/wikiLink";
import { createLeafdownWikiLinkNavigationPlugin } from "../plugins/wikiLinkNavigation";
import type { HtmlExportSnapshot } from "../services/htmlExport";
import {
  BARE_AUTOLINK_MARKDOWN_TYPE,
  serializeBareAutolink,
  withBareAutolinkForm,
} from "./bareAutolinkMarkdown";
import { withBlockquoteSeparator, withFootnoteDefinitionSeparator } from "./blockSeparatorMarkdown";
import { serializeCallout } from "./calloutMarkdown";
import {
  CHARACTER_REFERENCE_MARKDOWN_TYPE,
  serializeCharacterReference,
  withAuthoredDestination,
} from "./characterReferenceMarkdown";
import { CITATION_MARKDOWN_TYPE } from "./citationSyntax";
import { createClipboardTextSerializer } from "./clipboard";
import { normalizeProseMirrorClipboardHtml } from "./clipboardHtml";
import { serializeCode, serializeCodeSpan, withCodeForm, withCodeSpanForm } from "./codeMarkdown";
import { serializeParagraph, withParagraphForm } from "./continuationMarkdown";
import {
  joinDefinitionDescriptionBlocks,
  serializeDefinitionDescription,
  serializeDefinitionList,
  serializeDefinitionTerm,
} from "./definitionListMarkdown";
import type { EditorDocumentStatus } from "./documentStatus";
import { withFootnoteDefinitionLabelContent } from "./footnoteDefinitionLabel";
import {
  FOOTNOTE_DEFINITION_MARKDOWN_TYPE,
  FOOTNOTE_REFERENCE_MARKDOWN_TYPE,
  serializeMarkdownFootnoteDefinition,
  serializeMarkdownFootnoteReference,
} from "./footnoteLabelMarkdown";
import {
  HARD_BREAK_MARKDOWN_TYPE,
  serializeHardBreak,
  withHardBreakForm,
} from "./hardBreakMarkdown";
import { serializeHeading, withHeadingForm } from "./headingMarkdown";
import type { HeadingOutlineState } from "./headingOutline";
import { createLeafdownHighlightParser } from "./highlighting";
import { readImageGrants } from "./imageGrants";
import type { MarkdownLinkContext } from "./linkActivation";
import { withLinkLabelWhitespace } from "./linkLabelMarkdown";
import {
  serializeList,
  serializeListItem,
  withBulletListMarker,
  withListItemForm,
  withOrderedListMarker,
} from "./listMarkdown";
import {
  serializeMarkdownDefinition,
  serializeMarkdownImage,
  serializeMarkdownImageReference,
  serializeMarkdownLinkReference,
  serializeMarkdownLink,
} from "./markdownDestination";
import {
  EMPTY_MARKDOWN_REFERENCE_CONTEXT,
  markdownReferenceContextCtx,
  type MarkdownReferenceContext,
} from "./markdownReferences";
import { serializeMarkdownRoot, serializeMarkdownText } from "./markdownText";
import { MATH_MARKDOWN_TYPE } from "./mathSyntax";
import {
  getRawHtmlMarkdownType,
  RAW_HTML_MARKDOWN_TYPE,
  serializeRawHtml,
} from "./rawHtmlMarkdown";
import { withImageReferenceForm, withLinkReferenceForm } from "./referenceLinkMarkdown";
import { serializeTable, withTableOuterPipes } from "./tableMarkdown";
import { serializeThematicBreak, withThematicBreakMarker } from "./thematicBreakMarkdown";
import { WIKI_LINK_MARKDOWN_TYPE, serializeWikiLink } from "./wikiLinkMarkdown";

export interface CreateMilkdownEditorOptions {
  root: HTMLElement;
  initialMarkdown: string;
  contextPopup?: LeafdownContextPopupPluginOptions;
  blockInsertion?: BlockInsertionOptions;
  footnotePreview?: LeafdownFootnotePreviewPluginOptions;
  linkPreview?: LeafdownLinkPreviewPluginOptions;
  controlTooltip?: LeafdownControlTooltipPluginOptions;
  codeBlockLanguage?: LeafdownCodeBlockLanguagePluginOptions;
  calloutType?: LeafdownCalloutTypePluginOptions;
  search?: LeafdownSearchPluginOptions;
  getMarkdownReferenceContext?: () => MarkdownReferenceContext;
  isAutoPairEnabled?: () => boolean;
  areCodeLineNumbersEnabled?: () => boolean;
  isCodeBlockSoftWrapEnabled?: () => boolean;
  onCodeBlockSettingChange?: (setting: CodeBlockSetting, enabled: boolean) => void;
  onCommandStateChanged?: (state: EditorCommandState) => void;
  onContentChanged?: () => void;
  onDocumentStatusChanged?: (status: EditorDocumentStatus) => void;
  onHeadingOutlineChanged?: (outline: HeadingOutlineState) => void;
  onOpenMarkdownPath?: MarkdownLinkContext["onOpenMarkdownPath"];
  onReadMarkdownPath?: MarkdownLinkContext["onReadMarkdownPath"];
  getWikiCompletionPaths?: () => string[];
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

const DEFAULT_OPEN_MARKDOWN_PATH: MarkdownLinkContext["onOpenMarkdownPath"] = () => false;
// Marks serialize in `spec.priority` order, 50 unless declared, and inline code declares 100 to
// stay innermost.
const LINK_MARK_PRIORITY = 75;
// The preset's heading ids re-create every heading after a document opens and after each edit to
// its text, which restyles every block a heading rule can match. Nothing in Leafdown reads them:
// export writes its own anchors, and the outline, wiki links, and folding find headings in the
// document by position and text.
const COMMONMARK_PLUGINS = commonmark.filter((plugin) => plugin !== syncHeadingIdPlugin);
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
  blockInsertion,
  footnotePreview,
  linkPreview,
  controlTooltip,
  codeBlockLanguage,
  calloutType,
  search,
  getMarkdownReferenceContext = () => EMPTY_MARKDOWN_REFERENCE_CONTEXT,
  isAutoPairEnabled = () => true,
  areCodeLineNumbersEnabled = () => false,
  isCodeBlockSoftWrapEnabled = () => false,
  onCodeBlockSettingChange,
  onCommandStateChanged,
  onContentChanged,
  onDocumentStatusChanged,
  onHeadingOutlineChanged,
  onOpenMarkdownPath = DEFAULT_OPEN_MARKDOWN_PATH,
  onReadMarkdownPath,
  getWikiCompletionPaths = () => [],
}: CreateMilkdownEditorOptions) => {
  const parser = await createLeafdownHighlightParser();
  const getLinkContext = (): MarkdownLinkContext => ({
    ...getMarkdownReferenceContext(),
    onOpenMarkdownPath,
    onReadMarkdownPath,
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
    .use(createLeafdownAutolinkLiteralPositionPlugin())
    .use(createLeafdownMathRemarkPlugin())
    .use(createLeafdownCitationRemarkPlugin())
    .use(createLeafdownFrontmatterRemarkPlugin())
    .use(createLeafdownCharacterReferencePlugin())
    .use(createLeafdownReferenceLinkPlugin())
    .use(createLeafdownDefinitionListPlugin())
    .use(createLeafdownWikiLinkPlugin())
    .use(createLeafdownFootnoteLabelPlugin())
    .use(createLeafdownThematicBreakPlugin())
    .use(createLeafdownThematicBreakInputRule())
    .use(createLeafdownCodeFormPlugin())
    .use(createLeafdownCalloutPlugin())
    .use(createLeafdownBlockStructurePlugin())
    .use(createLeafdownDocumentEndRemarkPlugin())
    .use(createLeafdownMarkNestingPlugin())
    .use(createLeafdownHardBreakFormPlugin())
    .use(createLeafdownHeadingFormPlugin())
    .use(createLeafdownListFormPlugin())
    .use(createLeafdownContinuationFormPlugin())
    .use(createLeafdownTableFormPlugin())
    .use(createLeafdownTableShapePlugin())
    .use(COMMONMARK_PLUGINS)
    .use(leafdownDocumentSchema)
    .use(createLeafdownTableKeyboardPlugin())
    .use(createLeafdownTableShapeGuardPlugin())
    .use(gfm)
    .use(calloutSchema)
    .use(leafdownDefinitionListSchema)
    .use(leafdownDefinitionTermSchema)
    .use(leafdownDefinitionDescriptionSchema)
    .use(createLeafdownDefinitionListInputRule())
    .use(createLeafdownDefinitionSpacingPlugin())
    .use(leafdownCharacterReferenceSchema)
    .use(leafdownMathSchema)
    .use(leafdownCitationSchema)
    .use(leafdownFrontmatterSchema)
    .use(leafdownWikiLinkSchema)
    .use(leafdownDefinitionSchema)
    .use(leafdownDefinitionLabelSchema)
    .use(leafdownDefinitionDestinationSchema)
    .use(leafdownDefinitionTitleSchema)
    .use(createLeafdownReferenceDefinitionFieldsPlugin())
    .use(leafdownFootnoteDefinitionLabelSchema)
    .use(createLeafdownFootnoteDefinitionLabelPlugin())
    .use(createLeafdownFootnoteNavigationPlugin())
    .use(createLeafdownFootnotePreviewPlugin(footnotePreview))
    .use(createLeafdownLinkPreviewPlugin(getLinkContext, linkPreview))
    .use(createLeafdownControlTooltipPlugin(controlTooltip))
    .use(createLeafdownStrikethroughInputRule())
    .use(createLeafdownCodeSpanInputRule())
    .use(createLeafdownLogicalLinkSerializerPlugin())
    .use(createLeafdownCommandKeymapPlugin(runCommand))
    .use(history)
    .use(createLeafdownClipboardPlugin())
    .use(clipboard)
    .use(createLeafdownCodeHighlightPlugin(parser))
    .use(createLeafdownCodeLineNumbersPlugin(areCodeLineNumbersEnabled))
    .use(createLeafdownCodeBlockCollapsePlugin())
    .use(createLeafdownCodeBlockControlsPlugin(isCodeBlockSoftWrapEnabled))
    .use(markdownReferenceContextCtx)
    .use(createLeafdownImageViewPlugin(getMarkdownReferenceContext))
    .use(createLeafdownTableViewPlugin())
    .use(createLeafdownTableColumnsPlugin())
    .use(createLeafdownLinkActivationPlugin(getLinkContext))
    .use(createLeafdownWikiLinkNavigationPlugin(getLinkContext))
    .use(createLeafdownWikiCompletionPlugin(getLinkContext, getWikiCompletionPaths))
    .use(createLeafdownLinkPresentationPlugin())
    .use(createLeafdownSourceProjectionPlugin())
    .use(createLeafdownSourceProjectionContinuationPlugin())
    .use(createLeafdownAttentionPairingPlugin())
    .use(createLeafdownDoubleClickSelectionPlugin())
    .use(createLeafdownMarkerPresentationPlugin())
    .use(createLeafdownHeadingFoldPlugin())
    .use(createLeafdownHtmlViewPlugin())
    .use(createLeafdownMathViewPlugin())
    .use(createLeafdownCitationViewPlugin())
    .use(createLeafdownFrontmatterViewPlugin())
    .use(createLeafdownFrontmatterInputPlugin())
    .use(createLeafdownContextPopupPlugin(contextPopup))
    .use(createLeafdownCodeBlockLanguagePlugin(codeBlockLanguage))
    .use(createLeafdownCalloutTypePlugin(calloutType))
    .use(createLeafdownMermaidModePlugin())
    .use(createLeafdownCodeBlockViewPlugin({ onSettingChange: onCodeBlockSettingChange }))
    .use(createLeafdownCalloutViewPlugin())
    .use(createLeafdownCalloutInputPlugin())
    .use(createLeafdownSearchPlugin(search))
    .use(createLeafdownSelectionOccurrencesPlugin())
    .use(createLeafdownBlockSelectionPlugin(blockInsertion))
    .use(createLeafdownTableControlsPlugin())
    .use(createLeafdownBlockSelectionKeyboardPlugin())
    .use(createLeafdownBlockSelectionOperationsPlugin())
    .use(createLeafdownAutoPairPlugin(isAutoPairEnabled))
    .use(createLeafdownCommandStatePlugin((state) => onCommandStateChanged?.(state)))
    .use(createLeafdownDocumentStatusPlugin((status) => onDocumentStatusChanged?.(status)))
    .use(createLeafdownHeadingOutlinePlugin((outline) => onHeadingOutlineChanged?.(outline)))
    .use(createLeafdownTaskListCheckboxPlugin())
    .use(createLeafdownPrevailingFormPlugin())
    .use(createLeafdownTrailingParagraphPlugin())
    .use(createLeafdownDocumentEndPlugin())
    .use(createLeafdownReactSelectionOptOutPlugin())
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
        join: [...(options.join ?? []), joinDefinitionDescriptionBlocks],
        handlers: {
          ...options.handlers,
          [BARE_AUTOLINK_MARKDOWN_TYPE]: serializeBareAutolink,
          [CHARACTER_REFERENCE_MARKDOWN_TYPE]: serializeCharacterReference,
          [FOOTNOTE_DEFINITION_MARKDOWN_TYPE]: serializeMarkdownFootnoteDefinition,
          [FOOTNOTE_REFERENCE_MARKDOWN_TYPE]: serializeMarkdownFootnoteReference,
          [HARD_BREAK_MARKDOWN_TYPE]: serializeHardBreak,
          [MATH_MARKDOWN_TYPE]: serializeMath,
          [CITATION_MARKDOWN_TYPE]: serializeCitation,
          leafdownCallout: serializeCallout,
          leafdownFrontmatter: serializeFrontmatter,
          [RAW_HTML_MARKDOWN_TYPE]: serializeRawHtml,
          [WIKI_LINK_MARKDOWN_TYPE]: serializeWikiLink,
          code: serializeCode,
          definition: serializeMarkdownDefinition,
          defList: serializeDefinitionList,
          defListTerm: serializeDefinitionTerm,
          defListDescription: serializeDefinitionDescription,
          heading: serializeHeading,
          image: serializeMarkdownImage,
          imageReference: serializeMarkdownImageReference,
          inlineCode: serializeCodeSpan,
          link: serializeMarkdownLink,
          linkReference: serializeMarkdownLinkReference,
          list: serializeList,
          listItem: serializeListItem,
          paragraph: serializeParagraph,
          root: serializeMarkdownRoot,
          table: serializeTable,
          text: serializeMarkdownText,
          thematicBreak: serializeThematicBreak,
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
      // Every block carries the separator it was authored with, so the two Leafdown holds no
      // other form for are wrapped here and the rest carry it alongside the form they already do.
      ctx.update(
        paragraphSchema.key,
        (getSchema) => (schemaCtx) => withParagraphForm(getSchema(schemaCtx)),
      );
      ctx.update(
        blockquoteSchema.key,
        (getSchema) => (schemaCtx) => withBlockquoteSeparator(getSchema(schemaCtx)),
      );
      ctx.update(
        footnoteDefinitionSchema.key,
        (getSchema) => (schemaCtx) =>
          withFootnoteDefinitionLabelContent(withFootnoteDefinitionSeparator(getSchema(schemaCtx))),
      );
      ctx.update(
        bulletListSchema.key,
        (getSchema) => (schemaCtx) => withBulletListMarker(getSchema(schemaCtx)),
      );
      ctx.update(
        orderedListSchema.key,
        (getSchema) => (schemaCtx) => withOrderedListMarker(getSchema(schemaCtx)),
      );
      ctx.update(
        imageSchema.key,
        (getSchema) => (schemaCtx) =>
          withImageReferenceForm(withAuthoredDestination(getSchema(schemaCtx))),
      );
      ctx.update(
        hrSchema.key,
        (getSchema) => (schemaCtx) => withThematicBreakMarker(getSchema(schemaCtx)),
      );
      // Without the preset's id sync, an id rendered here would keep the text the heading opened
      // with.
      ctx.update(headingSchema.key, (getSchema) => (schemaCtx) => ({
        ...withHeadingForm(getSchema(schemaCtx)),
        toDOM: (node) => [`h${node.attrs.level}`, schemaCtx.get(headingAttr.key)(node), 0],
      }));
      ctx.update(
        codeBlockSchema.key,
        (getSchema) => (schemaCtx) => withCodeForm(getSchema(schemaCtx)),
      );
      ctx.update(
        inlineCodeSchema.key,
        (getSchema) => (schemaCtx) => withCodeSpanForm(getSchema(schemaCtx)),
      );
      ctx.update(hardbreakSchema.key, (getSchema) => (schemaCtx) => ({
        ...withHardBreakForm(getSchema(schemaCtx)),
        linebreakReplacement: true,
      }));
      ctx.update(linkSchema.key, (getSchema) => (schemaCtx) => ({
        ...withLinkLabelWhitespace(
          withLinkReferenceForm(withBareAutolinkForm(getSchema(schemaCtx))),
        ),
        priority: LINK_MARK_PRIORITY,
      }));
      // A `table_row+` content expression has no legal header-only table, so ProseMirror fills a
      // cell-less row into every table authored without body rows.
      ctx.update(tableSchema.key, (getSchema) => (schemaCtx) => ({
        ...withTableOuterPipes(getSchema(schemaCtx)),
        content: "table_header_row table_row*",
      }));
      // `extendSchema` registers a new slice, so an override on `listItemSchema` never reaches the
      // schema the editor holds.
      ctx.update(
        extendListItemSchemaForTask.key,
        (getSchema) => (schemaCtx) => withListItemForm(getSchema(schemaCtx)),
      );
      ctx.set(defaultValueCtx, initialMarkdown);
      ctx.set(markdownReferenceContextCtx.key, getMarkdownReferenceContext);
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
    });

  // The preset pairs empty-paragraph serialization with a parse-time plugin that deletes every
  // `<br>` it finds, authored ones included. Leafdown represents a blank paragraph with blank
  // lines instead, so raw HTML stays document content.
  await configuredEditor.remove(remarkPreserveEmptyLinePlugin);

  // The preset resolves every reference into an inline link and deletes the definitions before the
  // parser sees them, which leaves the document with no way to carry either back to the file.
  await configuredEditor.remove(remarkInlineLinkPlugin);

  await configuredEditor.remove(strikethroughInputRule);
  await configuredEditor.remove(inlineCodeInputRule);
  await configuredEditor.remove(insertHrInputRule);

  return configuredEditor;
};

export const getMilkdownEditorMarkdown = (editor: MilkdownEditorInstance) => {
  const view = editor.ctx.get(editorViewCtx);

  finalizeSourceProjection(view);
  commitFootnoteDefinitionLabels(view);
  commitReferenceDefinitionFields(view);

  return editor.action(getMarkdown());
};

/**
 * The document a save would write, settled from a copy of the editor state so that reading it
 * dispatches nothing: no edit, history step, or dirty change reaches the editor.
 */
export const getMilkdownEditorHtmlExportSnapshot = (
  editor: MilkdownEditorInstance,
): HtmlExportSnapshot => {
  const view = editor.ctx.get(editorViewCtx);

  return { doc: settleEditorState(view.state).doc, imageGrants: readImageGrants(view) };
};

/** The Markdown a save would write, read without dispatching, so an edit in progress goes on. */
export const getMilkdownEditorSettledMarkdown = (editor: MilkdownEditorInstance) =>
  editor.ctx.get(serializerCtx)(settleEditorState(editor.ctx.get(editorViewCtx).state).doc);

const settleEditorState = (state: EditorState) =>
  settleReferenceDefinitionFields(settleFootnoteDefinitionLabels(settleSourceProjection(state)));
