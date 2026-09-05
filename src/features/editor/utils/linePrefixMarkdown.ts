// The prefix a line is written behind, recorded where a file wrote one the containers do not
// spell. A block writes its lines with nothing in front of them and the containers add their
// prefix afterwards, so the line a record answers for is only identifiable once every handler has
// run: each record is marked in place and `resolveLinePrefixes` settles them in the assembled
// document. A paragraph and a setext heading record the lines their text spans, and a list item
// records the line its own marker opens.

// CommonMark replaces U+0000 with U+FFFD while parsing, so no block can carry one and the
// marker cannot collide with document content. A block separator spends `j` after it and a
// deferred escape spends ASCII punctuation, so neither reads as this one. The pair brackets the
// authored prefix, which leaves the run readable however the prefix is spelled.
const CONTINUATION_MARKER = "\u0000c";
// The prefix an item's own marker stood behind, which asks the same question of a line as a
// continuation record does and gives way on other terms, so it carries a token of its own.
const LIST_ITEM_MARKER = "\u0000i";
const LINE_PREFIX_MARKER_LENGTH = CONTINUATION_MARKER.length;
// What every marker opens with, which is what a scan for one a later pass owns reads.
const MARKER_LEAD = "\u0000";

const WHITESPACE_PATTERN = /[\t ]/u;
// What a container spells on the lines under the one it opens on, split into the parts a line has
// to match to stay inside it: a quote marker, and the indentation an item's content stands at.
// A run of indentation is one part because matching it is matching each item it stacks in turn.
const CONTAINER_PART_PATTERN = /[\t ]{0,3}>[\t ]?|[\t ]+/gu;
// CommonMark opens no leaf block four columns deep, and indented code cannot interrupt a
// paragraph, so a line the file indented that far carries no block marker whatever it spells.
const BLOCK_OPENING_INDENT = 4;
// CommonMark advances a tab to the next multiple of four columns, so a prefix holding one is as
// wide as where it lands rather than as long as it is spelled.
const TAB_STOP = 4;
const QUOTE_MARKER = ">";
// The block markers `state.safe` escapes at a line start that spell nothing else. An asterisk, an
// underscore, a backtick, or a tilde there could equally delimit a mark, and a bracket or an angle
// could open a link or raw HTML, so those stay with the passes that answer against the whole line.
const BLOCK_MARKERS = "#+-=>";
// A marker CommonMark reads at most nine digits ahead of, escaped on the delimiter rather than on
// the digits that lead it.
const ORDERED_MARKER_PATTERN = /^(\d{1,9})\\([.)])/u;

interface ContinuationLine {
  // Whether a block marker at the line's content could open the block it spells.
  opens: boolean;
  // Whether the containers the document holds now still take the prefix the file wrote.
  restorable: boolean;
}

const readIndent = (authored: string, from: number) => {
  let indent = 0;

  while (WHITESPACE_PATTERN.test(authored.charAt(from + indent))) {
    indent += 1;
  }

  return indent;
};

// How the prefix the file wrote stands against the one the containers spell. A tab counts as the
// single character it is rather than as the columns it advances, which can only leave the line
// measured shallower than the file wrote it, and a line measured shallow keeps its escapes.
const readContinuationLine = (written: string, authored: string): ContinuationLine => {
  let index = 0;
  let measured = true;

  for (const part of written.match(CONTAINER_PART_PATTERN) ?? []) {
    if (part.includes(">")) {
      let marker = index;

      while (marker - index < 3 && WHITESPACE_PATTERN.test(authored.charAt(marker))) {
        marker += 1;
      }

      // A quote the line does not spell closes every container inside it, so nothing further along
      // the line takes a column and what stands there is indentation the line carries.
      if (authored.charAt(marker) !== ">") {
        break;
      }

      index = marker + 1;

      if (WHITESPACE_PATTERN.test(authored.charAt(index))) {
        index += 1;
      }

      continue;
    }

    // A run of indentation stacks every item it covers into one part, so a line spelling only some
    // of it hides which of them still took their share and how many columns that left.
    if (readIndent(authored, index) < part.length) {
      measured = false;
      break;
    }

    index += part.length;
  }

  const indent = readIndent(authored, index);

  return {
    opens: !measured || indent < BLOCK_OPENING_INDENT,
    // A prefix spelling a container the document no longer holds would open one of its own, which
    // costs content rather than form. Anything the containers do not take has to be indentation.
    restorable: index + indent === authored.length,
  };
};

/// Measures a line prefix in the columns CommonMark reads it as. Exported for the list item
/// record, which is measured against the same tab stops.
export const readPrefixColumns = (prefix: string) => {
  let columns = 0;

  for (const character of prefix) {
    columns = character === "\t" ? columns + TAB_STOP - (columns % TAB_STOP) : columns + 1;
  }

  return columns;
};

// Where every quote marker the prefix spells stands. A container writes its marker at one column,
// so counting them is not enough: a record spelling as many as the containers do, at other columns,
// is a record that moves a quote out of the container holding it.
const readQuoteColumns = (prefix: string) => {
  const columns: number[] = [];
  let column = 0;

  for (const character of prefix) {
    if (character === QUOTE_MARKER) {
      columns.push(column);
    }

    column = character === "\t" ? column + TAB_STOP - (column % TAB_STOP) : column + 1;
  }

  return columns;
};

const holdsSameQuoteColumns = (written: string, authored: string) => {
  const columns = readQuoteColumns(written);
  const recorded = readQuoteColumns(authored);

  return (
    columns.length === recorded.length && columns.every((column, at) => column === recorded[at])
  );
};

// Whether the containers the document holds now still take the prefix an item's marker stood
// behind. Every quote marker has to stand where the containers write theirs, or the record opens a
// quote of its own or takes one out of the container holding it; and the marker has to land at or
// past the column the containers wrote and under four further, or the item leaves its container or
// opens indented code inside it. The columns are counted as CommonMark reads them, because a tab is
// the one spelling whose width is not its length and the whole point of the record is to write one
// back.
const takesListItemPrefix = (written: string, authored: string) => {
  if (!holdsSameQuoteColumns(written, authored)) {
    return false;
  }

  const indent = readPrefixColumns(authored) - readPrefixColumns(written);

  return indent >= 0 && indent < BLOCK_OPENING_INDENT;
};

const withoutBlockMarkerEscape = (content: string) => {
  if (content.charAt(0) === "\\" && BLOCK_MARKERS.includes(content.charAt(1))) {
    return content.slice(1);
  }

  return content.replace(ORDERED_MARKER_PATTERN, "$1$2");
};

// The next record on the line, whichever kind it is.
const findLinePrefixMarker = (line: string, from: number) => {
  const continuation = line.indexOf(CONTINUATION_MARKER, from);
  const item = line.indexOf(LIST_ITEM_MARKER, from);

  return continuation < 0 || item < 0 ? Math.max(continuation, item) : Math.min(continuation, item);
};

// What the containers wrote, split from the markers another pass left standing in it. Those are
// settled after this one, so they are carried past whatever takes that prefix's place.
const splitPassedMarkers = (written: string) => {
  let prefix = "";
  let passed = "";
  let read = 0;
  let lead = written.indexOf(MARKER_LEAD);

  while (lead >= 0) {
    prefix += written.slice(read, lead);
    passed += written.slice(lead, lead + LINE_PREFIX_MARKER_LENGTH);
    read = lead + LINE_PREFIX_MARKER_LENGTH;
    lead = written.indexOf(MARKER_LEAD, read);
  }

  return { passed, prefix: prefix + written.slice(read) };
};

// Every record a line carries, read from the outermost container inward. The prefix standing
// before a record is the one the containers spell up to that point, so each record is measured
// against the one before it took its place: an item nested inside another stands past the prefix
// that item is written back at rather than past the one the serializer gave it.
const resolveLinePrefix = (line: string) => {
  let prefix = "";
  let passed = "";
  let index = 0;
  let relaxed = false;
  let open = findLinePrefixMarker(line, index);

  while (open >= 0) {
    const marker = line.slice(open, open + LINE_PREFIX_MARKER_LENGTH);
    const close = line.indexOf(marker, open + LINE_PREFIX_MARKER_LENGTH);
    const written = splitPassedMarkers(line.slice(index, open));

    prefix += written.prefix;
    passed += written.passed;
    index = open + LINE_PREFIX_MARKER_LENGTH;

    // A marker the closing one never followed stands for no prefix, which leaves the line as the
    // containers wrote it.
    if (close >= 0) {
      const authored = line.slice(index, close);

      index = close + LINE_PREFIX_MARKER_LENGTH;

      if (marker === CONTINUATION_MARKER) {
        const continuation = readContinuationLine(prefix, authored);

        relaxed = continuation.restorable && !continuation.opens;

        if (continuation.restorable) {
          prefix = authored;
        }
      } else {
        relaxed = false;

        if (takesListItemPrefix(prefix, authored)) {
          prefix = authored;
        }
      }
    }

    open = findLinePrefixMarker(line, index);
  }

  const content = line.slice(index);

  return prefix + passed + (relaxed ? withoutBlockMarkerEscape(content) : content);
};

/// Puts each marked line behind the prefix the file wrote it with. A container writes its own
/// prefix onto every line it holds, so the prefix standing before a marker is the one the
/// containers spell and the authored one takes its place. The escapes go back with it: `state.safe`
/// escapes a block marker wherever a line could open one, and a line the file indented four columns
/// past its containers opens none. The document is read once, a line at a time, because a paragraph
/// the file hard-wrapped carries a marker on every line it holds and a nested item carries one on
/// every line of its own.
export const resolveLinePrefixes = (document: string) =>
  document.includes(CONTINUATION_MARKER) || document.includes(LIST_ITEM_MARKER)
    ? document.split("\n").map(resolveLinePrefix).join("\n")
    : document;

/// Drops the record a value opens with, for content another item's marker already stands on. A
/// record answers for the prefix a marker opens its own line behind, and an item written on the
/// line its container's marker opens has none: what stands before it there is that marker, which
/// the resolver would otherwise take for prefix and write the record over.
export const withoutLeadingLinePrefix = (value: string) => {
  const marker = value.slice(0, LINE_PREFIX_MARKER_LENGTH);

  if (marker !== CONTINUATION_MARKER && marker !== LIST_ITEM_MARKER) {
    return value;
  }

  const close = value.indexOf(marker, LINE_PREFIX_MARKER_LENGTH);
  const line = value.indexOf("\n");

  return close < 0 || (line >= 0 && close > line)
    ? value
    : value.slice(close + LINE_PREFIX_MARKER_LENGTH);
};

/// Marks the line an item's marker opens and every line the item writes under it. The prefix the
/// containers spell is what the record replaces, so the marker stands after the item's own
/// indentation rather than at the head of the line: an item nested inside this one is measured
/// against the column this record puts its content at.
export const markListItemPrefix = (prefix: string) =>
  prefix === "" ? "" : LIST_ITEM_MARKER + prefix + LIST_ITEM_MARKER;

/// Reads a value as the block wrote it. A record stands in place of a prefix the containers add
/// afterwards, so a pass reading a written line to decide what it opens has to see the line
/// without one.
export const withoutLinePrefixMarkers = (value: string) => {
  let written = "";
  let read = 0;
  let open = findLinePrefixMarker(value, read);

  while (open >= 0) {
    const marker = value.slice(open, open + LINE_PREFIX_MARKER_LENGTH);
    const close = value.indexOf(marker, open + LINE_PREFIX_MARKER_LENGTH);

    written += value.slice(read, open);
    read = (close < 0 ? open : close) + LINE_PREFIX_MARKER_LENGTH;
    open = findLinePrefixMarker(value, read);
  }

  return written + value.slice(read);
};

/// Marks each line a record answers for. A block writes its lines with nothing in front of them and
/// the containers holding it add their prefix afterwards, so the line a record answers for is only
/// identifiable once every handler has run; `resolveLinePrefixes` puts the authored prefix in place
/// of the one the containers wrote. A line the record does not reach keeps that prefix, which is
/// what answers for a block the editor has since added a line to.
export const markContinuationLines = (value: string, continuations: readonly string[]) => {
  if (continuations.length === 0) {
    return value;
  }

  return value
    .split("\n")
    .map((line, index) => {
      const authored = index === 0 ? undefined : continuations[index - 1];

      return authored === undefined || line === ""
        ? line
        : CONTINUATION_MARKER + authored + CONTINUATION_MARKER + line;
    })
    .join("\n");
};
