import { isHistoryTransaction } from "@milkdown/kit/prose/history";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { ReplaceStep } from "@milkdown/kit/prose/transform";
import { $prose } from "@milkdown/kit/utils";

import { hasActiveSourceProjection, leafdownSourceProjectionPluginKey } from "./sourceProjection";

const ATTENTION_CHARACTERS = "*_~";
const MAXIMUM_RUN_LENGTH = 2;
const UNICODE_PUNCTUATION_PATTERN = /[\p{P}\p{S}]/u;
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
  markName: string;
  opening: DelimiterRun;
}

const readMarkName = (character: string, length: number) => {
  if (character === "~") {
    return "strike_through";
  }

  return length === 1 ? "emphasis" : "strong";
};

// A run pairs only where it flanks its content, and the run answered for here always faces a mark,
// whose own delimiters are punctuation. Both CommonMark tests collapse to the character on the
// outer side under that neighbour: a run cannot open after a letter or a digit and cannot close
// before one. The intraword rule `_` adds falls out of the same neighbour and needs no separate
// test.
const isOuterNeighbourFlanking = (character: string | undefined) =>
  character === undefined || /\s/u.test(character) || UNICODE_PUNCTUATION_PATTERN.test(character);

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

const findAttentionPair = (
  state: EditorState,
  { character, position }: TypedDelimiter,
): AttentionPair | null => {
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

  const typed = readTypedRun(child, position, character);
  const length = typed.to - typed.from;

  if (length > MAXIMUM_RUN_LENGTH) {
    return null;
  }

  for (const direction of [-1, 1]) {
    const facesMark = direction < 0 ? typed.from === child.from : typed.to === child.to;
    const counterpart = facesMark
      ? findCounterpart(children, index, character, length, direction)
      : null;

    if (!counterpart) {
      continue;
    }

    const opening = direction < 0 ? counterpart : typed;
    const closing = direction < 0 ? typed : counterpart;
    const markName = readMarkName(character, length);

    if (
      !isOuterNeighbourFlanking(readCharacterAt(state, opening.from - 1, blockFrom, blockTo)) ||
      !isOuterNeighbourFlanking(readCharacterAt(state, closing.to, blockFrom, blockTo)) ||
      state.schema.marks[markName] === undefined ||
      carriesMark(state, opening.to, closing.from, markName)
    ) {
      continue;
    }

    return { closing, markName, opening };
  }

  return null;
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

          const pair = findAttentionPair(state, typed);
          const transaction = state.tr.setMeta(PAIRED_META, true);

          if (!pair) {
            return transaction;
          }

          const { closing, markName, opening } = pair;
          const length = opening.to - opening.from;
          const mark = state.schema.marks[markName].create(
            markName === "strike_through" ? null : { marker: typed.character },
          );

          return transaction
            .delete(closing.from, closing.to)
            .delete(opening.from, opening.to)
            .addMark(opening.from, closing.from - length, mark);
        },
      }),
  );
