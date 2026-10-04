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

// Where an inline link tail opening with the `(` at `start` ends, or -1 where it closes no link.
export const scanInlineTail = (text: string, start: number) => {
  const destination = scanDestination(text, skipTailWhitespace(text, start + 1));

  if (destination < 0) {
    return -1;
  }

  const separated = skipTailWhitespace(text, destination);
  const title = separated > destination ? scanTitle(text, separated) : -1;
  const index = skipTailWhitespace(text, title < 0 ? separated : title);

  return text[index] === ")" ? index + 1 : -1;
};
