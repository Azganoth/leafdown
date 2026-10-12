import type { Transaction } from "@milkdown/kit/prose/state";
import { AttrStep } from "@milkdown/kit/prose/transform";

export type ChangedRange = [from: number, to: number];

// Ranges are in the transaction's final document. An attribute step maps no positions, so the
// node it changes is added as a range of its own.
export const collectChangedRanges = (transaction: Transaction) => {
  let ranges: ChangedRange[] = [];

  transaction.mapping.maps.forEach((map, index) => {
    ranges = ranges.map(([from, to]) => [map.map(from, -1), map.map(to, 1)]);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push([newStart, newEnd]);
    });

    const step = transaction.steps[index];

    if (step instanceof AttrStep) {
      ranges.push([step.pos, step.pos + 1]);
    }
  });

  return ranges;
};
