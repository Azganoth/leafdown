import type {
  Code,
  Construct,
  Extension,
  State,
  Token,
  TokenizeContext,
  Tokenizer,
} from "micromark-util-types";

declare module "micromark-util-types" {
  interface TokenTypeMap {
    leafdownMath: "leafdownMath";
    leafdownMathData: "leafdownMathData";
    leafdownMathSequence: "leafdownMathSequence";
  }
}

export const MATH_MARKDOWN_TYPE = "leafdownMath";

const DOLLAR = 36;
const BACKSLASH = 92;
const SPACE = 32;
const LESS_THAN = 60;

const isLineEnding = (code: Code) => code !== null && code < -2;
const isWhitespace = (code: Code) => code === null || code < 0 || code === SPACE;
const LETTER_OR_DIGIT_PATTERN = /[\p{L}\p{N}]/u;
const isLetterOrDigit = (code: Code) =>
  code !== null && code > 0 && LETTER_OR_DIGIT_PATTERN.test(String.fromCodePoint(code));

// A `$` run opens math only where a letter or a digit does not stand against it, so `US$5` and a
// run continuing an earlier `$` stay text. An escaped `$` ends its own run.
function previous(this: TokenizeContext, code: Code) {
  if (code === DOLLAR) {
    return this.events.at(-1)?.[1].type === "characterEscape";
  }

  return !isLetterOrDigit(code);
}

// Inline math is a run of one `$` hugging its content, and display math a run of two that may be
// padded by whitespace. A closing run is the same length and stands against no letter or digit, so
// `$5 and $10` never pairs. A backslash takes the character after it, which keeps `\$` inside the
// content. The source is kept whole, delimiters included, and nothing inside it is Markdown.
const tokenizeMath: Tokenizer = function (effects, ok, nok) {
  const followsHtml = this.events.at(-1)?.[1].type === "htmlText";
  let openSize = 0;
  let closeSize = 0;
  let lastContent: Code = null;
  let hasContent = false;
  let candidate: Token | undefined;

  const start: State = (code) => {
    effects.enter(MATH_MARKDOWN_TYPE);
    effects.enter("leafdownMathSequence");
    return openSequence(code);
  };

  const openSequence: State = (code) => {
    if (code === DOLLAR) {
      openSize += 1;
      if (openSize > 2) return nok(code);
      effects.consume(code);
      return openSequence;
    }
    if (code === null || (openSize === 1 && isWhitespace(code))) {
      return nok(code);
    }
    // GitHub reads `<span>$</span>` as a literal dollar, and documents it as the way to write one.
    if (code === LESS_THAN && followsHtml) {
      return nok(code);
    }
    effects.exit("leafdownMathSequence");
    return between(code);
  };

  const between: State = (code) => {
    if (code === null) return nok(code);
    if (isLineEnding(code)) {
      effects.enter("lineEnding");
      effects.consume(code);
      effects.exit("lineEnding");
      lastContent = code;
      return between;
    }
    // As in Pandoc, a `$` after whitespace ends the attempt rather than being read as content, so
    // `$5.00 and $10 ... $x$` cannot pair its first dollar with a closer further along the line.
    if (code === DOLLAR && openSize === 1 && isWhitespace(lastContent)) {
      return nok(code);
    }
    if (code === DOLLAR) {
      candidate = effects.enter("leafdownMathSequence");
      closeSize = 0;
      return closeSequence(code);
    }
    effects.enter("leafdownMathData");
    return data(code);
  };

  const data: State = (code) => {
    if (code === null || code === DOLLAR || isLineEnding(code)) {
      effects.exit("leafdownMathData");
      return between(code);
    }
    if (code === BACKSLASH) {
      effects.consume(code);
      lastContent = code;
      hasContent = true;
      return escaped;
    }
    effects.consume(code);
    lastContent = code;
    hasContent ||= !isWhitespace(code);
    return data;
  };

  // An escaped character is content whatever it is, so `\ ` before a closing `$` still closes.
  const escaped: State = (code) => {
    if (code === null || isLineEnding(code)) return data(code);
    effects.consume(code);
    lastContent = BACKSLASH;
    return data;
  };

  const closeSequence: State = (code) => {
    if (code === DOLLAR) {
      closeSize += 1;
      effects.consume(code);
      return closeSequence;
    }
    const closes =
      closeSize === openSize &&
      hasContent &&
      !isLetterOrDigit(code) &&
      (openSize === 2 || !isWhitespace(lastContent));
    if (closes) {
      effects.exit("leafdownMathSequence");
      effects.exit(MATH_MARKDOWN_TYPE);
      return ok(code);
    }
    // `$x$$y$` could close at either end of the pair, so inline math standing against a longer run
    // is left as the text it spells rather than guessed.
    if (openSize === 1 && closeSize > 1) {
      return nok(code);
    }
    // A run that does not close is content, so the token it opened becomes data and carries on.
    candidate!.type = "leafdownMathData";
    lastContent = DOLLAR;
    hasContent = true;
    return data(code);
  };

  return start;
};

const mathConstruct: Construct = {
  name: "leafdownMath",
  previous,
  tokenize: tokenizeMath,
};

export const mathSyntax: Extension = {
  text: { [DOLLAR]: mathConstruct },
};

const LETTER_OR_DIGIT_CHARACTER = /^[\p{L}\p{N}]$/u;
const WHITESPACE_CHARACTER = /^\s$/u;
const isLetterOrDigitCharacter = (character: string | undefined) =>
  character !== undefined && LETTER_OR_DIGIT_CHARACTER.test(character);
const isWhitespaceCharacter = (character: string | undefined) =>
  character === undefined || WHITESPACE_CHARACTER.test(character);

// Whether a bare `$` at `position` would open math that closes later in the same block, under the
// tokenizer's rules. Every other `$` in the block is read as bare, so a run another escape keeps
// literal may still be counted as a closer, which only ever keeps an escape that was not needed.
export const opensMathAt = (block: string, position: number) => {
  const before = block[position - 1];
  if (before === "$" || isLetterOrDigitCharacter(before)) return false;
  let size = 0;
  while (block[position + size] === "$") size += 1;
  const first = block[position + size];
  if (size > 2 || first === undefined || (size === 1 && isWhitespaceCharacter(first))) {
    return false;
  }
  let last = "";
  let hasContent = false;
  for (let index = position + size; index < block.length;) {
    const character = block[index];
    if (character === "\\") {
      index += 2;
      last = "\\";
      hasContent = true;
      continue;
    }
    if (character === "$") {
      if (size === 1 && isWhitespaceCharacter(last)) return false;
      let run = 0;
      while (block[index + run] === "$") run += 1;
      if (
        run === size &&
        hasContent &&
        !isLetterOrDigitCharacter(block[index + run]) &&
        (size === 2 || !isWhitespaceCharacter(last))
      ) {
        return true;
      }
      if (size === 1 && run > 1) return false;
      index += run;
      last = "$";
      hasContent = true;
      continue;
    }
    hasContent ||= !isWhitespaceCharacter(character);
    last = character;
    index += 1;
  }
  return false;
};

export const isDisplayMathSource = (source: string) => source.startsWith("$$");

// Where the TeX of math source lies: inside its delimiters, and inside the backticks of GitHub's
// `` $`...`$ `` form. Source being edited may have lost its closing delimiter, and then the TeX runs
// to its end.
export const getMathContentRange = (source: string) => {
  const delimiter = isDisplayMathSource(source) ? 2 : source.startsWith("$") ? 1 : 0;
  const closed =
    delimiter > 0 && source.length >= 2 * delimiter && source.endsWith(source.slice(0, delimiter));
  let from = delimiter;
  let to = closed ? source.length - delimiter : source.length;
  if (delimiter === 1 && to - from >= 2 && source[from] === "`" && source[to - 1] === "`") {
    from += 1;
    to -= 1;
  }
  return { from, to };
};
