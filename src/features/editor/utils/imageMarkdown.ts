import { chooseTitleMarker, type TitleMarker } from "./markdownTitle";

export interface ImageMarkdownAttrs {
  alt: string;
  src: string;
  title: string;
  titleMarker: TitleMarker;
}

const TITLE_MARKER_PAIRS: Record<TitleMarker, readonly [string, string]> = {
  '"': ['"', '"'],
  "'": ["'", "'"],
  "(": ["(", ")"],
};

export const serializeImageMarkdown = ({ alt, src, title, titleMarker }: ImageMarkdownAttrs) => {
  const serializedAlt = escapeImageAlt(alt);
  const serializedSrc = serializeImageSource(src);

  if (!title) {
    return `![${serializedAlt}](${serializedSrc})`;
  }

  const marker = chooseTitleMarker(title, titleMarker);
  const [opening, closing] = TITLE_MARKER_PAIRS[marker];
  const serializedTitle = escapeImageTitle(title, marker);

  return `![${serializedAlt}](${serializedSrc} ${opening}${serializedTitle}${closing})`;
};

export const parseImageMarkdown = (value: string): ImageMarkdownAttrs | null => {
  const source = value.trim();

  if (!source.startsWith("![")) {
    return null;
  }

  const altEnd = findClosingBracket(source, 2);

  if (altEnd === -1 || source[altEnd + 1] !== "(" || !source.endsWith(")")) {
    return null;
  }

  return {
    alt: unescapeMarkdownText(source.slice(2, altEnd)),
    ...parseImageBody(source.slice(altEnd + 2, -1)),
  };
};

const parseImageBody = (body: string): Omit<ImageMarkdownAttrs, "alt"> => {
  const trimmedBody = body.trim();
  const titleMatch = getTrailingTitle(trimmedBody);

  if (!titleMatch) {
    return {
      src: normalizeImageSource(trimmedBody),
      title: "",
      titleMarker: '"',
    };
  }

  return {
    src: normalizeImageSource(titleMatch.src),
    title: unescapeMarkdownText(titleMatch.title),
    titleMarker: titleMatch.marker,
  };
};

const getTrailingTitle = (
  body: string,
): { marker: TitleMarker; src: string; title: string } | null => {
  const delimiter = body.at(-1);

  if (delimiter === '"' || delimiter === "'") {
    const titleStart = findOpeningDelimiter(body, delimiter);

    if (titleStart > 0 && /\s/u.test(body[titleStart - 1])) {
      return {
        marker: delimiter,
        src: body.slice(0, titleStart).trim(),
        title: body.slice(titleStart + 1, -1),
      };
    }
  }

  if (delimiter === ")") {
    const titleStart = findOpeningTitleParenthesis(body);

    if (titleStart > 0 && /\s/u.test(body[titleStart - 1])) {
      return {
        marker: "(",
        src: body.slice(0, titleStart).trim(),
        title: body.slice(titleStart + 1, -1),
      };
    }
  }

  return null;
};

const findClosingBracket = (value: string, start: number) => {
  let bracketDepth = 0;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];

    if (character === "\\") {
      index += 1;
      continue;
    }

    if (character === "[") {
      bracketDepth += 1;
      continue;
    }

    if (character === "]") {
      if (bracketDepth === 0) {
        return index;
      }

      bracketDepth -= 1;
    }
  }

  return -1;
};

const findOpeningDelimiter = (value: string, delimiter: string) => {
  for (let index = value.length - 2; index >= 0; index -= 1) {
    if (value[index] === delimiter && !isEscaped(value, index)) {
      return index;
    }
  }

  return -1;
};

const findOpeningTitleParenthesis = (value: string) => {
  let depth = 0;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const character = value[index];

    if (isEscaped(value, index)) {
      continue;
    }

    if (character === ")") {
      depth += 1;
      continue;
    }

    if (character === "(") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
};

const isEscaped = (value: string, index: number) => {
  let backslashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
};

const normalizeImageSource = (value: string) => {
  const source = value.trim();

  return source.startsWith("<") && source.endsWith(">")
    ? unescapeMarkdownText(source.slice(1, -1).trim())
    : unescapeMarkdownText(source);
};

const escapeImageAlt = (value: string) => value.replace(/[\\[\]]/gu, "\\$&");

const TITLE_ESCAPE_PATTERNS: Record<TitleMarker, RegExp> = {
  '"': /[\\"]/gu,
  "'": /[\\']/gu,
  "(": /[\\()]/gu,
};

const escapeImageTitle = (value: string, marker: TitleMarker) =>
  value.replace(TITLE_ESCAPE_PATTERNS[marker], "\\$&");

const serializeImageSource = (value: string) =>
  needsAngledImageSource(value) ? `<${value.replace(/[\\>]/gu, "\\$&")}>` : value;

const needsAngledImageSource = (value: string) => /[\s<>]/u.test(value);

const unescapeMarkdownText = (value: string) =>
  value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu, "$1");
