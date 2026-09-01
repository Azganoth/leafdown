import { isHistoryTransaction } from "@milkdown/kit/prose/history";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { ReplaceStep } from "@milkdown/kit/prose/transform";
import { $prose } from "@milkdown/kit/utils";

import {
  hasActiveSourceProjection,
  leafdownSourceProjectionPluginKey,
  SOURCE_PROJECTION_ENTRY_SUPPRESSION_META,
} from "./sourceProjection";

const ATTENTION_CHARACTERS = "*_~";
// A tilde is left out. GFM reads a strikethrough only where the closing run matches the opening
// one, so an unequal tilde run spells nothing to pair, and the input rule Leafdown owns for it
// already holds a run literal until the author closes it.
const LITERAL_PAIRING_CHARACTERS = "*_";
const MAXIMUM_RUN_LENGTH = 2;
const MAXIMUM_LITERAL_PAIR_LENGTH = 3;
const UNICODE_PUNCTUATION_PATTERN = /[\p{P}\p{S}]/u;
// The preset input rules refuse a run that follows a word character, a colon, or a slash, which
// keeps a delimiter inside a word or a URL literal. The guard is kept, less the underscore that
// `\w` counts as a word character and CommonMark counts as punctuation.
const LITERAL_PAIRING_GUARD_PATTERN = /[\p{L}\p{N}:/]/u;
const PAIRED_META = "leafdownAttentionPaired";

export const leafdownAttentionPairingPluginKey = new PluginKey<TypedDelimiter | null>(
  "leafdownAttentionPairing",
);

interface TypedDelimiter {
  character: string;
  position: number;
}

interface InlineChild {
  from: number;
  node: ProseMirrorNode;
  to: number;
}

interface DelimiterRun {
  from: number;
  to: number;
}

interface AttentionPair {
  closing: DelimiterRun;
  markNames: readonly string[];
  opening: DelimiterRun;
}

interface LiteralAttentionPair extends AttentionPair {
  closingRunEnd: number;
  isOpenToGrowth: boolean;
}

interface TypedContext {
  blockFrom: number;
  blockTo: number;
  child: InlineChild;
  children: readonly InlineChild[];
  index: number;
  run: DelimiterRun;
}

const readMarkNames = (character: string, length: number): readonly string[] => {
  if (character === "~") {
    return ["strike_through"];
  }

  if (length === 1) {
    return ["emphasis"];
  }

  return length === 2 ? ["strong"] : ["emphasis", "strong"];
};

const isFlankingWhitespace = (character: string | undefined) =>
  character === undefined || /\s/u.test(character);

const isFlankingPunctuation = (character: string | undefined) =>
  character !== undefined && UNICODE_PUNCTUATION_PATTERN.test(character);

// A run pairs only where it flanks its content, and the run answered for here always faces a mark,
// whose own delimiters are punctuation. Both CommonMark tests collapse to the character on the
// outer side under that neighbour: a run cannot open after a letter or a digit and cannot close
// before one. The intraword rule `_` adds falls out of the same neighbour and needs no separate
// test.
const isOuterNeighbourFlanking = (character: string | undefined) =>
  isFlankingWhitespace(character) || isFlankingPunctuation(character);

// A run facing its own text has no such neighbour to collapse the tests into, so it is measured
// against the characters on both of its sides the way CommonMark states them.
const isLeftFlanking = (before: string | undefined, after: string | undefined) =>
  !isFlankingWhitespace(after) &&
  (!isFlankingPunctuation(after) || isFlankingWhitespace(before) || isFlankingPunctuation(before));

const isRightFlanking = (before: string | undefined, after: string | undefined) =>
  !isFlankingWhitespace(before) &&
  (!isFlankingPunctuation(before) || isFlankingWhitespace(after) || isFlankingPunctuation(after));

const canOpenRun = (character: string, before: string | undefined, after: string | undefined) =>
  isLeftFlanking(before, after) &&
  (character !== "_" || !isRightFlanking(before, after) || isFlankingPunctuation(before));

// A run the author is still typing against has to be unambiguously a closer. CommonMark lets a
// run that flanks on both sides close as well as open, and one closed against a letter reads as
// the opener of a construct the author has not finished, so pairing it would build the wrong one
// around delimiters they are still adding to.
const canCloseRun = (before: string | undefined, after: string | undefined) =>
  isRightFlanking(before, after) && !isLeftFlanking(before, after);

const readInlineChildren = (parent: ProseMirrorNode, start: number) => {
  const children: InlineChild[] = [];
  let position = start;

  parent.forEach((node) => {
    children.push({ from: position, node, to: position + node.nodeSize });
    position += node.nodeSize;
  });

  return children;
};

const isLiteralText = (node: ProseMirrorNode) => node.isText && node.marks.length === 0;

const readTypedRun = (child: InlineChild, position: number, character: string): DelimiterRun => {
  const text = child.node.text ?? "";
  const offset = position - child.from;
  let start = offset;
  let end = offset + 1;

  while (start > 0 && text[start - 1] === character) {
    start -= 1;
  }

  while (end < text.length && text[end] === character) {
    end += 1;
  }

  return { from: child.from + start, to: child.from + end };
};

// The counterpart sits against the mark, so it is the run at the edge of the literal text facing
// it. A run of a different length spells a different construct than the one the author closed, so
// the lengths have to match exactly.
const readCounterpartRun = (
  child: InlineChild,
  character: string,
  length: number,
  direction: number,
): DelimiterRun | null => {
  const text = child.node.text ?? "";
  const run = character.repeat(length);

  if (direction < 0) {
    return text.endsWith(run) && text.at(-length - 1) !== character
      ? { from: child.to - length, to: child.to }
      : null;
  }

  return text.startsWith(run) && text[length] !== character
    ? { from: child.from, to: child.from + length }
    : null;
};

const findCounterpart = (
  children: readonly InlineChild[],
  index: number,
  character: string,
  length: number,
  direction: number,
) => {
  let cursor = index + direction;
  let spansMark = false;

  while (children[cursor]?.node.marks.length) {
    spansMark = true;
    cursor += direction;
  }

  const candidate = children[cursor];

  if (!spansMark || !candidate || !isLiteralText(candidate.node)) {
    return null;
  }

  return readCounterpartRun(candidate, character, length, direction);
};

const readCharacterAt = (state: EditorState, position: number, from: number, to: number) =>
  position < from || position >= to ? undefined : state.doc.textBetween(position, position + 1);

// A span already carrying the mark would nest it inside itself, which the mark-nesting pass
// flattens on the way out. Pairing would drop the delimiters the author typed without leaving the
// construct they spell, so the run stays literal instead.
const carriesMark = (state: EditorState, from: number, to: number, markName: string) => {
  const markType = state.schema.marks[markName];
  let carries = false;

  state.doc.nodesBetween(from, to, (node) => {
    carries ||= node.isText && markType.isInSet(node.marks) !== undefined;

    return !carries;
  });

  return carries;
};

const readTypedContext = (
  state: EditorState,
  { character, position }: TypedDelimiter,
): TypedContext | null => {
  if (position >= state.doc.content.size) {
    return null;
  }

  const resolved = state.doc.resolve(position);

  if (!resolved.parent.isTextblock) {
    return null;
  }

  const blockFrom = resolved.start();
  const blockTo = resolved.end();
  const children = readInlineChildren(resolved.parent, blockFrom);
  const index = children.findIndex((child) => child.from <= position && position < child.to);
  const child = children[index];

  if (
    !child ||
    !isLiteralText(child.node) ||
    readCharacterAt(state, position, blockFrom, blockTo) !== character
  ) {
    return null;
  }

  return {
    blockFrom,
    blockTo,
    child,
    children,
    index,
    run: readTypedRun(child, position, character),
  };
};

const findAttentionPair = (
  state: EditorState,
  { blockFrom, blockTo, child, children, index, run }: TypedContext,
  character: string,
): AttentionPair | null => {
  const length = run.to - run.from;

  if (length > MAXIMUM_RUN_LENGTH) {
    return null;
  }

  for (const direction of [-1, 1]) {
    const facesMark = direction < 0 ? run.from === child.from : run.to === child.to;
    const counterpart = facesMark
      ? findCounterpart(children, index, character, length, direction)
      : null;

    if (!counterpart) {
      continue;
    }

    const opening = direction < 0 ? counterpart : run;
    const closing = direction < 0 ? run : counterpart;
    const markNames = readMarkNames(character, length);

    if (
      !isOuterNeighbourFlanking(readCharacterAt(state, opening.from - 1, blockFrom, blockTo)) ||
      !isOuterNeighbourFlanking(readCharacterAt(state, closing.to, blockFrom, blockTo)) ||
      markNames.some((markName) => state.schema.marks[markName] === undefined) ||
      markNames.some((markName) => carriesMark(state, opening.to, closing.from, markName))
    ) {
      continue;
    }

    return { closing, markNames, opening };
  }

  return null;
};

// The literal counterpart of the pass above: the run the author closed faces its own text rather
// than a mark, so the opening run is the one the same text holds. CommonMark pairs as many
// delimiters as the shorter run spells and leaves the surplus literal, which is why an unequal run
// pairs at all.
//
// A closing run shorter than its opening one is not settled yet, because the next character the
// author types may extend it and pair a longer run. Such a pair is reported as open to growth and
// is applied once the caret leaves its end.
const findLiteralAttentionPair = (
  state: EditorState,
  { blockFrom, blockTo, child, run }: TypedContext,
  character: string,
): LiteralAttentionPair | null => {
  if (!LITERAL_PAIRING_CHARACTERS.includes(character)) {
    return null;
  }

  const text = child.node.text ?? "";
  const contentEnd = run.from - child.from;
  let contentStart = contentEnd;

  while (contentStart > 0 && text[contentStart - 1] !== character) {
    contentStart -= 1;
  }

  if (contentStart === 0 || contentStart === contentEnd) {
    return null;
  }

  let openingStart = contentStart;

  while (openingStart > 0 && text[openingStart - 1] === character) {
    openingStart -= 1;
  }

  const length = Math.min(contentStart - openingStart, run.to - run.from);
  const markNames = readMarkNames(character, length);
  const beforeOpening = readCharacterAt(state, child.from + openingStart - 1, blockFrom, blockTo);
  const afterClosing = readCharacterAt(state, run.to, blockFrom, blockTo);

  if (
    length > MAXIMUM_LITERAL_PAIR_LENGTH ||
    (beforeOpening !== undefined && LITERAL_PAIRING_GUARD_PATTERN.test(beforeOpening)) ||
    !canOpenRun(character, beforeOpening, text[contentStart]) ||
    !canCloseRun(text[contentEnd - 1], afterClosing) ||
    markNames.some((markName) => state.schema.marks[markName] === undefined)
  ) {
    return null;
  }

  return {
    closing: { from: run.from, to: run.from + length },
    closingRunEnd: run.to,
    isOpenToGrowth: contentStart - openingStart > run.to - run.from,
    markNames,
    opening: { from: child.from + contentStart - length, to: child.from + contentStart },
  };
};

const readInsertedDelimiter = (transaction: Transaction): TypedDelimiter | null => {
  for (const step of transaction.steps) {
    if (!(step instanceof ReplaceStep) || step.from !== step.to) {
      continue;
    }

    const inserted = step.slice.content;
    const node = inserted.firstChild;

    if (
      inserted.childCount === 1 &&
      node?.isText &&
      node.text?.length === 1 &&
      ATTENTION_CHARACTERS.includes(node.text)
    ) {
      return { character: node.text, position: step.from };
    }
  }

  return null;
};

// The pairing answers the character the author typed rather than the shape the document holds. A
// file that escapes a delimiter on each side of a run opens as the same three siblings, and those
// stay literal because nothing was typed into them.
//
// The typed character is held until the document settles: a source projection covering the run
// commits in a later dispatch, so the mark the run pairs across does not exist yet in the cycle
// the character arrives in.
// A pair still open to growth waits for the caret to leave the run it closed, because the author
// may extend that run and pair a longer one.
const isCaretAt = (state: EditorState, position: number) =>
  state.selection.empty && state.selection.head === position;

const applyTypedDelimiter = (
  transaction: Transaction,
  typed: TypedDelimiter | null,
): TypedDelimiter | null => {
  if (transaction.getMeta(PAIRED_META) === true) {
    return null;
  }

  if (
    !transaction.getMeta(leafdownSourceProjectionPluginKey) &&
    !isHistoryTransaction(transaction)
  ) {
    const inserted = readInsertedDelimiter(transaction);

    if (inserted) {
      return inserted;
    }
  }

  if (!typed || !transaction.docChanged) {
    return typed;
  }

  const mapped = transaction.mapping.mapResult(typed.position);

  return mapped.deleted ? null : { character: typed.character, position: mapped.pos };
};

export const createLeafdownAttentionPairingPlugin = () =>
  $prose(
    () =>
      new Plugin<TypedDelimiter | null>({
        key: leafdownAttentionPairingPluginKey,
        state: {
          init: () => null,
          apply: (transaction, typed) => applyTypedDelimiter(transaction, typed),
        },
        appendTransaction: (_transactions, _oldState, state) => {
          const typed = leafdownAttentionPairingPluginKey.getState(state);

          if (!typed || hasActiveSourceProjection(state)) {
            return null;
          }

          const context = readTypedContext(state, typed);
          const markedPair = context && findAttentionPair(state, context, typed.character);
          const literalPair =
            context && !markedPair
              ? findLiteralAttentionPair(state, context, typed.character)
              : null;

          if (literalPair?.isOpenToGrowth && isCaretAt(state, literalPair.closingRunEnd)) {
            return null;
          }

          const pair = markedPair ?? literalPair;
          const transaction = state.tr.setMeta(PAIRED_META, true);

          if (!pair) {
            return transaction;
          }

          const { closing, markNames, opening } = pair;
          const length = opening.to - opening.from;

          transaction.delete(closing.from, closing.to).delete(opening.from, opening.to);

          for (const markName of markNames) {
            transaction.addMark(
              opening.from,
              closing.from - length,
              state.schema.marks[markName].create(
                markName === "strike_through" ? null : { marker: typed.character },
              ),
            );
          }

          // The caret ends up against the span the pair just built, which reads the same as a
          // caret moved there. Both the marks it would inherit and the projection it would open
          // take the author's next character into the construct they just closed, so the pair
          // stands as the object it produced until they go back to it. An input rule leaves the
          // same caret and is answered the same way.
          return transaction
            .setMeta(SOURCE_PROJECTION_ENTRY_SUPPRESSION_META, true)
            .setStoredMarks([]);
        },
      }),
  );
