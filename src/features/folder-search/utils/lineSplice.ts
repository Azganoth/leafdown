/** Lines `a[aStart, aEnd)` that differ, standing where `b[bStart, bEnd)` stands in the other text. */
export interface LineDiffHunk {
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
}

// Past this many inserted and deleted lines, a diff costs more than it can save, and the caller
// writes the file whole instead.
const MAX_DIFF_EDITS = 4000;

/**
 * The hunks that turn `a` into `b`, by the shortest edit script, or `null` once it would need more
 * than `maxEdits` inserted and deleted lines.
 */
export const diffLines = (
  a: readonly string[],
  b: readonly string[],
  maxEdits = MAX_DIFF_EDITS,
): LineDiffHunk[] | null => {
  let prefix = 0;

  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix += 1;
  }

  let suffix = 0;

  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const pairs = matchLines(
    a.slice(prefix, a.length - suffix),
    b.slice(prefix, b.length - suffix),
    maxEdits,
  );

  if (!pairs) {
    return null;
  }

  const hunks: LineDiffHunk[] = [];
  let previousA = prefix - 1;
  let previousB = prefix - 1;

  for (const [pairA, pairB] of [
    ...pairs.map(([inA, inB]) => [inA + prefix, inB + prefix] as const),
    [a.length - suffix, b.length - suffix] as const,
  ]) {
    if (pairA > previousA + 1 || pairB > previousB + 1) {
      hunks.push({ aStart: previousA + 1, aEnd: pairA, bStart: previousB + 1, bEnd: pairB });
    }

    previousA = pairA;
    previousB = pairB;
  }

  return hunks;
};

// Myers' greedy algorithm, keeping each step's frontier to walk the path back as matched pairs.
const matchLines = (a: readonly string[], b: readonly string[], maxEdits: number) => {
  const n = a.length;
  const m = b.length;
  const limit = Math.min(n + m, maxEdits);
  const offset = limit + 1;
  const frontier = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];

  for (let edits = 0; edits <= limit; edits += 1) {
    trace.push(frontier.slice(offset - edits - 1, offset + edits + 2));

    for (let diagonal = -edits; diagonal <= edits; diagonal += 2) {
      const down =
        diagonal === -edits ||
        (diagonal !== edits && frontier[offset + diagonal - 1] < frontier[offset + diagonal + 1]);
      let x = down ? frontier[offset + diagonal + 1] : frontier[offset + diagonal - 1] + 1;
      let y = x - diagonal;

      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }

      frontier[offset + diagonal] = x;

      if (x >= n && y >= m) {
        return walkBack(trace, n, m);
      }
    }
  }

  return null;
};

const walkBack = (trace: readonly Int32Array[], n: number, m: number) => {
  const pairs: [number, number][] = [];
  let x = n;
  let y = m;

  for (let edits = trace.length - 1; edits >= 0; edits -= 1) {
    const frontier = trace[edits];
    const at = (diagonal: number) => frontier[diagonal + edits + 1];
    const diagonal = x - y;
    const previousDiagonal =
      diagonal === -edits || (diagonal !== edits && at(diagonal - 1) < at(diagonal + 1))
        ? diagonal + 1
        : diagonal - 1;
    const previousX = edits === 0 ? 0 : at(previousDiagonal);
    const previousY = edits === 0 ? 0 : previousX - previousDiagonal;

    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
      pairs.push([x, y]);
    }

    x = previousX;
    y = previousY;
  }

  return pairs.toReversed();
};

interface Line {
  text: string;
  ending: string;
}

const LINE_PATTERN = /([^\r\n]*)(\r\n|\r|\n|$)/gu;

const splitLines = (text: string): Line[] => {
  const lines: Line[] = [];

  for (const [, lineText, ending] of text.matchAll(LINE_PATTERN)) {
    if (lineText === "" && ending === "") {
      break;
    }

    lines.push({ text: lineText, ending });
  }

  return lines;
};

const texts = (lines: readonly Line[]) => lines.map(({ text }) => text);

const joinLines = (lines: readonly Line[]) =>
  lines.map(({ ending, text }) => text + ending).join("");

/**
 * Carries the lines a replacement changed from one serialization to another into the file as it
 * was authored, leaving every other line as the file has it. `baseline` is what a save writes for
 * the file untouched and `replaced` what it writes once replaced, so lines where the file and its
 * baseline differ are the save's own rewriting, which the result does not take on. Returns `null`
 * when a changed line cannot be placed in the file. The caller verifies that the result reads as
 * `replaced`.
 */
export const spliceReplacedLines = (original: string, baseline: string, replaced: string) => {
  const originalLines = splitLines(original);
  const baselineLines = splitLines(baseline);
  const replacedLines = splitLines(replaced);
  const rewritten = diffLines(texts(baselineLines), texts(originalLines));
  const edits = diffLines(texts(baselineLines), texts(replacedLines));

  if (!rewritten || !edits) {
    return null;
  }

  // Where each baseline line stands in the file, or -1 for a line the save rewrote.
  const inOriginal = new Int32Array(baselineLines.length).fill(-1);
  let baselineIndex = 0;
  let originalIndex = 0;

  for (const hunk of [
    ...rewritten,
    {
      aStart: baselineLines.length,
      aEnd: baselineLines.length,
      bStart: originalLines.length,
      bEnd: originalLines.length,
    },
  ]) {
    while (baselineIndex < hunk.aStart) {
      inOriginal[baselineIndex++] = originalIndex++;
    }

    baselineIndex = hunk.aEnd;
    originalIndex = hunk.bEnd;
  }

  const result: Line[] = [];
  let copied = 0;

  for (const { aEnd, aStart, bEnd, bStart } of edits) {
    let start: number;
    let end: number;

    if (aStart < aEnd) {
      start = inOriginal[aStart];
      end = start + (aEnd - aStart);

      for (let index = aStart; index < aEnd; index += 1) {
        if (inOriginal[index] !== start + index - aStart) {
          return null;
        }
      }
    } else if (aStart < baselineLines.length && inOriginal[aStart] !== -1) {
      start = end = inOriginal[aStart];
    } else if (aStart > 0 && inOriginal[aStart - 1] !== -1) {
      start = end = inOriginal[aStart - 1] + 1;
    } else if (baselineLines.length === 0) {
      start = end = originalLines.length;
    } else {
      return null;
    }

    if (start < copied) {
      return null;
    }

    result.push(...originalLines.slice(copied, start));

    const inserted = replacedLines.slice(bStart, bEnd).map((line) => ({ ...line }));

    // The file keeps how it ends when the save's last line takes the place of its own.
    if (end === originalLines.length && end > start && inserted.length > 0) {
      inserted[inserted.length - 1].ending = originalLines[end - 1].ending;
    }

    result.push(...inserted);
    copied = end;
  }

  result.push(...originalLines.slice(copied));

  return joinLines(result);
};
