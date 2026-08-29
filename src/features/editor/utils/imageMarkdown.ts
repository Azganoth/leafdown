import { chooseTitleMarker, TITLE_MARKER_PAIRS, type TitleMarker } from "./markdownTitle";
import { normalizeReferenceLabel, type ReferenceType } from "./referenceLinkMarkdown";

export interface ImageMarkdownAttrs {
  alt: string;
  referenceLabel: string;
  referenceType: ReferenceType | null;
  src: string;
  title: string;
  titleMarker: TitleMarker;
}

export interface ImageDefinition {
  src: string;
  title: string;
  titleMarker: TitleMarker;
}

export type ImageDefinitionResolver = (label: string) => ImageDefinition | null;

// The reference forms collapse to the full one where the alt text no longer spells the label, which
// is the rule the serializer applies to the node itself.
const serializeImageReference = (alt: string, label: string, referenceType: ReferenceType) => {
  const serializedAlt = escapeImageAlt(alt);

  if (referenceType === "full" || alt !== label) {
    return `![${serializedAlt}][${label}]`;
  }

  return referenceType === "shortcut" ? `![${serializedAlt}]` : `![${serializedAlt}][]`;
};

export const serializeImageMarkdown = ({
  alt,
  referenceLabel,
  referenceType,
  src,
  title,
  titleMarker,
}: ImageMarkdownAttrs) => {
  if (referenceType) {
    return serializeImageReference(alt, referenceLabel, referenceType);
  }

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

export const parseImageMarkdown = (
  value: string,
  resolveDefinition: ImageDefinitionResolver = () => null,
): ImageMarkdownAttrs | null => {
  const source = value.trim();

  if (!source.startsWith("![")) {
    return null;
  }

  const altEnd = findClosingBracket(source, 2);

  if (altEnd === -1) {
    return null;
  }

  const alt = unescapeMarkdownText(source.slice(2, altEnd));
  const tail = source.slice(altEnd + 1);

  if (tail.startsWith("(") && source.endsWith(")")) {
    return {
      alt,
      referenceLabel: "",
      referenceType: null,
      ...parseImageBody(source.slice(altEnd + 2, -1)),
    };
  }

  return parseImageReference(alt, tail, resolveDefinition);
};

// A reference names a destination its definition holds, so a label that resolves to nothing is not
// an image and leaves the node as it was.
const parseImageReference = (
  alt: string,
  tail: string,
  resolveDefinition: ImageDefinitionResolver,
): ImageMarkdownAttrs | null => {
  const reference = readImageReferenceTail(alt, tail);
  const definition = reference && resolveDefinition(normalizeReferenceLabel(reference.label));

  return definition
    ? {
        alt,
        referenceLabel: reference.label,
        referenceType: reference.referenceType,
        ...definition,
      }
    : null;
};

// The tail is whatever follows the label's closing bracket: nothing for a shortcut reference, an
// empty pair for a collapsed one, and the label itself for a full one.
const readImageReferenceTail = (alt: string, tail: string) => {
  if (tail === "") {
    return { label: alt, referenceType: "shortcut" } as const;
  }

  if (tail === "[]") {
    return { label: alt, referenceType: "collapsed" } as const;
  }

  if (!tail.startsWith("[") || !tail.endsWith("]")) {
    return null;
  }

  const label = tail.slice(1, -1);

  return label && !label.includes("]") ? ({ label, referenceType: "full" } as const) : null;
};

const parseImageBody = (
  body: string,
): Omit<ImageMarkdownAttrs, "alt" | "referenceLabel" | "referenceType"> => {
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
