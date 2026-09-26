import {
  isPluralElement,
  isSelectElement,
  isTagElement,
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";

import SOURCE_MESSAGES from "@/locales/en.json";

export type MessageId = keyof typeof SOURCE_MESSAGES;
export type MessageSource = string | MessageFormatElement[];
export type MessageCatalog = Partial<Record<MessageId, MessageSource>>;

export const SOURCE_LOCALE = "en";
export const PSEUDO_LOCALE = "en-XA";

export { SOURCE_MESSAGES };

const PSEUDO_CHARACTERS: Record<string, string> = {
  a: "á",
  b: "ƀ",
  c: "ç",
  d: "ð",
  e: "é",
  f: "ƒ",
  g: "ĝ",
  h: "ĥ",
  i: "î",
  j: "ĵ",
  k: "ķ",
  l: "ļ",
  m: "ɱ",
  n: "ñ",
  o: "ö",
  p: "þ",
  q: "ǫ",
  r: "ŕ",
  s: "š",
  t: "ţ",
  u: "û",
  v: "ṽ",
  w: "ŵ",
  x: "ẋ",
  y: "ý",
  z: "ž",
  A: "Å",
  B: "Ɓ",
  C: "Ç",
  D: "Ð",
  E: "É",
  F: "Ƒ",
  G: "Ĝ",
  H: "Ĥ",
  I: "Î",
  J: "Ĵ",
  K: "Ķ",
  L: "Ļ",
  M: "Ṁ",
  N: "Ñ",
  O: "Ö",
  P: "Þ",
  Q: "Ǫ",
  R: "Ŕ",
  S: "Š",
  T: "Ţ",
  U: "Û",
  V: "Ṽ",
  W: "Ŵ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ž",
};

// Translations commonly run 30 to 40 percent longer than English UI text.
const PSEUDO_EXPANSION_RATIO = 0.4;

const accent = (text: string) =>
  Array.from(text, (character) => PSEUDO_CHARACTERS[character] ?? character).join("");

const accentElements = (elements: MessageFormatElement[]): MessageFormatElement[] =>
  elements.map((element) => {
    if (element.type === TYPE.literal) {
      return { ...element, value: accent(element.value) };
    }

    if (isPluralElement(element) || isSelectElement(element)) {
      return {
        ...element,
        options: Object.fromEntries(
          Object.entries(element.options).map(([key, option]) => [
            key,
            { ...option, value: accentElements(option.value) },
          ]),
        ),
      };
    }

    if (isTagElement(element)) {
      return { ...element, children: accentElements(element.children) };
    }

    return element;
  });

const literalLength = (elements: MessageFormatElement[]): number =>
  elements.reduce((length, element) => {
    if (element.type === TYPE.literal) {
      return length + element.value.length;
    }

    if (isPluralElement(element) || isSelectElement(element)) {
      return (
        length + Math.max(...Object.values(element.options).map((o) => literalLength(o.value)))
      );
    }

    return isTagElement(element) ? length + literalLength(element.children) : length + 4;
  }, 0);

export const createPseudoMessage = (source: string): MessageFormatElement[] => {
  const elements = parse(source);
  const padding = "·".repeat(Math.ceil(literalLength(elements) * PSEUDO_EXPANSION_RATIO));

  return [
    { type: TYPE.literal, value: "⟦" },
    ...accentElements(elements),
    { type: TYPE.literal, value: `${padding}⟧` },
  ];
};

export const createPseudoCatalog = (): MessageCatalog =>
  Object.fromEntries(
    Object.entries(SOURCE_MESSAGES).map(([id, source]) => [id, createPseudoMessage(source)]),
  );
