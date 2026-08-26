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

interface BracketNeighbors {
  earlier: string;
  later: string;
  laterHasMarkup: boolean;
}

interface PhrasingNeighbors extends BracketNeighbors {
  textOnly: boolean;
}

interface PhrasingNode {
  type: string;
  value?: string;
  marker?: string;
  children?: readonly PhrasingNode[];
}

const TRAILING_WHITESPACE_PATTERN = /\s+$/u;
// `state.safe` escapes ASCII punctuation and nothing else. Decoding with a wider class would read a
// backslash before ordinary text as an escape.
const ESCAPABLE_PATTERN = /[!-/:-@[-`{-~]/u;
const UNICODE_PUNCTUATION_PATTERN = /[\p{P}\p{S}]/u;
const ATTENTION_CHARACTERS = "*_";
const THEMATIC_BREAK_PATTERNS: Record<string, RegExp> = { "*": /^[*\t ]*$/u, _: /^[_\t ]*$/u };
const WHOLE_LINE_PHRASING_PARENTS = new Set(["heading", "paragraph", "tableCell"]);
// A mark holds only a fragment of its line, so its siblings cannot answer what follows the mark.
// Every `[` in the fragment keeps its escape, which is also what makes an unescaped `[` from
// earlier in the line impossible: any text before a mark sees the mark as later markup.
const FRAGMENT_PHRASING_PARENTS = new Set(["delete", "emphasis", "link", "strong"]);
const ATTENTION_CONSTRUCTS = new Set(["emphasis", "strong"]);
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

// A run inside a mark can always pair with the mark's own delimiters, so those count as reachable
// counterparts. Only the innermost marker is readable from the parent, and `delete` and a link
// label carry none, so deeper nesting falls back to treating both characters as reachable.
const readEnclosingMarkers = (
  parent: { type: string; marker?: string } | undefined,
  stack: readonly string[],
): string => {
  const enclosing = stack.filter((construct) => ATTENTION_CONSTRUCTS.has(construct));

  if (enclosing.length === 0) {
    return "";
  }

  return enclosing.length === 1 && parent?.marker ? parent.marker : ATTENTION_CHARACTERS;
};

const relaxAttentionEscapes = (
  slots: EscapeSlot[],
  before: string,
  after: string,
  neighbors: PhrasingNeighbors | undefined,
  enclosingMarkers: string,
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
      neighbors === undefined ||
      enclosingMarkers.includes(run.character) ||
      !neighbors.textOnly ||
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

const relaxBracketEscapes = (slots: EscapeSlot[], neighbors: BracketNeighbors | undefined) => {
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

// A handler receives only its own node and immediate parent, and `state.indexStack` is a path of
// numbers with no node to walk it from, so the line a marked run sits on is otherwise unreachable.
// The root handler is the one hook that runs before any of them.
let lineParents: Map<PhrasingNode, PhrasingNode> | undefined;

const mapLineParents = (root: PhrasingNode) => {
  const parents = new Map<PhrasingNode, PhrasingNode>();
  const visit = (node: PhrasingNode) => {
    for (const child of node.children ?? []) {
      parents.set(child, node);
      visit(child);
    }
  };

  visit(root);

  return parents;
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
      } else if (child.type === "text") {
        if (seen) {
          later.push(child.value ?? "");
        } else if (ownLine) {
          earlier.push(child.value ?? "");
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
  lineParents = mapLineParents(node as PhrasingNode);

  try {
    return state.containerFlow(node, info);
  } finally {
    lineParents = undefined;
  }
};

const readPhrasingNeighbors = (
  parent: { type: string; children: readonly { type: string; value?: string }[] } | undefined,
  index: number,
): PhrasingNeighbors | undefined => {
  const partialLine = parent !== undefined && FRAGMENT_PHRASING_PARENTS.has(parent.type);

  if (!parent || (!WHOLE_LINE_PHRASING_PARENTS.has(parent.type) && !partialLine) || index < 0) {
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
    laterHasMarkup: partialLine || later.some((child) => child.type !== "text"),
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

  relaxAttentionEscapes(
    slots,
    info.before,
    after,
    neighbors,
    readEnclosingMarkers(parent, state.stack),
  );
  relaxBracketEscapes(slots, readLineBrackets(node, parent) ?? neighbors);
  relaxAutolinkLiteralEscapes(slots, info.before, after);

  return encodeEscapes(slots) + trailingWhitespace;
};
