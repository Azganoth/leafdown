import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";

import type { TextRange } from "./textRanges";

export interface TextSearchQuery {
  caseSensitive: boolean;
  text: string;
  wholeWord: boolean;
}

/**
 * Every run of searchable text in a document, in document order, joined by
 * {@link SEARCHABLE_TEXT_SEPARATOR}, with where each run starts in the text and in the document.
 */
export interface SearchableText {
  text: string;
  runOffsets: number[];
  runPositions: number[];
}

/** A range of offsets into {@link SearchableText.text}. */
export interface SearchableTextRange {
  start: number;
  end: number;
}

export interface SearchMatchContext {
  before: string;
  match: string;
  after: string;
  /** Whether the run holds more text before `before` or after `after`. */
  clippedBefore: boolean;
  clippedAfter: boolean;
}

// The loader refuses a file holding NUL and the parser replaces one written as a character
// reference, so no run can hold it and no match can reach across it.
export const SEARCHABLE_TEXT_SEPARATOR = "\u0000";

// Combining marks count as part of a word, so `cafe` does not stop short of a decomposed `café`.
const WORD_CHARACTER = String.raw`[\p{L}\p{M}\p{N}_]`;
const WORD_CHARACTER_PATTERN = new RegExp(`^${WORD_CHARACTER}$`, "u");
const REGEXP_SYNTAX_PATTERN = /[\\^$.*+?()[\]{}|]/gu;

const isWordCharacter = (character: string | undefined) =>
  character !== undefined && WORD_CHARACTER_PATTERN.test(character);

// A boundary is asked for only on an edge the query itself ends in a word character, so a whole-word
// search for `-flag` still finds it after a space or at the start of a line. The separator is not a
// word character, so a run's ends are word boundaries.
const createSearchPattern = ({ caseSensitive, text, wholeWord }: TextSearchQuery) => {
  if (text === "" || text.includes(SEARCHABLE_TEXT_SEPARATOR)) {
    return null;
  }

  const characters = Array.from(text);
  const literal = text.replace(REGEXP_SYNTAX_PATTERN, String.raw`\$&`);
  const before = wholeWord && isWordCharacter(characters[0]) ? `(?<!${WORD_CHARACTER})` : "";
  const after = wholeWord && isWordCharacter(characters.at(-1)) ? `(?!${WORD_CHARACTER})` : "";

  return new RegExp(`${before}${literal}${after}`, caseSensitive ? "gu" : "giu");
};

// Only adjacent text nodes form one run, so a match never reaches across a hard break, an image, a
// footnote reference, raw HTML, or any other inline node the text flows around.
export const getSearchableText = (document: ProseMirrorNode): SearchableText => {
  const runs: string[] = [];
  const runOffsets: number[] = [];
  const runPositions: number[] = [];
  let offset = 0;
  let run = "";
  let runPosition = 0;

  const endRun = () => {
    if (run === "") {
      return;
    }

    runs.push(run);
    runOffsets.push(offset);
    runPositions.push(runPosition);
    offset += run.length + SEARCHABLE_TEXT_SEPARATOR.length;
    run = "";
  };

  document.descendants((node, position) => {
    if (!node.isTextblock) {
      return true;
    }

    node.forEach((child, childOffset) => {
      if (!child.isText) {
        endRun();
        return;
      }

      if (run === "") {
        runPosition = position + 1 + childOffset;
      }

      run += child.text ?? "";
    });
    endRun();

    return false;
  });

  return { text: runs.join(SEARCHABLE_TEXT_SEPARATOR), runOffsets, runPositions };
};

/** Literal matches in order, each within one run of the searchable text. */
export const findSearchableTextMatches = (
  text: string,
  query: TextSearchQuery,
): SearchableTextRange[] => {
  const pattern = createSearchPattern(query);

  if (!pattern) {
    return [];
  }

  return Array.from(text.matchAll(pattern), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
};

/** A document's searchable text and the matches in it. */
export interface DocumentSearchMatches {
  text: string;
  matches: SearchableTextRange[];
}

export interface DocumentTextMatch {
  offsets: SearchableTextRange;
  range: TextRange;
}

const overlaps = (range: TextRange, other: TextRange) =>
  range.from < other.to && other.from < range.to;

/** A document's matches in its searchable text and in the document, leaving out `excluded`. */
export const findDocumentTextMatches = (
  { runOffsets, runPositions, text }: SearchableText,
  query: TextSearchQuery,
  excluded: TextRange | null = null,
): DocumentTextMatch[] => {
  let run = 0;
  const matches = findSearchableTextMatches(text, query).map((offsets) => {
    while (run + 1 < runOffsets.length && runOffsets[run + 1] <= offsets.start) {
      run += 1;
    }

    const from = runPositions[run] + offsets.start - runOffsets[run];

    return { offsets, range: { from, to: from + offsets.end - offsets.start } };
  });

  return excluded ? matches.filter(({ range }) => !overlaps(range, excluded)) : matches;
};

/** Literal matches in document order, each within one run of text in one textblock. */
export const findTextMatches = (
  document: ProseMirrorNode,
  query: TextSearchQuery,
  excluded: TextRange | null = null,
): TextRange[] =>
  createSearchPattern(query)
    ? findDocumentTextMatches(getSearchableText(document), query, excluded).map(
        ({ range }) => range,
      )
    : [];

const isLowSurrogate = (text: string, index: number) => {
  const code = text.charCodeAt(index);

  return code >= 0xdc00 && code <= 0xdfff;
};

/** The text around a match within its run, up to `radius` UTF-16 units each side. */
export const getSearchMatchContext = (
  text: string,
  { start, end }: SearchableTextRange,
  radius: number,
): SearchMatchContext => {
  const runStart = text.lastIndexOf(SEARCHABLE_TEXT_SEPARATOR, start - 1) + 1;
  const separatorAfter = text.indexOf(SEARCHABLE_TEXT_SEPARATOR, end);
  const runEnd = separatorAfter === -1 ? text.length : separatorAfter;
  let before = Math.max(runStart, start - radius);
  let after = Math.min(runEnd, end + radius);

  // A cut between the halves of a surrogate pair would leave half a character on display.
  if (before > runStart && isLowSurrogate(text, before)) {
    before += 1;
  }

  if (after < runEnd && isLowSurrogate(text, after)) {
    after -= 1;
  }

  return {
    before: text.slice(before, start),
    match: text.slice(start, end),
    after: text.slice(end, after),
    clippedBefore: before > runStart,
    clippedAfter: after < runEnd,
  };
};

/** How much of a match's run, each side of it, identifies the match among the others. */
export const SEARCH_MATCH_CONTEXT_RADIUS = 64;

/** A match found in a document no editor held, to be found again once the document opens. */
export interface SearchMatchTarget {
  ordinal: number;
  context: SearchMatchContext;
}

const isSameContext = (left: SearchMatchContext, right: SearchMatchContext) =>
  left.before === right.before && left.match === right.match && left.after === right.after;

/**
 * The match a target names: the one at its place in document order when it still reads the same,
 * otherwise the nearest one that does. A target whose text is gone names none, so a stale result
 * never selects unrelated text.
 */
export const findSearchMatchTarget = (
  text: string,
  matches: readonly SearchableTextRange[],
  { context, ordinal }: SearchMatchTarget,
) => {
  const readsAsTarget = (index: number) =>
    index >= 0 &&
    index < matches.length &&
    isSameContext(
      getSearchMatchContext(text, matches[index], SEARCH_MATCH_CONTEXT_RADIUS),
      context,
    );

  for (let distance = 0; distance <= Math.max(ordinal, matches.length - ordinal); distance += 1) {
    if (readsAsTarget(ordinal - distance)) {
      return ordinal - distance;
    }

    if (distance > 0 && readsAsTarget(ordinal + distance)) {
      return ordinal + distance;
    }
  }

  return null;
};

/** The first match starting at or after `position`, wrapping to the first match. */
export const findMatchIndexFrom = (matches: readonly TextRange[], position: number) => {
  if (matches.length === 0) {
    return null;
  }

  const index = matches.findIndex((match) => match.from >= position);

  return index === -1 ? 0 : index;
};

/** The last match ending at or before `position`, wrapping to the last match. */
export const findMatchIndexBefore = (matches: readonly TextRange[], position: number) => {
  if (matches.length === 0) {
    return null;
  }

  const index = matches.findLastIndex((match) => match.to <= position);

  return index === -1 ? matches.length - 1 : index;
};
