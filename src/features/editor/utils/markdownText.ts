import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

interface EscapeSlot {
  character: string;
  escaped: boolean;
}

interface AttentionRun {
  character: string;
  start: number;
  end: number;
  canOpen: boolean;
  canClose: boolean;
  atLineStart: boolean;
}

interface PhrasingNeighbors {
  textOnly: boolean;
  earlier: string;
  later: string;
  laterHasMarkup: boolean;
}

const TRAILING_WHITESPACE_PATTERN = /\s+$/u;
// `state.safe` escapes ASCII punctuation and nothing else. Decoding with a wider class would read a
// backslash before ordinary text as an escape.
const ESCAPABLE_PATTERN = /[!-/:-@[-`{-~]/u;
const UNICODE_PUNCTUATION_PATTERN = /[\p{P}\p{S}]/u;
const ATTENTION_CHARACTERS = "*_";
const THEMATIC_BREAK_PATTERNS: Record<string, RegExp> = { "*": /^[*\t ]*$/u, _: /^[_\t ]*$/u };
const WHOLE_LINE_PHRASING_PARENTS = new Set(["heading", "paragraph", "tableCell"]);

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

const encodeEscapes = (slots: readonly EscapeSlot[]) =>
  slots.map((slot) => (slot.escaped ? `\\${slot.character}` : slot.character)).join("");

type CharacterClass = "whitespace" | "punctuation" | "other";

const classifyCharacter = (character: string | undefined): CharacterClass => {
  if (character === undefined || /\s/u.test(character)) {
    return "whitespace";
  }

  return UNICODE_PUNCTUATION_PATTERN.test(character) ? "punctuation" : "other";
};

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
    const previous = classifyCharacter(previousCharacter);
    const next = classifyCharacter(characterAt(end));
    const leftFlanking = next !== "whitespace" && (next !== "punctuation" || previous !== "other");
    const rightFlanking =
      previous !== "whitespace" && (previous !== "punctuation" || next !== "other");

    runs.push({
      character,
      start: index,
      end,
      canOpen:
        character === "*"
          ? leftFlanking
          : leftFlanking && (!rightFlanking || previous === "punctuation"),
      canClose:
        character === "*"
          ? rightFlanking
          : rightFlanking && (!leftFlanking || next === "punctuation"),
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

const relaxAttentionEscapes = (
  slots: EscapeSlot[],
  before: string,
  after: string,
  neighbors: PhrasingNeighbors | undefined,
) => {
  const runs = findAttentionRuns(
    slots,
    before.slice(-1) || undefined,
    after.slice(0, 1) || undefined,
  );

  for (const run of runs) {
    if (opensBlockConstruct(run, slots, after)) {
      continue;
    }

    const counterpart = (other: AttentionRun) => other.character === run.character;
    const pairable =
      !neighbors?.textOnly ||
      neighbors.earlier.includes(run.character) ||
      neighbors.later.includes(run.character) ||
      (run.canOpen &&
        runs.some((other) => counterpart(other) && other.start > run.start && other.canClose)) ||
      (run.canClose &&
        runs.some((other) => counterpart(other) && other.start < run.start && other.canOpen));

    if ((run.canOpen || run.canClose) && pairable) {
      continue;
    }

    for (let index = run.start; index < run.end; index += 1) {
      slots[index].escaped = false;
    }
  }
};

const relaxBracketEscapes = (slots: EscapeSlot[], neighbors: PhrasingNeighbors | undefined) => {
  if (!neighbors) {
    return;
  }

  let closerAhead = neighbors.laterHasMarkup || neighbors.later.includes("]");

  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const slot = slots[index];

    if (slot.character === "]") {
      closerAhead = true;
    } else if (slot.character === "[" && slot.escaped && !closerAhead) {
      slot.escaped = false;
    }
  }

  let openerBehind = neighbors.earlier.includes("[");

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];

    if (slot.character === "[" && !slot.escaped) {
      openerBehind = true;
    } else if (
      slot.character === "(" &&
      slot.escaped &&
      !openerBehind &&
      slots[index - 1]?.character === "]"
    ) {
      slot.escaped = false;
    }
  }
};

const readPhrasingNeighbors = (
  parent: { type: string; children: readonly { type: string; value?: string }[] } | undefined,
  index: number,
): PhrasingNeighbors | undefined => {
  if (!parent || !WHOLE_LINE_PHRASING_PARENTS.has(parent.type) || index < 0) {
    return undefined;
  }

  const children = parent.children;
  const earlier = children.slice(0, index);
  const later = children.slice(index + 1);
  const textValues = (nodes: readonly { type: string; value?: string }[]) =>
    nodes
      .filter((child) => child.type === "text")
      .map((child) => child.value ?? "")
      .join(" ");

  return {
    textOnly: children.every((child) => child.type === "text"),
    earlier: textValues(earlier),
    later: textValues(later),
    laterHasMarkup: later.some((child) => child.type !== "text"),
  };
};

export const serializeMarkdownText: NonNullable<RemarkStringifyHandlers["text"]> = (
  node: { value: string },
  parent,
  state,
  info,
) => {
  const { value } = node;
  const trailingWhitespace = TRAILING_WHITESPACE_PATTERN.exec(value)?.[0] ?? "";
  const after = trailingWhitespace + info.after;
  const escaped = state.safe(value.slice(0, value.length - trailingWhitespace.length), {
    ...info,
    after,
  });
  const slots = decodeEscapes(escaped);
  const neighbors = readPhrasingNeighbors(
    parent,
    state.indexStack[state.indexStack.length - 1] ?? -1,
  );

  relaxAttentionEscapes(slots, info.before, after, neighbors);
  relaxBracketEscapes(slots, neighbors);

  return encodeEscapes(slots) + trailingWhitespace;
};
