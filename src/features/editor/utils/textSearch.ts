import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";

import type { TextRange } from "./textRanges";

export interface TextSearchQuery {
  caseSensitive: boolean;
  text: string;
  wholeWord: boolean;
}

// Combining marks count as part of a word, so `cafe` does not stop short of a decomposed `café`.
const WORD_CHARACTER = String.raw`[\p{L}\p{M}\p{N}_]`;
const WORD_CHARACTER_PATTERN = new RegExp(`^${WORD_CHARACTER}$`, "u");
const REGEXP_SYNTAX_PATTERN = /[\\^$.*+?()[\]{}|]/gu;

const isWordCharacter = (character: string | undefined) =>
  character !== undefined && WORD_CHARACTER_PATTERN.test(character);

// A boundary is asked for only on an edge the query itself ends in a word character, so a whole-word
// search for `-flag` still finds it after a space or at the start of a line.
const createSearchPattern = ({ caseSensitive, text, wholeWord }: TextSearchQuery) => {
  if (text === "") {
    return null;
  }

  const characters = Array.from(text);
  const literal = text.replace(REGEXP_SYNTAX_PATTERN, String.raw`\$&`);
  const before = wholeWord && isWordCharacter(characters[0]) ? `(?<!${WORD_CHARACTER})` : "";
  const after = wholeWord && isWordCharacter(characters.at(-1)) ? `(?!${WORD_CHARACTER})` : "";

  return new RegExp(`${before}${literal}${after}`, caseSensitive ? "gu" : "giu");
};

const collectSegmentMatches = (
  pattern: RegExp,
  segment: string,
  start: number,
  matches: TextRange[],
) => {
  for (const match of segment.matchAll(pattern)) {
    matches.push({ from: start + match.index, to: start + match.index + match[0].length });
  }
};

// Only adjacent text nodes form one run, so a match never reaches across a hard break, an image, a
// footnote reference, raw HTML, or any other inline node the text flows around.
const collectTextblockMatches = (
  pattern: RegExp,
  textblock: ProseMirrorNode,
  contentStart: number,
  matches: TextRange[],
) => {
  let segment = "";
  let segmentStart = contentStart;

  textblock.forEach((child, offset) => {
    if (child.isText) {
      if (segment === "") {
        segmentStart = contentStart + offset;
      }

      segment += child.text ?? "";
      return;
    }

    collectSegmentMatches(pattern, segment, segmentStart, matches);
    segment = "";
  });

  collectSegmentMatches(pattern, segment, segmentStart, matches);
};

const overlaps = (range: TextRange, other: TextRange) =>
  range.from < other.to && other.from < range.to;

/** Literal matches in document order, each within one run of text in one textblock. */
export const findTextMatches = (
  document: ProseMirrorNode,
  query: TextSearchQuery,
  excluded: TextRange | null = null,
): TextRange[] => {
  const pattern = createSearchPattern(query);

  if (!pattern) {
    return [];
  }

  const matches: TextRange[] = [];

  document.descendants((node, position) => {
    if (!node.isTextblock) {
      return true;
    }

    collectTextblockMatches(pattern, node, position + 1, matches);

    return false;
  });

  return excluded ? matches.filter((match) => !overlaps(match, excluded)) : matches;
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
