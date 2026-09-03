export const TITLE_MARKER_ATTRIBUTE_NAME = "titleMarker";

export type TitleMarker = '"' | "'" | "(";

type QuoteMarker = Exclude<TitleMarker, "(">;

const TITLE_MARKERS: readonly unknown[] = ['"', "'", "("];

export const TITLE_MARKER_PAIRS: Record<TitleMarker, readonly [string, string]> = {
  '"': ['"', '"'],
  "'": ["'", "'"],
  "(": ["(", ")"],
};

const isTitleMarker = (value: unknown): value is TitleMarker => TITLE_MARKERS.includes(value);

// A marker holds a title only where the text needs no escape to sit inside it. A parenthesized
// title gives up on a parenthesis of either direction, because CommonMark reads the title as a run
// between matching parentheses and records no depth for a nested pair.
const holdsTitle = (title: string, marker: TitleMarker) => {
  switch (marker) {
    case '"':
      return !title.includes('"');

    case "'":
      return !title.includes("'");

    default:
      return !/[()]/u.test(title);
  }
};

// A node that names no marker is one whose title reached it without a tail to read, such as a
// reference link carrying its title from a definition. It writes the double quote, which is what a
// title with no form of its own has always been written with.
export const readTitleMarker = (node: object): TitleMarker => {
  const marker = (node as { titleMarker?: unknown }).titleMarker;

  return isTitleMarker(marker) ? marker : '"';
};

// The marker a title will be written with: the one it was authored with, read from the source the
// node was built from, and the double quote for a title whose source names none. Where a node holds
// a title, the last character before whatever the form writes after it is that title's closing
// marker, so the form is named without matching the text back to the source. A link and an image
// close with `)`; a definition ends at the title itself, which is what an empty `trailing` names. A
// reference link carries its title from a definition rather than from a tail, which is why the
// fallback is the marker the serializer would have chosen anyway rather than an absent one.
export const findTitleMarker = (raw: string, trailing = ")"): TitleMarker => {
  if (!raw.endsWith(trailing)) {
    return '"';
  }

  let index = raw.length - trailing.length - 1;

  while (index >= 0 && /\s/u.test(raw[index])) {
    index -= 1;
  }

  const closing = raw[index];

  if (closing === '"' || closing === "'") {
    return closing;
  }

  return closing === ")" ? "(" : '"';
};

// The authored marker, which a quote keeps whatever the title holds, because the escapes that
// takes are the ones the author already wrote. Only a parenthesized title gives way, and only to a
// quote that holds the text bare: writing it would need parentheses escaped inside a run CommonMark
// reads between matching ones, which is a rewrite either way.
export const chooseTitleMarker = (title: string, authored: TitleMarker): TitleMarker => {
  if (authored !== "(" || holdsTitle(title, "(")) {
    return authored;
  }

  return holdsTitle(title, '"') ? '"' : "'";
};

const findUnescapedIndex = (value: string, character: string, end: number) => {
  for (let index = end; index >= 0; index -= 1) {
    if (value[index] !== character) {
      continue;
    }

    let backslashes = 0;

    while (index - backslashes > 0 && value[index - backslashes - 1] === "\\") {
      backslashes += 1;
    }

    if (backslashes % 2 === 0) {
      return index;
    }
  }

  return -1;
};

// A quote cannot close a parenthesized title, so the escape the handler wrote for the marker it
// was given comes back off. A run of backslashes of even length leaves the quote unescaped and is
// the author's own, which is why only an odd run gives one up.
const unescapeQuote = (value: string, quote: string) =>
  value.replace(new RegExp(`\\\\+${quote}`, "gu"), (match) =>
    match.length % 2 === 0 ? `${match.slice(0, -2)}${quote}` : match,
  );

// `mdast-util-to-markdown` writes a title with `options.quote`, whose `checkQuote` throws for
// anything but the two quotes, so the parenthesized form is reached by swapping the pair the
// handler wrote. The run between the markers is the text the handler escaped for a title, which a
// parenthesized title carries unchanged apart from that marker's own escape. A link and an image
// both close with `)`, which locates that marker from the end.
const TITLE_TRAILING = ")";

const withParenthesizedTitle = (value: string, quote: string) => {
  const closing = value.length - TITLE_TRAILING.length - 1;

  if (!value.endsWith(TITLE_TRAILING) || value[closing] !== quote) {
    return value;
  }

  const opening = findUnescapedIndex(value, quote, closing - 1);

  if (opening < 0) {
    return value;
  }

  const title = unescapeQuote(value.slice(opening + 1, closing), quote);

  return `${value.slice(0, opening)}(${title})${value.slice(closing + 1)}`;
};

const pickQuote = (title: string): QuoteMarker => (title.includes('"') ? "'" : '"');

interface TitleOptions {
  quote?: QuoteMarker | null | undefined;
}

// Writes a node's title in the form it was authored in, by putting the marker the handler reads
// into its options and rewriting the pair it wrote where that marker is a parenthesis.
export const withAuthoredTitle = (
  node: { title?: string | null },
  options: TitleOptions,
  write: () => string,
) => {
  const title = node.title;

  if (!title) {
    return write();
  }

  const marker = chooseTitleMarker(title, readTitleMarker(node));
  const quote = marker === "(" ? pickQuote(title) : marker;
  const enclosing = options.quote;

  options.quote = quote;

  try {
    const value = write();

    return marker === "(" ? withParenthesizedTitle(value, quote) : value;
  } finally {
    options.quote = enclosing;
  }
};
