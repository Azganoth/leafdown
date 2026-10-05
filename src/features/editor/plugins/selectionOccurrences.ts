import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Selection,
} from "@milkdown/kit/prose/state";
import type { DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { FOOTNOTE_DEFINITION_LABEL_NODE_NAME } from "../utils/footnoteDefinitionLabel";
import { DEFINITION_NODE_NAME } from "../utils/referenceLinkMarkdown";
import type { TextRange } from "../utils/textRanges";
import {
  findDocumentTextMatches,
  findMatchIndexFrom,
  getSearchableText,
  isWord,
  type SearchableText,
} from "../utils/textSearch";
import { FRONTMATTER_NODE_NAME } from "./frontmatter";
import { createBoundedMatchDecorations, getSearchState } from "./search";
import { getActiveSourceProjectionRange } from "./sourceProjection";

export const SELECTION_OCCURRENCE_CLASS = "leafdown-selection-occurrence";

// Frontmatter and the labels and fields of definitions are Markdown metadata rather than text the
// document reads as, so a word there is neither a source of occurrences nor one of them.
const METADATA_NODE_NAMES = new Set([
  DEFINITION_NODE_NAME,
  FOOTNOTE_DEFINITION_LABEL_NODE_NAME,
  FRONTMATTER_NODE_NAME,
]);

const isDocumentText = (node: ProseMirrorNode) => !METADATA_NODE_NAMES.has(node.type.name);

const documentTextCache = new WeakMap<ProseMirrorNode, SearchableText>();

const getDocumentText = (document: ProseMirrorNode) => {
  let text = documentTextCache.get(document);

  if (!text) {
    text = getSearchableText(document, isDocumentText);
    documentTextCache.set(document, text);
  }

  return text;
};

const overlaps = (range: TextRange, other: TextRange) =>
  range.from < other.to && other.from < range.to;

/**
 * The other whole-word, case-sensitive matches of a selection that is itself exactly one such
 * match in document text, or `null` for any other selection. Projected source stands in for an
 * object rather than reading as text, so it neither starts occurrences nor counts among them.
 */
export const findSelectionOccurrences = (state: EditorState): readonly TextRange[] | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || selection.empty) {
    return null;
  }

  const { from, to } = selection;
  const word = state.doc.textBetween(from, to);
  const projection = getActiveSourceProjectionRange(state);

  if (!isWord(word) || (projection && overlaps(selection, projection))) {
    return null;
  }

  const matches = findDocumentTextMatches(
    getDocumentText(state.doc),
    { caseSensitive: true, text: word, wholeWord: true },
    projection,
  ).map(({ range }) => range);

  const selected = matches.findIndex((match) => match.from === from && match.to === to);

  return selected === -1 ? null : matches.toSpliced(selected, 1);
};

const leafdownSelectionOccurrencesPluginKey = new PluginKey("leafdownSelectionOccurrences");

export const createLeafdownSelectionOccurrencesPlugin = () =>
  $prose(() => {
    let cache: {
      decorations: DecorationSet | null;
      document: ProseMirrorNode;
      projection: TextRange | null;
      selection: Selection;
    } | null = null;

    // Search highlights its own matches, so occurrences give way while it shows any.
    const getDecorations = (state: EditorState) => {
      const { chosen, open } = getSearchState(state);

      if (open || chosen) {
        return null;
      }

      const { doc, selection } = state;
      const projection = getActiveSourceProjectionRange(state);

      if (
        cache?.document !== doc ||
        cache.selection !== selection ||
        cache.projection?.from !== projection?.from ||
        cache.projection?.to !== projection?.to
      ) {
        const occurrences = findSelectionOccurrences(state);

        cache = {
          decorations: occurrences?.length
            ? createBoundedMatchDecorations(
                doc,
                occurrences,
                findMatchIndexFrom(occurrences, selection.from) ?? 0,
                () => SELECTION_OCCURRENCE_CLASS,
              )
            : null,
          document: doc,
          projection,
          selection,
        };
      }

      return cache.decorations;
    };

    return new Plugin({
      key: leafdownSelectionOccurrencesPluginKey,
      props: { decorations: getDecorations },
    });
  });
