import type { SourceProjectionPresentationSpan } from "./sourceProjectionAdapters";

const MARKER = "leafdown-source-projection__marker";
const CONTENT = "leafdown-source-projection__content";

const findUnescaped = (source: string, character: string, from: number, to: number) => {
  for (let index = from; index < to; index += 1) {
    if (source[index] === "\\") {
      index += 1;
    } else if (source[index] === character) {
      return index;
    }
  }

  return to;
};

export const getLinkSourceSuffixSpans = (
  source: string,
  from: number,
  to: number,
  valueClassName = CONTENT,
): SourceProjectionPresentationSpan[] => {
  const spans: SourceProjectionPresentationSpan[] = [];
  const add = (className: string, start: number, end: number) => {
    if (start < end) spans.push({ className, from: start, to: end });
  };
  const opening = source[from + 1];

  if (source[from] !== "]" || (opening !== "(" && opening !== "[")) {
    add(MARKER, from, to);
    return spans;
  }

  let position = from + 2;
  add(MARKER, from, position);

  if (opening === "[") {
    const end = findUnescaped(source, "]", position, to);
    add(MARKER, position, end);
    add(MARKER, end, to);
    return spans;
  }

  while (position < to && /\s/u.test(source[position])) position += 1;
  add(MARKER, from + 2, position);

  const titleWithoutDestination =
    position > from + 2 &&
    (source[position] === '"' || source[position] === "'" || source[position] === "(");

  if (!titleWithoutDestination && source[position] === "<") {
    add(MARKER, position, position + 1);
    const end = findUnescaped(source, ">", position + 1, to);
    add(MARKER, position + 1, end);
    position = Math.min(end + 1, to);
    add(MARKER, end, position);
  } else if (!titleWithoutDestination) {
    const start = position;
    let depth = 0;

    while (position < to) {
      const character = source[position];
      if (character === "\\") {
        position = Math.min(position + 2, to);
        continue;
      }
      if (character === "(") depth += 1;
      if (character === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
      if (/\s/u.test(character) && depth === 0) break;
      position += 1;
    }

    add(MARKER, start, position);
  }

  const titleSeparator = position;
  while (position < to && /\s/u.test(source[position])) position += 1;
  add(MARKER, titleSeparator, position);

  const delimiter = source[position];
  if (delimiter === '"' || delimiter === "'" || delimiter === "(") {
    add(MARKER, position, position + 1);
    const end = findUnescaped(source, delimiter === "(" ? ")" : delimiter, position + 1, to);
    add(valueClassName, position + 1, end);
    position = Math.min(end + 1, to);
    add(MARKER, end, position);
  }

  add(MARKER, position, to);
  return spans;
};

export const getImageSourcePresentationSpans = (
  source: string,
  from = 0,
  to = source.length,
  contentClassName = CONTENT,
): SourceProjectionPresentationSpan[] => {
  if (source.slice(from, from + 2) !== "![") {
    return [];
  }

  let depth = 0;
  let labelTo = to;

  for (let index = from + 2; index < to; index += 1) {
    if (source[index] === "\\") {
      index += 1;
    } else if (source[index] === "[") {
      depth += 1;
    } else if (source[index] === "]") {
      if (depth === 0) {
        labelTo = index;
        break;
      }
      depth -= 1;
    }
  }

  return [
    { className: MARKER, from, to: from + 2 },
    { className: contentClassName, from: from + 2, to: labelTo },
    ...getLinkSourceSuffixSpans(source, labelTo, to, contentClassName),
  ].filter(({ from: start, to: end }) => start < end);
};
