import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { decodeNamedCharacterReference } from "decode-named-character-reference";

import { markBlockSeparators, resolveBlockSeparators } from "./blockSeparatorMarkdown";
import {
  CHARACTER_REFERENCE_MARKDOWN_TYPE,
  readCharacterReferenceRun,
  readCharacterReferenceText,
} from "./characterReferenceMarkdown";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

interface EscapeSlot {
  character: string;
  escaped: boolean;
  deferred?: boolean;
}

interface AttentionRun {
  character: string;
  start: number;
  end: number;
  canOpen: boolean;
  canClose: boolean;
  atLineStart: boolean;
}

interface BracketNeighbors {
  earlier: string;
  later: string;
  laterHasMarkup: boolean;
}

interface PhrasingNeighbors extends BracketNeighbors {
  // The mark flush against each end of the node, and what the siblings past it write. A run that
  // merges with those delimiters stands opposite the rest of the line rather than the mark.
  earlierMark: TouchingMark | undefined;
  earlierRest: string;
  laterMark: TouchingMark | undefined;
  laterRest: string;
}

interface PhrasingNode {
  type: string;
  value?: string;
  source?: string;
  marker?: string;
  identifier?: string;
  children?: readonly PhrasingNode[];
}

// CommonMark trims a space or a tab at a line edge and nothing else, so a no-break space stays
// a character the line carries rather than whitespace the parse drops.
const TRAILING_WHITESPACE_PATTERN = /[\t ]+$/u;
const LEADING_WHITESPACE_PATTERN = /^[\t ]+/u;
const LINE_ENDING_PATTERN = /[\r\n]$/u;
// `state.safe` escapes ASCII punctuation and nothing else. Decoding with a wider class would read a
// backslash before ordinary text as an escape.
const ESCAPABLE_PATTERN = /[!-/:-@[-`{-~]/u;
const UNICODE_PUNCTUATION_PATTERN = /[\p{P}\p{S}]/u;
const ATTENTION_CHARACTERS = "*_~";
// A thematic break spends three markers or more, counted across the line rather than inside one
// run of it, and admits nothing else but spaces and tabs.
const THEMATIC_BREAK_PATTERNS: Record<string, RegExp> = {
  "*": /^(?:[\t ]*\*){3,}[\t ]*$/u,
  _: /^(?:[\t ]*_){3,}[\t ]*$/u,
};
const WHOLE_LINE_PHRASING_PARENTS = new Set(["heading", "paragraph", "tableCell"]);
// A mark holds only a fragment of its line, so its siblings cannot answer what follows the mark.
// Every `[` in the fragment keeps its escape, which is also what makes an unescaped `[` from
// earlier in the line impossible: any text before a mark sees the mark as later markup.
const FRAGMENT_PHRASING_PARENTS = new Set(["delete", "emphasis", "link", "strong"]);
const ATTENTION_CONSTRUCTS = new Set(["emphasis", "strikethrough", "strong"]);
// A mark contributes only delimiters around text that stays on the line, so a `[` inside one can
// still be closed by a `]` outside it. Every other construct is opaque: a link or an image is
// bracket-balanced on its own and never leaves an opener behind.
const TRANSPARENT_MARKS = new Set(["delete", "emphasis", "strong"]);
// `mdast-util-gfm-autolink-literal` escapes these to keep text from reading as an autolink
// target, but its `fromMarkdown` transform matches already-decoded text and never sees the
// escape, so the backslash never changes what a reload produces.
const AUTOLINK_LITERAL_ESCAPES: Record<string, { after: RegExp; before: RegExp }> = {
  ".": { after: /[-.\w]/u, before: /[Ww]/u },
  ":": { after: /\//u, before: /[ps]/u },
  "@": { after: /[-.\w]/u, before: /[+.\w-]/u },
};

const HTML_SPACE = String.raw`[\t\n\f\r ]`;
const HTML_TAG_NAME = String.raw`[A-Za-z][A-Za-z0-9-]*`;
const HTML_ATTRIBUTE_VALUE = String.raw`[^\t\n\f\r "'=<>\x60]+|'[^']*'|"[^"]*"`;
const HTML_ATTRIBUTE = String.raw`${HTML_SPACE}+[A-Za-z_:][A-Za-z0-9_.:-]*(?:${HTML_SPACE}*=${HTML_SPACE}*(?:${HTML_ATTRIBUTE_VALUE}))?`;
const AUTOLINK_URI = String.raw`[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\u0000-\u0020<>\u007F]*`;
const AUTOLINK_EMAIL = String.raw`[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*`;
// CommonMark decides an autolink and inline raw HTML from the candidate alone, so a `<` that opens
// neither cannot become one on reload however the rest of the document changes.
const ANGLE_CONSTRUCT_PATTERN = new RegExp(
  String.raw`^<(?:${AUTOLINK_URI}>|${AUTOLINK_EMAIL}>|${HTML_TAG_NAME}(?:${HTML_ATTRIBUTE})*${HTML_SPACE}*/?>|/${HTML_TAG_NAME}${HTML_SPACE}*>|!(?:--(?:>|->|[\s\S]*?-->)|\[CDATA\[[\s\S]*?\]\]>|[A-Za-z][^>]*>)|\?[\s\S]*?\?>)`,
  "u",
);
const REFERENCE_TAIL_PATTERN = /^\[([^[\]]*)\]/u;
const LABEL_WHITESPACE_PATTERN = /[\t\n\r ]+/gu;

// A preserved character reference writes its own source, so it contributes those characters to the
// line and none of what they decode to. It opens no construct and closes none, which leaves it
// ordinary text for every pass that reads a run's neighbours.
const isInertPhrasing = (child: { type: string }) =>
  child.type === "text" || child.type === CHARACTER_REFERENCE_MARKDOWN_TYPE;

const readInertValue = (child: PhrasingNode) => {
  if (child.type !== CHARACTER_REFERENCE_MARKDOWN_TYPE) {
    return child.value ?? "";
  }

  const text = readCharacterReferenceText(child);

  if (child.source === undefined) {
    return text;
  }

  const run = readCharacterReferenceRun(child.source, text);

  return run ? child.source.repeat(run.count) : text;
};

const normalizeLabel = (label: string) =>
  label.replace(LABEL_WHITESPACE_PATTERN, " ").trim().toLowerCase();

const decodeEscapes = (serialized: string): EscapeSlot[] => {
  const slots: EscapeSlot[] = [];

  for (let index = 0; index < serialized.length; index += 1) {
    const character = serialized[index];
    const next = serialized[index + 1];

    if (character === "\\" && next !== undefined && ESCAPABLE_PATTERN.test(next)) {
      slots.push({ character: next, escaped: true });
      index += 1;
    } else {
      slots.push({ character, escaped: false });
    }
  }

  return slots;
};

// CommonMark replaces U+0000 with U+FFFD while parsing, so no text node can carry one and a
// deferred escape cannot collide with document content.
const DEFERRED_ESCAPE = "\u0000";

const encodeEscapes = (slots: readonly EscapeSlot[]) =>
  slots
    .map((slot) => {
      if (slot.deferred) {
        return `${DEFERRED_ESCAPE}${slot.character}`;
      }

      return slot.escaped ? `\\${slot.character}` : slot.character;
    })
    .join("");

type CharacterClass = "whitespace" | "punctuation" | "other";

const classifyCharacter = (character: string | undefined): CharacterClass => {
  if (character === undefined || /\s/u.test(character)) {
    return "whitespace";
  }

  return UNICODE_PUNCTUATION_PATTERN.test(character) ? "punctuation" : "other";
};

interface Flanking {
  left: boolean;
  next: CharacterClass;
  previous: CharacterClass;
  right: boolean;
}

const readFlanking = (before: string | undefined, after: string | undefined): Flanking => {
  const previous = classifyCharacter(before);
  const next = classifyCharacter(after);

  return {
    left: next !== "whitespace" && (next !== "punctuation" || previous !== "other"),
    next,
    previous,
    right: previous !== "whitespace" && (previous !== "punctuation" || next !== "other"),
  };
};

const canOpenRun = (character: string, flanking: Flanking) =>
  flanking.left && (character !== "_" || !flanking.right || flanking.previous === "punctuation");

const canCloseRun = (character: string, flanking: Flanking) =>
  flanking.right && (character !== "_" || !flanking.left || flanking.next === "punctuation");

const findAttentionRuns = (
  slots: readonly EscapeSlot[],
  before: string | undefined,
  after: string | undefined,
): AttentionRun[] => {
  const characterAt = (index: number) =>
    index < 0 ? before : index < slots.length ? slots[index].character : after;
  const runs: AttentionRun[] = [];

  for (let index = 0; index < slots.length; index += 1) {
    const { character } = slots[index];

    if (!ATTENTION_CHARACTERS.includes(character)) {
      continue;
    }

    let end = index + 1;

    while (end < slots.length && slots[end].character === character) {
      end += 1;
    }

    const previousCharacter = characterAt(index - 1);
    const flanking = readFlanking(previousCharacter, characterAt(end));
    // A third tilde makes the sequence fail to tokenize, so only one or two can delimit.
    const delimits = character !== "~" || end - index < 3;

    runs.push({
      character,
      start: index,
      end,
      canOpen: delimits && canOpenRun(character, flanking),
      canClose: delimits && canCloseRun(character, flanking),
      atLineStart:
        previousCharacter === undefined || previousCharacter === "\n" || previousCharacter === "\r",
    });
    index = end - 1;
  }

  return runs;
};

const opensBlockConstruct = (
  run: AttentionRun,
  slots: readonly EscapeSlot[],
  after: string,
): boolean => {
  if (!run.atLineStart) {
    return false;
  }

  // A tilde opens no block shorter than the three a code fence needs.
  if (run.character === "~") {
    return run.end - run.start >= 3;
  }

  let end = run.start;

  while (end < slots.length && slots[end].character !== "\n") {
    end += 1;
  }

  const line =
    slots
      .slice(run.start, end)
      .map((slot) => slot.character)
      .join("") + (end === slots.length ? after.split("\n")[0] : "");

  const thematicBreak = THEMATIC_BREAK_PATTERNS[run.character].test(line);
  const bulletMarker =
    run.character === "*" && run.end - run.start === 1 && /^[\t ]/u.test(line.slice(1));

  return thematicBreak || bulletMarker;
};

// A run inside a mark can always pair with the mark's own delimiters, so those count as reachable
// counterparts. Only the innermost marker is readable from the parent, and a link label carries
// none, so deeper nesting falls back to treating every attention character as reachable.
const readEnclosingMarkers = (
  parent: { type: string; marker?: string } | undefined,
  stack: readonly string[],
): string => {
  const enclosing = stack.filter((construct) => ATTENTION_CONSTRUCTS.has(construct));

  if (enclosing.length === 0) {
    return "";
  }

  if (enclosing.length === 1) {
    // A `delete` node carries no marker, but its delimiters are tildes and nothing else.
    if (enclosing[0] === "strikethrough") {
      return "~";
    }

    if (parent?.marker) {
      return parent.marker;
    }
  }

  return ATTENTION_CHARACTERS;
};

// What a sibling writes onto the line, so a run can be told whether a counterpart it could pair
// with exists outside its own text node. A construct writes its own delimiters as well as its
// content, and one whose output cannot be read off the tree contributes every marker, which keeps
// an escape rather than risking a delimiter the line turns out to hold.
const readWrittenCharacters = (node: PhrasingNode): string => {
  if (isInertPhrasing(node)) {
    return readInertValue(node);
  }

  if (node.children === undefined) {
    return ATTENTION_CHARACTERS;
  }

  const marker =
    node.type === "delete" || node.type === "strikethrough" ? "~" : (node.marker ?? "");

  return marker + node.children.map(readWrittenCharacters).join("");
};

// How many delimiters a mark writes on each of its sides, and the characters it can write them
// with. A tilde is left out of both: GFM closes a strikethrough only with a run of its own length,
// so a run a literal tilde lengthens spells nothing to close and the escape is what holds it.
const ATTENTION_MARK_DELIMITERS: Record<string, number> = { emphasis: 1, strong: 2 };
const MERGEABLE_DELIMITERS = "*_";

interface TouchingMark {
  character: string;
  inner: string | undefined;
  length: number;
}

// The delimiters a sibling mark writes flush against this text node, and the character its content
// turns towards them. A mark whose content spells the same character is not read: a delimiter
// inside it could take the pairing the merged run is measured against, and one written escaped is
// indistinguishable here from one written bare.
const readTouchingMark = (
  node: PhrasingNode | undefined,
  side: "earlier" | "later",
): TouchingMark | undefined => {
  const length = node === undefined ? undefined : ATTENTION_MARK_DELIMITERS[node.type];
  const character = node?.marker;

  if (
    node === undefined ||
    length === undefined ||
    character === undefined ||
    !MERGEABLE_DELIMITERS.includes(character)
  ) {
    return undefined;
  }

  const content = (node.children ?? []).map(readWrittenCharacters).join("");

  if (content === "" || content.includes(character)) {
    return undefined;
  }

  return {
    character,
    inner: side === "later" ? content[0] : content[content.length - 1],
    length,
  };
};

// Whether the run and a sibling mark's delimiters spell one run rather than a pair. Flush against
// each other they are a single run, and no run pairs with itself: the mark's own pairing spends as
// many delimiters as the mark wrote, and the run's are the surplus that pairing leaves literal.
const findMergedSide = (
  run: AttentionRun,
  size: number,
  slots: readonly EscapeSlot[],
  neighbors: PhrasingNeighbors | undefined,
  characterAt: (index: number) => string | undefined,
) => {
  // Whitespace the node writes between the run and the mark keeps them two runs, so the merge is
  // read off the character actually written beside the run rather than off the node's edge.
  const touches = (mark: TouchingMark | undefined, index: number) =>
    mark && characterAt(index) === mark.character ? mark : undefined;
  const earlierMark = run.start === 0 ? touches(neighbors?.earlierMark, -1) : undefined;
  const laterMark =
    run.end === slots.length ? touches(neighbors?.laterMark, slots.length) : undefined;
  // A run that is the whole node between two marks merges with both, which spells a third run
  // neither half of this pass measures.
  const mark = earlierMark && laterMark ? undefined : (earlierMark ?? laterMark);

  if (!mark || mark.character !== run.character) {
    return undefined;
  }

  const merged = size + mark.length;

  // CommonMark refuses a pair whose two runs sum to a multiple of three unless both runs are,
  // wherever either can play both parts. Whether the mark's far delimiters can open depends on the
  // text past them, which no handler sees, so the sum is answered as though they can.
  if ((merged + mark.length) % 3 === 0 && (merged % 3 !== 0 || mark.length % 3 !== 0)) {
    return undefined;
  }

  if (earlierMark) {
    return canCloseRun(run.character, readFlanking(mark.inner, characterAt(run.end)))
      ? "earlier"
      : undefined;
  }

  return canOpenRun(run.character, readFlanking(characterAt(run.start - 1), mark.inner))
    ? "later"
    : undefined;
};

const relaxAttentionEscapes = (
  slots: EscapeSlot[],
  before: string,
  after: string,
  neighbors: PhrasingNeighbors | undefined,
  enclosingMarkers: string,
) => {
  const characterAt = (index: number) =>
    index < 0
      ? before.slice(-1) || undefined
      : index < slots.length
        ? slots[index].character
        : after.charAt(0) || undefined;
  const runs = findAttentionRuns(slots, characterAt(-1), characterAt(slots.length));
  // What the line holds past this node, as far as it is known. `containerPhrasing` hands over one
  // character of the next sibling, which for a mark is the first of its delimiters; the rest of
  // them and the character behind them decide whether a run at the node's edge opens a block.
  const laterMark = neighbors?.laterMark;
  const tail =
    laterMark && after.charAt(0) === laterMark.character
      ? laterMark.character.repeat(laterMark.length) + (laterMark.inner ?? "")
      : after;

  for (const run of runs) {
    if (opensBlockConstruct(run, slots, tail)) {
      continue;
    }

    const size = run.end - run.start;
    const mergedSide = findMergedSide(run, size, slots, neighbors, characterAt);
    // GFM closes a tilde run only with a run of the same length.
    const counterpart = (other: AttentionRun) =>
      other.character === run.character &&
      (run.character !== "~" || other.end - other.start === size);
    const pairable =
      neighbors === undefined ||
      enclosingMarkers.includes(run.character) ||
      (mergedSide === "earlier" ? neighbors.earlierRest : neighbors.earlier).includes(
        run.character,
      ) ||
      (mergedSide === "later" ? neighbors.laterRest : neighbors.later).includes(run.character) ||
      (run.canOpen &&
        runs.some((other) => counterpart(other) && other.start > run.start && other.canClose)) ||
      // An earlier opener that kept its escape is no longer a delimiter, so it leaves nothing here
      // to close. Runs are decided in order, so an earlier run's slot already holds its answer.
      (run.canClose &&
        runs.some(
          (other) =>
            counterpart(other) &&
            other.start < run.start &&
            other.canOpen &&
            !slots[other.start].escaped,
        ));

    if ((run.canOpen || run.canClose) && pairable) {
      continue;
    }

    for (let index = run.start; index < run.end; index += 1) {
      slots[index].escaped = false;
    }
  }
};

const LINE_BREAK_PATTERN = /[\r\n]/u;
const INDENT_PATTERN = /[\t ]/u;
const MARKER_SEPARATOR_PATTERN = /[\t\n\r ]/u;
const DIGIT_PATTERN = /\d/u;
const ORDERED_MARKERS = ".)";
const HEADING_HASHES_MAX = 6;
const ORDERED_DIGITS_MAX = 9;

// Where the marker's line begins, or -1 where it does not begin one. A block marker only opens its
// construct from the start of a line, which is also the position `atBreak` escapes it at.
const findMarkerLineStart = (slots: readonly EscapeSlot[], index: number, before: string) => {
  let start = index;

  while (start > 0 && INDENT_PATTERN.test(slots[start - 1].character)) {
    start -= 1;
  }

  const preceding = start === 0 ? before.slice(-1) : slots[start - 1].character;

  return LINE_BREAK_PATTERN.test(preceding) ? start : -1;
};

// `state.safe` escapes a block marker wherever one could open, which is a wider class than the
// positions where the construct finishes. The heading and the list marker are decided by the line
// they open; a pipe row also needs the line after it, which only the assembled document holds.
const relaxBlockMarkerEscapes = (
  slots: EscapeSlot[],
  before: string,
  after: string,
  blockStart: boolean,
  deferrable: boolean,
) => {
  const characterAt = (index: number) =>
    index < slots.length ? slots[index].character : after.charAt(0);
  // An empty tail is the end of the block, which ends the line as a line ending would.
  const separates = (character: string) =>
    character === "" || MARKER_SEPARATOR_PATTERN.test(character);

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];

    if (!slot.escaped) {
      continue;
    }

    if (slot.character === "#") {
      if (findMarkerLineStart(slots, index, before) < 0) {
        continue;
      }

      let end = index;

      while (end < slots.length && slots[end].character === "#") {
        end += 1;
      }

      if (end - index > HEADING_HASHES_MAX || !separates(characterAt(end))) {
        slot.escaped = false;
      }

      continue;
    }

    if (ORDERED_MARKERS.includes(slot.character)) {
      let digits = index;

      while (digits > 0 && DIGIT_PATTERN.test(slots[digits - 1].character)) {
        digits -= 1;
      }

      const lineStart = digits === index ? -1 : findMarkerLineStart(slots, digits, before);

      if (lineStart < 0) {
        continue;
      }

      const startNumber = slots
        .slice(digits, index)
        .map((digit) => digit.character)
        .join("");
      // Only a list starting at one interrupts a paragraph. At the start of a block any start
      // number opens one.
      const opensList =
        index - digits <= ORDERED_DIGITS_MAX &&
        separates(characterAt(index + 1)) &&
        ((lineStart === 0 && blockStart) || Number(startNumber) === 1);

      if (!opensList) {
        slot.escaped = false;
      }

      continue;
    }

    if (slot.character === "|" && deferrable && findMarkerLineStart(slots, index, before) >= 0) {
      slot.deferred = true;
    }
  }
};

const TAIL_WHITESPACE_PATTERN = /[\t\n\f\r ]/u;
const DESTINATION_END_PATTERN = /\s/u;

// A raw destination ends at whitespace or at the parenthesis that closes the tail, so its own
// parentheses have to balance; an angle destination ends at its `>` and admits no bare `<`.
const scanDestination = (text: string, start: number) => {
  let index = start;

  if (text[index] === "<") {
    for (index += 1; index < text.length; index += 1) {
      if (text[index] === "\\") {
        index += 1;
      } else if (text[index] === ">") {
        return index + 1;
      } else if (text[index] === "<" || text[index] === "\n" || text[index] === "\r") {
        return -1;
      }
    }

    return -1;
  }

  let depth = 0;

  while (index < text.length) {
    const character = text[index];

    if (character === "\\") {
      index += 2;
    } else if (character === "(") {
      depth += 1;
      index += 1;
    } else if (character === ")") {
      if (depth === 0) {
        break;
      }

      depth -= 1;
      index += 1;
    } else if (DESTINATION_END_PATTERN.test(character)) {
      break;
    } else {
      index += 1;
    }
  }

  return depth === 0 ? index : -1;
};

const scanTitle = (text: string, start: number) => {
  const opener = text[start];

  if (opener !== '"' && opener !== "'" && opener !== "(") {
    return -1;
  }

  const closer = opener === "(" ? ")" : opener;

  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
    } else if (text[index] === closer) {
      return index + 1;
    } else if (opener === "(" && text[index] === "(") {
      return -1;
    }
  }

  return -1;
};

const skipTailWhitespace = (text: string, start: number) => {
  let index = start;

  while (index < text.length && TAIL_WHITESPACE_PATTERN.test(text[index])) {
    index += 1;
  }

  return index;
};

const scanInlineTail = (text: string, start: number) => {
  const destination = scanDestination(text, skipTailWhitespace(text, start + 1));

  if (destination < 0) {
    return -1;
  }

  const separated = skipTailWhitespace(text, destination);
  const title = separated > destination ? scanTitle(text, separated) : -1;
  const index = skipTailWhitespace(text, title < 0 ? separated : title);

  return text[index] === ")" ? index + 1 : -1;
};

// Where a link tail ends, or -1 where the run closes no link. The end is what lets a caller step
// over a destination or a label, whose own brackets belong to the tail rather than to the text.
const measureLinkTail = (line: string, index: number, labels: ReadonlySet<string>) => {
  const tail = line.slice(index + 1);

  if (tail.startsWith("(")) {
    return scanInlineTail(line, index + 1);
  }

  if (labels.size === 0) {
    return -1;
  }

  const reference = REFERENCE_TAIL_PATTERN.exec(tail);

  if (reference && reference[1] !== "" && labels.has(normalizeLabel(reference[1]))) {
    return index + 1 + reference[0].length;
  }

  for (let start = index - 1; start >= 0; start -= 1) {
    if (line[start] === "[" && labels.has(normalizeLabel(line.slice(start + 1, index)))) {
      return tail.startsWith("[]") ? index + 3 : index + 1;
    }
  }

  return -1;
};

const closesLink = (line: string, index: number, labels: ReadonlySet<string>) =>
  measureLinkTail(line, index, labels) >= 0;

const relaxBracketEscapes = (
  slots: EscapeSlot[],
  neighbors: BracketNeighbors | undefined,
  labels: ReadonlySet<string>,
  deferrable: boolean,
) => {
  const line = slots.map((slot) => slot.character).join("");
  const later = neighbors?.later ?? "";
  // Sibling markup hides both what closes a run and whether an earlier `[` kept its own escape.
  const unknown = neighbors === undefined || neighbors.laterHasMarkup;
  const scan = line + later;
  const closes = (index: number) => closesLink(scan, index, labels);
  let closerAhead = false;

  for (let index = scan.length - 1; index >= 0; index -= 1) {
    if (scan[index] === "]") {
      closerAhead ||= closes(index);
      continue;
    }

    const slot = slots[index] as EscapeSlot | undefined;

    if (slot?.character === "[" && slot.escaped) {
      if (unknown) {
        slot.deferred = deferrable;
      } else if (!closerAhead) {
        slot.escaped = false;
      }
    }
  }

  let openerBehind = false;
  let unknownOpener = (neighbors?.earlier ?? "").includes("[");

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];

    if (slot.character === "[") {
      if (slot.deferred) {
        unknownOpener = true;
      } else if (!slot.escaped) {
        openerBehind = true;
      }
    } else if (slot.character === "(" && slot.escaped && slots[index - 1]?.character === "]") {
      if (!openerBehind && !unknownOpener) {
        slot.escaped = false;
      } else if (unknown || unknownOpener) {
        slot.deferred = deferrable;
      } else if (!closes(index - 1)) {
        slot.escaped = false;
      }
    }
  }
};

const relaxAngleEscapes = (
  slots: EscapeSlot[],
  neighbors: BracketNeighbors | undefined,
  deferrable: boolean,
) => {
  const line = slots.map((slot) => slot.character).join("");

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];

    if (slot.character !== "<" || !slot.escaped) {
      continue;
    }

    const tail = line.slice(index);
    // Without the `>` in hand the candidate can still be closed further along the line, where a
    // mark or a sibling puts it out of reach.
    const decidable =
      tail.includes(">") ||
      (neighbors !== undefined && !neighbors.laterHasMarkup && neighbors.later === "");

    if (!decidable) {
      slot.deferred = deferrable;
    } else if (!ANGLE_CONSTRUCT_PATTERN.test(tail)) {
      slot.escaped = false;
    }
  }
};

// An inline construct never crosses a blank line, so the block around a deferred escape holds
// everything that can close it.
const findBlockRanges = (text: string) => {
  const ranges: { end: number; start: number }[] = [];
  let start = 0;

  for (const match of text.matchAll(/\n[\t ]*\n/gu)) {
    ranges.push({ end: match.index, start });
    start = match.index + match[0].length;
  }

  ranges.push({ end: text.length, start });

  return ranges;
};

// A code span binds tighter than the brackets around it, so its content is not text this walk can
// pair. Backticks that never close are ordinary characters.
const skipCodeSpan = (block: string, start: number) => {
  let opening = start;

  while (block[opening] === "`") {
    opening += 1;
  }

  for (let index = opening; index < block.length; index += 1) {
    if (block[index] !== "`") {
      continue;
    }

    let closing = index;

    while (block[closing] === "`") {
      closing += 1;
    }

    if (closing - index === opening - start) {
      return closing;
    }

    index = closing - 1;
  }

  return opening;
};

interface BracketLinks {
  closers: ReadonlySet<number>;
  openers: ReadonlySet<number>;
}

// CommonMark's delimiter stack: a `]` takes the nearest opener still unmatched, an opener is spent
// whether or not it matched, and a link that forms leaves every opener before it inactive, which is
// what keeps a bracket run around a link from becoming one.
const findBracketLinks = (block: string, labels: ReadonlySet<string>): BracketLinks => {
  const closers = new Set<number>();
  const openers = new Set<number>();
  const stack: number[] = [];

  for (let index = 0; index < block.length; index += 1) {
    const character = block[index];

    if (character === "\\") {
      index += 1;
    } else if (character === "`") {
      index = skipCodeSpan(block, index) - 1;
    } else if (character === "<") {
      const construct = ANGLE_CONSTRUCT_PATTERN.exec(block.slice(index));

      if (construct) {
        index += construct[0].length - 1;
      }
    } else if (character === "[") {
      stack.push(index);
    } else if (character === "]") {
      const opener = stack.pop();

      if (opener === undefined) {
        continue;
      }

      const end = measureLinkTail(block, index, labels);

      if (end < 0) {
        continue;
      }

      closers.add(index);
      openers.add(opener);
      index = end - 1;

      if (block[opener - 1] !== "!") {
        stack.length = 0;
      }
    }
  }

  return { closers, openers };
};

const DELIMITER_CELL_PATTERN = /^[\t ]*:?-+:?[\t ]*$/u;

// GFM splits a row on its unescaped pipes and drops the empty cell an outer pipe leaves behind.
// A container writes a prefix of one width onto every line of the paragraph it holds — a quote
// marker, or a list marker the continuation lines match with indentation — so the width measured
// on the marker's own line is what leaves each row the table grammar reads.
const readRowCells = (line: string, prefix: number) => {
  const content = line.slice(prefix);
  const cells: string[] = [];
  let cell = "";

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\\") {
      cell += content.slice(index, index + 2);
      index += 1;
    } else if (content[index] === "|") {
      cells.push(cell);
      cell = "";
    } else {
      cell += content[index];
    }
  }

  cells.push(cell);

  if (cells.length > 1 && cells[0].trim() === "") {
    cells.shift();
  }

  if (cells.length > 1 && cells[cells.length - 1].trim() === "") {
    cells.pop();
  }

  return cells;
};

const formsTable = (header: string | undefined, delimiter: string | undefined, prefix: number) => {
  // A blank line ends the paragraph the header row would have to belong to, and inside a container
  // a blank line is the prefix alone.
  if (header === undefined || delimiter === undefined || header.slice(prefix).trim() === "") {
    return false;
  }

  const cells = readRowCells(delimiter, prefix);

  return (
    cells.every((cell) => DELIMITER_CELL_PATTERN.test(cell)) &&
    readRowCells(header, prefix).length === cells.length
  );
};

const readLine = (document: string, start: number) => {
  const end = document.indexOf("\n", start);

  return end < 0 ? document.slice(start) : document.slice(start, end);
};

// A table needs a header row and a delimiter row whose cell counts agree, so the pipe that opens
// either row is the one that needs its escape.
const opensTableRow = (document: string, index: number) => {
  const start = document.lastIndexOf("\n", index) + 1;
  const line = readLine(document, start);
  const end = start + line.length;
  const next = end < document.length ? readLine(document, end + 1) : undefined;
  const previous =
    start === 0 ? undefined : readLine(document, document.lastIndexOf("\n", start - 2) + 1);
  const prefix = index - start;

  return formsTable(line, next, prefix) || formsTable(previous, line, prefix);
};

// Every marker in a pass is answered against the same string, so the blocks and the links inside
// them are found once rather than once per marker.
const createDeferredEscapeDecider = (labels: ReadonlySet<string>) => {
  const bracketLinks = new Map<number, BracketLinks>();
  let ranges: { end: number; start: number }[] | undefined;

  return (bare: string, index: number) => {
    if (bare[index] === "|") {
      return opensTableRow(bare, index);
    }

    ranges ??= findBlockRanges(bare);

    const { end, start } = ranges.find((range) => index <= range.end) ?? ranges[ranges.length - 1];
    const block = bare.slice(start, end);
    const position = index - start;

    if (block[position] === "<") {
      return ANGLE_CONSTRUCT_PATTERN.test(block.slice(position));
    }

    let links = bracketLinks.get(start);

    if (!links) {
      links = findBracketLinks(block, labels);
      bracketLinks.set(start, links);
    }

    return block[position] === "[" ? links.openers.has(position) : links.closers.has(position - 1);
  };
};

const replaceDeferredEscapes = (
  text: string,
  decide: (bare: string, index: number) => boolean | undefined,
) => {
  const bare = text.replaceAll(DEFERRED_ESCAPE, "");
  let bareIndex = 0;
  let resolved = "";

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== DEFERRED_ESCAPE) {
      resolved += text[index];
      bareIndex += 1;
      continue;
    }

    const keep = decide(bare, bareIndex);

    resolved += keep === undefined ? DEFERRED_ESCAPE : keep ? "\\" : "";
  }

  return resolved;
};

// The escape passes see one text node; a construct closed by a later sibling needs the line. The
// root handler is the one hook that runs after every handler has written its part.
//
// A `(` is answered last. Whether it needs its escape depends on the `[` before it keeping one, so
// the openers have to be settled before the parenthesis that would follow them is.
const resolveDeferredEscapes = (document: string, labels: ReadonlySet<string>) => {
  if (!document.includes(DEFERRED_ESCAPE)) {
    return document;
  }

  const decideOpener = createDeferredEscapeDecider(labels);
  const brackets = replaceDeferredEscapes(document, (bare, index) =>
    bare[index] === "(" ? undefined : decideOpener(bare, index),
  );
  const decideCloser = createDeferredEscapeDecider(labels);

  return replaceDeferredEscapes(brackets, decideCloser);
};

const relaxAutolinkLiteralEscapes = (slots: EscapeSlot[], before: string, after: string) => {
  const characterAt = (index: number) =>
    index < 0 ? before.slice(-1) : index < slots.length ? slots[index].character : after.charAt(0);

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const rule = AUTOLINK_LITERAL_ESCAPES[slot.character];

    if (
      slot.escaped &&
      rule?.before.test(characterAt(index - 1)) &&
      rule.after.test(characterAt(index + 1))
    ) {
      slot.escaped = false;
    }
  }
};

// micromark bounds a reference at 31 alphanumeric characters, 7 decimal digits, or 6 hexadecimal
// digits, and asks this same table for a name, so the check agrees with the parser that reads the
// file back rather than with a second reading of the grammar.
const NAMED_REFERENCE_PATTERN = /^&([A-Za-z0-9]{1,31});/u;
const DECIMAL_REFERENCE_PATTERN = /^&#\d{1,7};/u;
const HEXADECIMAL_REFERENCE_PATTERN = /^&#[Xx][\dA-Fa-f]{1,6};/u;

const formsCharacterReference = (tail: string) => {
  const named = NAMED_REFERENCE_PATTERN.exec(tail);

  return named
    ? decodeNamedCharacterReference(named[1]) !== false
    : DECIMAL_REFERENCE_PATTERN.test(tail) || HEXADECIMAL_REFERENCE_PATTERN.test(tail);
};

// `state.safe` escapes every `&` that a reference could start at, which is a wider class than the
// ones that finish. A run that never closes, names nothing, or overruns its digit budget is
// ordinary text and reads back as itself.
const relaxCharacterReferenceEscapes = (slots: EscapeSlot[], after: string) => {
  const line = slots.map((slot) => slot.character).join("") + after;

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];

    if (slot.character === "&" && slot.escaped && !formsCharacterReference(line.slice(index))) {
      slot.escaped = false;
    }
  }
};

// A handler receives only its own node and immediate parent, and `state.indexStack` is a path of
// numbers with no node to walk it from, so the line a marked run sits on is otherwise unreachable.
// The root handler is the one hook that runs before any of them.
let lineParents: Map<PhrasingNode, PhrasingNode> | undefined;
// A reference resolves against the whole document, so a bracket run that matches no definition
// here can never become a link. Footnote definitions share the space under a `^` prefix.
let documentLabels: ReadonlySet<string> = new Set();

const mapDocument = (root: PhrasingNode) => {
  const parents = new Map<PhrasingNode, PhrasingNode>();
  const labels = new Set<string>();
  const visit = (node: PhrasingNode) => {
    for (const child of node.children ?? []) {
      parents.set(child, node);

      if (child.identifier !== undefined) {
        if (child.type === "definition") {
          labels.add(normalizeLabel(child.identifier));
        } else if (child.type === "footnoteDefinition") {
          labels.add(`^${normalizeLabel(child.identifier)}`);
        }
      }

      visit(child);
    }
  };

  visit(root);

  return { labels, parents };
};

const findLineAncestor = (parent: PhrasingNode | undefined): PhrasingNode | undefined => {
  let ancestor = parent;

  while (ancestor && !WHOLE_LINE_PHRASING_PARENTS.has(ancestor.type)) {
    ancestor = TRANSPARENT_MARKS.has(ancestor.type) ? lineParents?.get(ancestor) : undefined;
  }

  return ancestor;
};

const readLineBrackets = (
  target: object,
  parent: PhrasingNode | undefined,
): BracketNeighbors | undefined => {
  const ancestor = lineParents && findLineAncestor(parent);

  if (!ancestor) {
    return undefined;
  }

  const earlier: string[] = [];
  const later: string[] = [];
  let seen = false;
  let laterHasMarkup = false;
  // Only a `]` needs the whole line. A `[` inside an earlier mark is always still escaped, since
  // relaxing it would have required no `]` after it, and reading it as an opener would keep the
  // `(` escape this pass exists to drop.
  const visit = (nodes: readonly PhrasingNode[], ownLine: boolean) => {
    for (const child of nodes) {
      if (child === target) {
        seen = true;
      } else if (isInertPhrasing(child)) {
        if (seen) {
          later.push(readInertValue(child));
        } else if (ownLine) {
          earlier.push(readInertValue(child));
        }
      } else if (TRANSPARENT_MARKS.has(child.type)) {
        visit(child.children ?? [], false);
      } else if (seen) {
        laterHasMarkup = true;
      }
    }
  };

  visit(ancestor.children ?? [], true);

  return { earlier: earlier.join(" "), later: later.join(" "), laterHasMarkup };
};

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["root"]>>[2];

// Milkdown builds the root from a ProseMirror document, whose direct children are always blocks,
// so the phrasing branch the default handler chooses between is unreachable here.
export const serializeMarkdownRoot: NonNullable<RemarkStringifyHandlers["root"]> = (
  node: Parameters<StringifyState["containerFlow"]>[0],
  _parent,
  state,
  info,
) => {
  const { labels, parents } = mapDocument(node);

  lineParents = parents;
  documentLabels = labels;

  const unmarkSeparators = markBlockSeparators(state);

  try {
    // The separators are settled first, so an escape is decided against the lines the file is
    // actually written with rather than against the blank ones a separator takes back out.
    return resolveDeferredEscapes(resolveBlockSeparators(state.containerFlow(node, info)), labels);
  } finally {
    unmarkSeparators();
    lineParents = undefined;
    documentLabels = new Set();
  }
};

// A paragraph and a heading end their line where their last child ends, and a cell is read back
// trimmed to its content, so whitespace closing any of them is whitespace the next parse drops.
// Only the last child can hold it: `state.safe` encodes whitespace a line ending follows, and
// Milkdown hoists whitespace out of a mark before the mark is written.
const closesTrimmedContent = (
  parent: { type: string; children: readonly unknown[] } | undefined,
  index: number,
) =>
  parent !== undefined &&
  WHOLE_LINE_PHRASING_PARENTS.has(parent.type) &&
  index === parent.children.length - 1;

// A parse trims what a line opens with just as it trims what a line closes with, so whitespace
// opening a paragraph, a heading, or a cell is whitespace the next open drops. A line ending in
// `before` marks the line a hard break leaves behind; the block's own first line is read off the
// tree instead, because a heading hands its first child the marker as `before` and a cell hands
// its own padding. Reading the tree is also what separates a hoisted space from an ordinary one:
// Milkdown empties the character reference it lifts a space out of, and an emptied reference
// writes nothing, while any sibling that writes even one character puts the space mid-line.
const opensTrimmedContent = (
  node: PhrasingNode,
  parent: { type: string; children: readonly PhrasingNode[] } | undefined,
  before: string,
) => {
  if (parent === undefined || !WHOLE_LINE_PHRASING_PARENTS.has(parent.type)) {
    return false;
  }

  if (LINE_ENDING_PATTERN.test(before)) {
    return true;
  }

  // `containerPhrasing` peeks the next child to learn what the current one has to be escaped
  // against, and leaves `indexStack` pointing at the child being written rather than the one
  // peeked, so the position has to come from the tree for a peek to agree with the write it predicts.
  const index = parent.children.indexOf(node);

  return (
    index >= 0 &&
    parent.children.slice(0, index).every((child) => readWrittenCharacters(child) === "")
  );
};

const readPhrasingNeighbors = (
  parent: { type: string; children: readonly PhrasingNode[] } | undefined,
  index: number,
): PhrasingNeighbors | undefined => {
  const partialLine = parent !== undefined && FRAGMENT_PHRASING_PARENTS.has(parent.type);

  if (!parent || (!WHOLE_LINE_PHRASING_PARENTS.has(parent.type) && !partialLine) || index < 0) {
    return undefined;
  }

  const children = parent.children;
  const earlier = children.slice(0, index);
  const later = children.slice(index + 1);
  const textValues = (nodes: readonly PhrasingNode[]) => nodes.map(readWrittenCharacters).join(" ");

  return {
    earlier: textValues(earlier),
    earlierMark: readTouchingMark(earlier[earlier.length - 1], "earlier"),
    earlierRest: textValues(earlier.slice(0, -1)),
    later: textValues(later),
    laterHasMarkup: partialLine || !later.every(isInertPhrasing),
    laterMark: readTouchingMark(later[0], "later"),
    laterRest: textValues(later.slice(1)),
  };
};

export const serializeMarkdownText: NonNullable<RemarkStringifyHandlers["text"]> = (
  node: { value: string },
  parent,
  state,
  info,
) => {
  const { value } = node;
  const childIndex = state.indexStack[state.indexStack.length - 1] ?? -1;
  const trailingWhitespace = TRAILING_WHITESPACE_PATTERN.exec(value)?.[0] ?? "";
  // Whitespace the parse drops is left out rather than encoded, so the file the editor writes is
  // the file it reads back. Every other position keeps it raw, which is what `state.safe` would
  // write there anyway and what a typed space beside literal source needs.
  const droppedWhitespace = opensTrimmedContent(node as PhrasingNode, parent, info.before)
    ? (LEADING_WHITESPACE_PATTERN.exec(value)?.[0] ?? "")
    : "";
  // A value that is whitespace alone is both what the line opens with and what it closes with,
  // so the body cannot start after it ends.
  const bodyEnd = Math.max(droppedWhitespace.length, value.length - trailingWhitespace.length);
  const writtenWhitespace = closesTrimmedContent(parent, childIndex) ? "" : value.slice(bodyEnd);
  const after = writtenWhitespace + info.after;
  const escaped = state.safe(value.slice(droppedWhitespace.length, bodyEnd), {
    ...info,
    after,
  });
  const slots = decodeEscapes(escaped);
  const neighbors = readPhrasingNeighbors(parent, childIndex);

  relaxAttentionEscapes(
    slots,
    info.before,
    after,
    neighbors,
    readEnclosingMarkers(parent, state.stack),
  );
  const lineNeighbors = readLineBrackets(node, parent) ?? neighbors;
  // A table measures its columns from the serialized cell, so a cell resolved after the fact would
  // be padded to a width it no longer has.
  const deferrable = !state.stack.includes("tableCell");
  // `containerFlow` hands a block's first child a line ending as its `before`, and that child is
  // the only one that can begin the block's own first line. A marker anywhere else sits on a line
  // the paragraph already started, where a list has to interrupt to open.
  const blockStart = childIndex === 0 && info.before === "\n";

  relaxBlockMarkerEscapes(slots, info.before, after, blockStart, deferrable);
  relaxBracketEscapes(slots, lineNeighbors, documentLabels, deferrable);
  relaxAngleEscapes(slots, lineNeighbors, deferrable);
  relaxAutolinkLiteralEscapes(slots, info.before, after);
  relaxCharacterReferenceEscapes(slots, after);

  return encodeEscapes(slots) + writtenWhitespace;
};
