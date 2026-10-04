import type {
  Code,
  Construct,
  Event,
  Extension,
  State,
  TokenizeContext,
  Tokenizer,
} from "micromark-util-types";

import { scanInlineTail } from "./linkTailSyntax";
import { opensMathAt } from "./mathSyntax";

declare module "micromark-util-types" {
  interface TokenTypeMap {
    leafdownCitation: "leafdownCitation";
    leafdownCitationData: "leafdownCitationData";
  }
}

export const CITATION_MARKDOWN_TYPE = "leafdownCitation";

export interface CitationSourceRange {
  from: number;
  to: number;
}

export interface CitationItem {
  prefix: CitationSourceRange;
  suppressed: boolean;
  // The `@` or `-@` that opens the key.
  marker: CitationSourceRange;
  key: string;
  // The key's characters, inside its braces when it is brace-quoted.
  keyRange: CitationSourceRange;
  braced: boolean;
  // The content of an explicit `{...}` locator written directly after the key.
  locator: CitationSourceRange | null;
  suffix: CitationSourceRange;
}

const LEFT_BRACKET = 91;
const RIGHT_BRACKET = 93;
const LEFT_PARENTHESIS = 40;
const BACKSLASH = 92;
const HORIZONTAL_TAB = -2;
const VIRTUAL_SPACE = -1;

// Pandoc's bare key: a letter, digit, or underscore, then those characters joined by single internal
// punctuation, so a trailing or doubled punctuation character ends the key rather than joining it.
const BARE_KEY_PATTERN = /[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&\-+?<>~/](?=[\p{L}\p{N}_]))*/uy;
const WHITESPACE_PATTERN = /\s/u;
const LINE_ENDING_PATTERN = /[\n\r]/u;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;
// What a `<` opens when it starts an autolink or inline HTML rather than standing as text.
const ANGLE_OPENER_PATTERN = /[A-Za-z/!?]/u;

interface GroupScan {
  codeSpans: CitationSourceRange[];
  braces: CitationSourceRange[];
  separators: number[];
}

const HARD_BREAK_SPACES_PATTERN = / {2,}$/u;

// A group spans soft line endings only. A hard break is not among its supported inline content, and
// leaving one out also keeps the tokenizer from reading past a break it would then give up on:
// micromark places a line ending it reads again after such an attempt past the container prefix of
// the next line, which moves the source a break is written from.
const closesHardBreak = (text: string, lineEnding: number) =>
  HARD_BREAK_SPACES_PATTERN.test(text.slice(0, lineEnding)) || isEscapedAt(text, lineEnding);

const findRangeAt = (ranges: readonly CitationSourceRange[], position: number) =>
  ranges.find((range) => range.from === position);

// A code span binds tighter than the group, so its content separates nothing; a brace group is the
// key or locator quoting Pandoc reads, which a `;` inside does not end either. A group holding a
// bracket, a stray brace, or a backtick run left open is not one this slice reads.
const scanGroup = (source: string): GroupScan | null => {
  const end = source.length - 1;
  const scan: GroupScan = { codeSpans: [], braces: [], separators: [] };

  for (let index = 1; index < end;) {
    const character = source[index];

    if (character === "\\") {
      if (index + 1 >= end || LINE_ENDING_PATTERN.test(source[index + 1])) return null;
      index += 2;
    } else if (character === "`") {
      let opening = index;
      while (source[opening] === "`") opening += 1;
      const size = opening - index;
      let closing = -1;
      for (let probe = opening; probe < end;) {
        if (source[probe] !== "`") {
          probe += 1;
          continue;
        }
        let run = probe;
        while (source[run] === "`") run += 1;
        if (run - probe === size) {
          closing = run;
          break;
        }
        probe = run;
      }
      if (closing < 0 || closing > end) return null;
      scan.codeSpans.push({ from: index, to: closing });
      index = closing;
    } else if (character === "{") {
      let closing = -1;
      for (let probe = index + 1; probe < end; probe += 1) {
        if (source[probe] === "\\") {
          probe += 1;
        } else if (source[probe] === "{") {
          return null;
        } else if (source[probe] === "}") {
          closing = probe + 1;
          break;
        }
      }
      if (closing < 0) return null;
      scan.braces.push({ from: index, to: closing });
      index = closing;
    } else if (character === "}" || character === "[" || character === "]") {
      return null;
    } else if (LINE_ENDING_PATTERN.test(character) && closesHardBreak(source, index)) {
      return null;
    } else {
      if (character === ";") scan.separators.push(index);
      index += 1;
    }
  }

  return scan;
};

const isInside = (ranges: readonly CitationSourceRange[], position: number) =>
  ranges.some((range) => range.from <= position && position < range.to);

// Affixes keep their authored source, so only the inline content that stays inside them is
// supported: emphasis, strong, strikethrough, and code whose delimiters pair within the affix. A
// delimiter left over, a `<` that opens HTML or an autolink, or a `$` that opens math would reach
// past the group or render inside it, so such a group stays the Markdown it spells.
const isSupportedAffix = (source: string, range: CitationSourceRange, scan: GroupScan) => {
  const counts = { "*": 0, "~": 0, _: 0 };

  for (let index = range.from; index < range.to; index += 1) {
    const character = source[index];

    if (isInside(scan.codeSpans, index)) continue;
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "<" && ANGLE_OPENER_PATTERN.test(source[index + 1] ?? "")) return false;
    if (character === "$" && opensMathAt(source.slice(range.from, range.to), index - range.from)) {
      return false;
    }
    if (character === "*" || character === "~") {
      counts[character] += 1;
    } else if (
      character === "_" &&
      !(
        WORD_CHARACTER_PATTERN.test(source[index - 1] ?? "") &&
        WORD_CHARACTER_PATTERN.test(source[index + 1] ?? "")
      )
    ) {
      counts._ += 1;
    }
  }

  return counts["*"] % 2 === 0 && counts["~"] % 2 === 0 && counts._ % 2 === 0;
};

interface KeyMatch {
  marker: CitationSourceRange;
  keyRange: CitationSourceRange;
  braced: boolean;
  end: number;
}

const readKey = (
  source: string,
  markerFrom: number,
  at: number,
  to: number,
  scan: GroupScan,
): KeyMatch | null => {
  const start = at + 1;
  const marker = { from: markerFrom, to: start };

  if (source[start] === "{") {
    const brace = findRangeAt(scan.braces, start);
    const key = brace ? source.slice(brace.from + 1, brace.to - 1) : "";
    if (!brace || brace.to > to || !key.trim() || LINE_ENDING_PATTERN.test(key)) return null;
    return {
      marker,
      keyRange: { from: brace.from + 1, to: brace.to - 1 },
      braced: true,
      end: brace.to,
    };
  }

  BARE_KEY_PATTERN.lastIndex = start;
  const match = BARE_KEY_PATTERN.exec(source);
  if (!match || start + match[0].length > to) return null;
  return {
    marker,
    keyRange: { from: start, to: start + match[0].length },
    braced: false,
    end: start + match[0].length,
  };
};

// The item's key is its first `@` or `-@` standing at the item's start or after whitespace, so an
// address such as `name@example.com` in a prefix is text rather than a key.
const readItem = (
  source: string,
  from: number,
  to: number,
  scan: GroupScan,
): CitationItem | null => {
  let key: KeyMatch | null = null;
  let suppressed = false;

  for (let index = from; index < to && !key; index += 1) {
    const opaque = findRangeAt(scan.codeSpans, index) ?? findRangeAt(scan.braces, index);
    if (opaque) {
      index = opaque.to - 1;
      continue;
    }
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    const dash = source[index] === "-" && source[index + 1] === "@";
    if (source[index] !== "@" && !dash) continue;
    const before = index === from ? undefined : source[index - 1];
    if (before !== undefined && !WHITESPACE_PATTERN.test(before)) continue;
    key = readKey(source, index, dash ? index + 1 : index, to, scan);
    suppressed = dash;
  }

  if (!key) return null;

  const brace = findRangeAt(scan.braces, key.end);
  const locator = brace ? { from: brace.from + 1, to: brace.to - 1 } : null;
  const item: CitationItem = {
    prefix: { from, to: key.marker.from },
    suppressed,
    marker: key.marker,
    key: source.slice(key.keyRange.from, key.keyRange.to),
    keyRange: key.keyRange,
    braced: key.braced,
    locator,
    suffix: { from: brace ? brace.to : key.end, to },
  };

  return isSupportedAffix(source, item.prefix, scan) &&
    (!locator || isSupportedAffix(source, locator, scan)) &&
    isSupportedAffix(source, item.suffix, scan)
    ? item
    : null;
};

const findNestedBracket = (source: string) => {
  for (let index = 1; index < source.length - 1; index += 1) {
    if (source[index] === "\\") index += 1;
    else if (source[index] === "[") return index;
  }
  return -1;
};

// Reads one complete bracketed group under the grammar Pandoc documents: items separated by `;`,
// each an optional prefix, an optional `-` suppressing the author, `@` and a bare or brace-quoted
// key, an optional `{...}` locator, and a suffix. Nothing is resolved against a bibliography.
export const parseCitationGroup = (source: string): CitationItem[] | null => {
  if (source.length < 3 || source[0] !== "[" || source.at(-1) !== "]" || source[1] === "^") {
    return null;
  }

  // A bracket stops the group wherever it stands, code spans included, so the tokenizer gives up on
  // an unclosed `[` at the next one rather than reading on to the end of the block.
  if (findNestedBracket(source) >= 0) return null;

  const scan = scanGroup(source);
  if (!scan) return null;

  const items: CitationItem[] = [];
  const ends = [...scan.separators, source.length - 1];
  let from = 1;

  for (const to of ends) {
    const item = readItem(source, from, to, scan);
    if (!item) return null;
    items.push(item);
    from = to + 1;
  }

  return items;
};

export const isCitationSource = (source: string) => parseCitationGroup(source) !== null;

const isEscapedAt = (text: string, position: number) => {
  let count = 0;
  for (let index = position - 1; index >= 0 && text[index] === "\\"; index -= 1) count += 1;
  return count % 2 === 1;
};

// Where the group a `[` opens ends: at the first `]` no backslash escapes, which is also where any
// bracket a code span or brace inside it holds would close it.
const findGroupEnd = (text: string, start: number) => {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
    } else if (text[index] === "]") {
      return index + 1;
    }
  }
  return -1;
};

const REFERENCE_TAIL_PATTERN = /^\[((?:[^[\]\\]|\\[\s\S])*)\]/u;

// Whether CommonMark closes a link at the group's `]`, which a complete link keeps rather than
// yielding to the citation: an inline tail, a full reference to a defined label, or the group's own
// label defined as a collapsed or shortcut reference.
export const closesLinkAfter = (
  text: string,
  start: number,
  end: number,
  isDefined: (label: string) => boolean,
) => {
  const ownDefined = isDefined(text.slice(start + 1, end - 1));

  if (text[end] === "(" && scanInlineTail(text, end) >= 0) return true;
  if (text[end] === "[") {
    const reference = REFERENCE_TAIL_PATTERN.exec(text.slice(end));
    if (reference && reference[1].trim() !== "" && isDefined(reference[1])) return true;
    return ownDefined && text.startsWith("[]", end);
  }
  return ownDefined;
};

// Where the first key of the citation a bare `[` at `start` would open stands, or -1 where the `[`
// opens none. A `\` before that `@` is the one escape that keeps the whole group literal, and it is
// the one Pandoc documents.
export const findCitationKeyMarker = (
  text: string,
  start: number,
  isDefined: (label: string) => boolean,
) => {
  if (text[start] !== "[" || isEscapedAt(text, start)) return -1;
  if (text[start - 1] === "!" && !isEscapedAt(text, start - 1)) return -1;
  const end = findGroupEnd(text, start);
  if (end < 0) return -1;
  const items = parseCitationGroup(text.slice(start, end));
  if (!items || closesLinkAfter(text, start, end, isDefined)) return -1;
  const { marker } = items[0];
  return start + marker.to - 1;
};

// Whether the `@` at `position` is the first key marker of a citation the text around it spells.
export const opensCitationKeyAt = (
  text: string,
  position: number,
  isDefined: (label: string) => boolean,
) => {
  for (let index = position - 1; index >= 0; index -= 1) {
    if (text[index] === "]" && !isEscapedAt(text, index)) return false;
    if (text[index] === "[" && !isEscapedAt(text, index)) {
      return findCitationKeyMarker(text, index, isDefined) === position;
    }
  }
  return false;
};

// micromark matches labels on this normalization, so a definition is found the way a link finds it.
export const normalizeLinkLabel = (label: string) =>
  label
    .replace(/[\t\n\r ]+/gu, " ")
    .replace(/^ | $/gu, "")
    .toLowerCase()
    .toUpperCase();

const isLineEnding = (code: Code) => code !== null && code < HORIZONTAL_TAB;

const readCode = (code: Code) => {
  if (code === null || code === VIRTUAL_SPACE) return "";
  if (code === HORIZONTAL_TAB) return "\t";
  return code < 0 ? "\n" : String.fromCodePoint(code);
};

// A label opened earlier and not yet closed could still become a link whose text holds the group,
// and a link label is not where a citation is read. micromark's label end marks an opener it has
// given up on as balanced, and one inside a finished link as inactive, on the token itself.
const followsOpenLabel = (events: readonly Event[]) =>
  events.some(([kind, token]) => {
    const { _balanced: balanced, _inactive: inactive } = token; // oxlint-disable-line eslint/no-underscore-dangle
    return (
      kind === "enter" &&
      ((token.type === "labelLink" && !inactive) || token.type === "labelImage") &&
      !balanced
    );
  });

const tokenizeCitation: Tokenizer = function (this: TokenizeContext, effects, ok, nok) {
  const isDefined = (label: string) => this.parser.defined.includes(normalizeLinkLabel(label));
  let source = "";
  let rest = "";

  // What follows the group is read only where a link tail could start there, and only as far as
  // that tail can reach.
  const tokenizeRest: Tokenizer = (restEffects, restOk, restNok) => {
    let reference: boolean | undefined;

    const collect: State = (code) => {
      reference ??= code === LEFT_BRACKET;
      if (code === null) return decide(code);
      if (isLineEnding(code)) {
        restEffects.enter("lineEnding");
        restEffects.consume(code);
        restEffects.exit("lineEnding");
        rest += "\n";
        return collect;
      }
      restEffects.enter("leafdownCitationData");
      return collectData(code);
    };

    const collectData: State = (code) => {
      if (code === null || isLineEnding(code)) {
        restEffects.exit("leafdownCitationData");
        return collect(code);
      }
      rest += readCode(code);
      restEffects.consume(code);
      if (code === BACKSLASH) return collectEscaped;
      if (code === RIGHT_BRACKET && reference) {
        restEffects.exit("leafdownCitationData");
        return decide;
      }
      return collectData;
    };

    const collectEscaped: State = (code) => {
      if (code === null || isLineEnding(code)) return collectData(code);
      rest += readCode(code);
      restEffects.consume(code);
      return collectData;
    };

    const decide: State = (code) =>
      closesLinkAfter(source + rest, 0, source.length, isDefined) ? restOk(code) : restNok(code);

    return collect;
  };

  const restConstruct: Construct = { tokenize: tokenizeRest, partial: true };

  const start: State = (code) => {
    if (code !== LEFT_BRACKET || followsOpenLabel(this.events)) return nok(code);
    effects.enter(CITATION_MARKDOWN_TYPE);
    effects.enter("leafdownCitationData");
    return data(code);
  };

  const between: State = (code) => {
    if (code === null) return nok(code);
    if (isLineEnding(code)) {
      effects.enter("lineEnding");
      effects.consume(code);
      effects.exit("lineEnding");
      source += "\n";
      return between;
    }
    effects.enter("leafdownCitationData");
    return data(code);
  };

  const data: State = (code) => {
    if (isLineEnding(code) && closesHardBreak(source, source.length)) return nok(code);
    if (code === LEFT_BRACKET && source !== "") return nok(code);
    if (code === null || isLineEnding(code)) {
      effects.exit("leafdownCitationData");
      return between(code);
    }
    source += readCode(code);
    effects.consume(code);
    if (code === BACKSLASH) return escaped;
    if (code === RIGHT_BRACKET) {
      effects.exit("leafdownCitationData");
      return close;
    }
    return data;
  };

  const escaped: State = (code) => {
    if (code === null || isLineEnding(code)) return data(code);
    source += readCode(code);
    effects.consume(code);
    return data;
  };

  const finish: State = (code) => {
    effects.exit(CITATION_MARKDOWN_TYPE);
    return ok(code);
  };

  const close: State = (code) => {
    if (!isCitationSource(source)) return nok(code);
    if (code === LEFT_PARENTHESIS || code === LEFT_BRACKET) {
      return effects.check(restConstruct, nok, finish)(code);
    }
    return closesLinkAfter(source, 0, source.length, isDefined) ? nok(code) : finish(code);
  };

  return start;
};

const citationConstruct: Construct = {
  name: "leafdownCitation",
  tokenize: tokenizeCitation,
};

export const citationSyntax: Extension = {
  text: { [LEFT_BRACKET]: citationConstruct },
};
