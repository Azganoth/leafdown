import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { MarkdownNode, MarkSchema, NodeSchema } from "@milkdown/kit/transformer";
import { decodeNamedCharacterReference } from "decode-named-character-reference";
import { decodeNumericCharacterReference } from "micromark-util-decode-numeric-character-reference";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

export const CHARACTER_REFERENCE_MARKDOWN_TYPE = "leafdownCharacterReference";
export const CHARACTER_REFERENCE_MARK_NAME = "leafdownCharacterReference";
// A link and an image both carry the destination the author wrote where it differs from the one
// the parser decoded, so the mark and the node name it the same way.
export const AUTHORED_URL_ATTRIBUTE_NAME = "authoredUrl";

export const CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME = "source";
const SOURCE_DOM_ATTRIBUTE_NAME = "data-character-reference";

// micromark bounds a reference at 31 alphanumeric characters, 7 decimal digits, or 6 hexadecimal
// digits, and asks the same table for a name, so these agree with the parser that reads the file
// back rather than with a second reading of the grammar.
const NAMED_REFERENCE_PATTERN = /^&([A-Za-z0-9]{1,31});/u;
const DECIMAL_REFERENCE_PATTERN = /^&#(\d{1,7});/u;
const HEXADECIMAL_REFERENCE_PATTERN = /^&#[Xx]([\dA-Fa-f]{1,6});/u;
// The longest reference is `&CounterClockwiseContourIntegral;`.
const REFERENCE_LENGTH_MAX = 33;
// A backslash escapes ASCII punctuation and nothing else, so a backslash before ordinary text is
// itself the character.
const ESCAPABLE_PATTERN = /[!-/:-@[-`{-~]/u;

interface DecodedReference {
  decoded: string;
  source: string;
}

const readCharacterReference = (source: string, index: number): DecodedReference | null => {
  const tail = source.slice(index, index + REFERENCE_LENGTH_MAX);
  const named = NAMED_REFERENCE_PATTERN.exec(tail);

  if (named) {
    const decoded = decodeNamedCharacterReference(named[1]);

    if (decoded !== false) {
      return { decoded, source: named[0] };
    }
  }

  const decimal = DECIMAL_REFERENCE_PATTERN.exec(tail);

  if (decimal) {
    return { decoded: decodeNumericCharacterReference(decimal[1], 10), source: decimal[0] };
  }

  const hexadecimal = HEXADECIMAL_REFERENCE_PATTERN.exec(tail);

  return hexadecimal
    ? { decoded: decodeNumericCharacterReference(hexadecimal[1], 16), source: hexadecimal[0] }
    : null;
};

// The text the whole string spells as one reference, or null where it spells anything else. A
// reference with a tail, a truncated one, and a name the table does not hold all read as null.
export const decodeWholeCharacterReference = (source: string) => {
  const reference = readCharacterReference(source, 0);

  return reference !== null && reference.source === source ? reference.decoded : null;
};

export const decodesTo = (source: string, text: string) =>
  decodeWholeCharacterReference(source) === text;

export interface ReferenceSpan {
  end: number;
  source: string;
  start: number;
}

// Walks the authored source against the value the parser produced from it. The two run together
// except where the source spends more characters than the value keeps, which is an escape or a
// character reference; anything else means the value was not built from this slice, and the caller
// falls back to holding no reference at all rather than to a guess.
export const findCharacterReferences = (source: string, value: string): ReferenceSpan[] | null => {
  const spans: ReferenceSpan[] = [];
  let sourceIndex = 0;
  let valueIndex = 0;

  while (sourceIndex < source.length || valueIndex < value.length) {
    const character = source[sourceIndex];

    if (character === "&") {
      const reference = readCharacterReference(source, sourceIndex);

      if (reference && value.startsWith(reference.decoded, valueIndex)) {
        spans.push({
          start: valueIndex,
          end: valueIndex + reference.decoded.length,
          source: reference.source,
        });
        sourceIndex += reference.source.length;
        valueIndex += reference.decoded.length;
        continue;
      }
    }

    if (character === "\\" && ESCAPABLE_PATTERN.test(source[sourceIndex + 1] ?? "")) {
      if (value[valueIndex] !== source[sourceIndex + 1]) {
        return null;
      }

      sourceIndex += 2;
      valueIndex += 1;
      continue;
    }

    if (character === undefined || character !== value[valueIndex]) {
      return null;
    }

    sourceIndex += 1;
    valueIndex += 1;
  }

  return spans;
};

const DESTINATION_WHITESPACE_PATTERN = /[\t\n\f\r ]/u;

// The label of a complete link or image is bracket-balanced, so its own brackets and a nested
// image cannot end it early. Only the tail that follows an inline `](` holds a destination; a
// reference form carries none and is left to the issue that owns it.
const findDestinationSource = (raw: string): string | null => {
  const open = raw.startsWith("!") ? 1 : 0;

  if (raw[open] !== "[") {
    return null;
  }

  let depth = 0;
  let index = open;

  for (; index < raw.length; index += 1) {
    const character = raw[index];

    if (character === "\\") {
      index += 1;
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;

      if (depth === 0) {
        break;
      }
    }
  }

  if (raw[index] !== "]" || raw[index + 1] !== "(") {
    return null;
  }

  let start = index + 2;

  while (start < raw.length && DESTINATION_WHITESPACE_PATTERN.test(raw[start] ?? "")) {
    start += 1;
  }

  if (raw[start] === "<") {
    const close = raw.indexOf(">", start + 1);

    return close < 0 ? null : raw.slice(start + 1, close);
  }

  let depthInDestination = 0;
  let end = start;

  while (end < raw.length) {
    const character = raw[end];

    if (character === "\\") {
      end += 1;
    } else if (character === "(") {
      depthInDestination += 1;
    } else if (character === ")") {
      if (depthInDestination === 0) {
        break;
      }

      depthInDestination -= 1;
    } else if (DESTINATION_WHITESPACE_PATTERN.test(character ?? "")) {
      break;
    }

    end += 1;
  }

  return raw.slice(start, end);
};

const resolveEscapes = (value: string) => {
  let resolved = "";

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && ESCAPABLE_PATTERN.test(value[index + 1] ?? "")) {
      index += 1;
    }

    resolved += value[index];
  }

  return resolved;
};

export const decodeCharacterReferences = (value: string) => {
  let decoded = "";

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "&") {
      const reference = readCharacterReference(value, index);

      if (reference) {
        decoded += reference.decoded;
        index += reference.source.length - 1;
        continue;
      }
    }

    decoded += value[index];
  }

  return decoded;
};

// The distinct references the value spells out. An ampersand that names nothing, never closes, or
// overruns its digit budget starts none of them and is ordinary text wherever it sits.
export const findCharacterReferenceSources = (value: string) => {
  const sources = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "&") {
      continue;
    }

    const reference = readCharacterReference(value, index);

    if (reference) {
      sources.add(reference.source);
    }
  }

  return sources;
};

// The authored destination with its escapes resolved and its references left standing, or null
// where the two forms already agree. Resolving the escapes keeps destination escaping owned by the
// issues that settled it, so this carries the reference difference and nothing else.
export const findAuthoredDestination = (raw: string, url: string): string | null => {
  const destination = findDestinationSource(raw);

  if (destination === null) {
    return null;
  }

  const withoutEscapes = resolveEscapes(destination);

  return withoutEscapes !== url && decodeCharacterReferences(withoutEscapes) === url
    ? withoutEscapes
    : null;
};

export const readAuthoredUrl = (node: object) => {
  const authored = (node as { authoredUrl?: unknown }).authoredUrl;

  return typeof authored === "string" ? authored : null;
};

const omitAuthoredUrl = (attributes: Record<string, unknown>) => {
  const rendered = { ...attributes };

  delete rendered[AUTHORED_URL_ATTRIBUTE_NAME];

  return rendered;
};

// An image is a node rather than a mark, so its destination form travels in a node attribute. The
// rendered `img` does not carry it and no parse rule reads it back, which leaves a copy through the
// DOM holding the decoded destination — the same fallback an edit inside a reference takes.
export const withAuthoredDestination = (schema: NodeSchema): NodeSchema => {
  const { toDOM } = schema;

  return {
    ...schema,
    attrs: {
      ...schema.attrs,
      [AUTHORED_URL_ATTRIBUTE_NAME]: { default: null, validate: "string|null" },
    },
    toDOM:
      toDOM &&
      ((node) => {
        const [tag, attributes, ...rest] = toDOM(node) as [
          string,
          Record<string, unknown>,
          ...unknown[],
        ];

        return [tag, omitAuthoredUrl(attributes), ...rest];
      }),
    parseMarkdown: {
      ...schema.parseMarkdown,
      runner: (state, node, type) => {
        state.addNode(type, {
          src: node.url,
          alt: (node as { alt?: unknown }).alt,
          title: node.title,
          [AUTHORED_URL_ATTRIBUTE_NAME]: readAuthoredUrl(node),
        });
      },
    },
    toMarkdown: {
      ...schema.toMarkdown,
      runner: (state, node) => {
        state.addNode("image", undefined, undefined, {
          title: node.attrs.title,
          url: node.attrs.src,
          alt: node.attrs.alt,
          [AUTHORED_URL_ATTRIBUTE_NAME]: node.attrs[AUTHORED_URL_ATTRIBUTE_NAME],
        });
      },
    },
  };
};

// Splits one text node into the runs a reference covers and the runs it does not, so the parser
// can hang a mark on the first kind. Returns null where nothing needs splitting.
export const splitCharacterReferences = (value: string, source: string): MarkdownNode[] | null => {
  const spans = findCharacterReferences(source, value);

  if (!spans || spans.length === 0) {
    return null;
  }

  const children: MarkdownNode[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      children.push({ type: "text", value: value.slice(cursor, span.start) });
    }

    children.push({
      type: CHARACTER_REFERENCE_MARKDOWN_TYPE,
      [CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME]: span.source,
      children: [{ type: "text", value: value.slice(span.start, span.end) }],
    } as unknown as MarkdownNode);
    cursor = span.end;
  }

  if (cursor < value.length) {
    children.push({ type: "text", value: value.slice(cursor) });
  }

  return children;
};

export const readCharacterReferenceText = (node: { children?: readonly MarkdownNode[] }) =>
  (node.children ?? []).map((child) => (child as { value?: string }).value ?? "").join("");

// The stored source is written only where it still spells the text it marks. An edit inside the
// range leaves the two disagreeing, and the run falls back to the character the document holds.
export const serializeCharacterReference: NonNullable<RemarkStringifyHandlers["text"]> = (
  node: MarkdownNode,
  parent,
  state,
  info,
) => {
  const source = (node as { source?: unknown }).source;
  const text = readCharacterReferenceText(node);

  return typeof source === "string" && decodesTo(source, text)
    ? source
    : state.containerPhrasing(node as Parameters<typeof state.containerPhrasing>[0], info);
};

export const characterReferenceMarkSchema: MarkSchema = {
  inclusive: false,
  attrs: { [CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME]: { default: "", validate: "string" } },
  parseDOM: [
    {
      tag: `span[${SOURCE_DOM_ATTRIBUTE_NAME}]`,
      getAttrs: (dom) => ({
        [CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME]:
          (dom as HTMLElement).getAttribute(SOURCE_DOM_ATTRIBUTE_NAME) ?? "",
      }),
    },
  ],
  toDOM: (mark) => [
    "span",
    {
      [SOURCE_DOM_ATTRIBUTE_NAME]: mark.attrs[CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME] as string,
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === CHARACTER_REFERENCE_MARKDOWN_TYPE,
    runner: (state, node, markType) => {
      state.openMark(markType, {
        [CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME]: (node as { source?: unknown }).source ?? "",
      });
      state.next(node.children ?? []);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === CHARACTER_REFERENCE_MARK_NAME,
    runner: (state, mark) => {
      state.withMark(mark, CHARACTER_REFERENCE_MARKDOWN_TYPE, undefined, {
        [CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME]: mark.attrs[
          CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME
        ] as string,
      });
    },
  },
};
