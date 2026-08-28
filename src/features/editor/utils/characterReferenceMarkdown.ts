import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { MarkdownNode, MarkSchema } from "@milkdown/kit/transformer";
import { decodeNamedCharacterReference } from "decode-named-character-reference";
import { decodeNumericCharacterReference } from "micromark-util-decode-numeric-character-reference";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

export const CHARACTER_REFERENCE_MARKDOWN_TYPE = "leafdownCharacterReference";
export const CHARACTER_REFERENCE_MARK_NAME = "leafdownCharacterReference";

const SOURCE_ATTRIBUTE_NAME = "source";
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

export const decodesTo = (source: string, text: string) => {
  const reference = readCharacterReference(source, 0);

  return reference !== null && reference.source === source && reference.decoded === text;
};

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
      [SOURCE_ATTRIBUTE_NAME]: span.source,
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
  attrs: { [SOURCE_ATTRIBUTE_NAME]: { default: "", validate: "string" } },
  parseDOM: [
    {
      tag: `span[${SOURCE_DOM_ATTRIBUTE_NAME}]`,
      getAttrs: (dom) => ({
        [SOURCE_ATTRIBUTE_NAME]: (dom as HTMLElement).getAttribute(SOURCE_DOM_ATTRIBUTE_NAME) ?? "",
      }),
    },
  ],
  toDOM: (mark) => [
    "span",
    { [SOURCE_DOM_ATTRIBUTE_NAME]: mark.attrs[SOURCE_ATTRIBUTE_NAME] as string },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === CHARACTER_REFERENCE_MARKDOWN_TYPE,
    runner: (state, node, markType) => {
      state.openMark(markType, {
        [SOURCE_ATTRIBUTE_NAME]: (node as { source?: unknown }).source ?? "",
      });
      state.next(node.children ?? []);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === CHARACTER_REFERENCE_MARK_NAME,
    runner: (state, mark) => {
      state.withMark(mark, CHARACTER_REFERENCE_MARKDOWN_TYPE, undefined, {
        [SOURCE_ATTRIBUTE_NAME]: mark.attrs[SOURCE_ATTRIBUTE_NAME] as string,
      });
    },
  },
};
