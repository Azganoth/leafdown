import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { MarkSchema, NodeSchema } from "@milkdown/kit/transformer";
import { defaultHandlers } from "mdast-util-to-markdown";

import {
  BLOCK_ADJACENT_ATTRIBUTE_NAME,
  DEFAULT_BLOCK_ADJACENT,
  readBlockAdjacent,
} from "./blockSeparatorMarkdown";
import { markVerbatimLines } from "./linePrefixMarkdown";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["code"]>>[2];

type StringifyParent = Parameters<NonNullable<RemarkStringifyHandlers["code"]>>[1];

type JoinArguments = Parameters<StringifyState["join"][number]>;

// Milkdown types a stringify handler's node as `any`, so the block is named here from the blocks
// the serializer joins.
type CodeNode = Extract<JoinArguments[0], { type: "code" }>;

export const CODE_MARKDOWN_TYPE = "code";
export const CODE_SPAN_MARKDOWN_TYPE = "inlineCode";
export const CODE_FENCED_ATTRIBUTE_NAME = "fenced";
export const CODE_FENCE_ATTRIBUTE_NAME = "fence";
export const CODE_FENCE_SURPLUS_ATTRIBUTE_NAME = "fenceSurplus";
export const CODE_SEPARATOR_ATTRIBUTE_NAME = "codeSeparator";
export const CODE_INDENT_ATTRIBUTE_NAME = "codeIndent";
export const CODE_LINE_PREFIXES_ATTRIBUTE_NAME = "codeLinePrefixes";
export const CODE_CLOSED_ATTRIBUTE_NAME = "closed";
export const CODE_SPAN_RUN_SURPLUS_ATTRIBUTE_NAME = "runSurplus";

export type CodeFence = "`" | "~";

// The form a block is written in when it has none of its own: one the editor created, and one
// whose authored form cannot be recovered. A fence is the form that carries every block, because
// it is the only one an info string can be written on; backticks no longer than the content needs,
// opened directly onto that info string, at column zero, and closed.
export const DEFAULT_CODE_FENCED = true;
export const DEFAULT_CODE_FENCE: CodeFence = "`";
export const DEFAULT_CODE_FENCE_LENGTH = 3;
export const DEFAULT_CODE_FENCE_SURPLUS = 0;
export const DEFAULT_CODE_SEPARATOR = "";
export const DEFAULT_CODE_INDENT = 0;
// The lines an indented block carries when it holds no record of them: one the editor created,
// and one whose authored lines cannot be recovered. Each is then written behind the four spaces
// that open the form.
export const DEFAULT_CODE_LINE_PREFIXES: readonly string[] = [];
export const DEFAULT_CODE_CLOSED = true;
// A span the editor created is delimited by the shortest run its content leaves free, the way one
// whose authored run cannot be recovered is.
export const DEFAULT_CODE_SPAN_RUN_SURPLUS = 0;

// Four spaces open indented code instead, so three is the widest a fence can be indented by.
const CODE_INDENT_MAX = 3;

// What the preset's indented branch writes every non-blank line behind, which is the run a
// record stands in place of and the one a withdrawn record leaves standing.
const INDENTED_CODE_PREFIX = "    ";
// Everything a record may stand for: the quote markers the containers spell and the whitespace
// around them. A prefix reaching any other character has taken in a marker another container
// owns, which the record would write back over the one the document now holds. A quote is safe
// because the resolver compares where each one stands, and no other marker is compared at all.
const CODE_LINE_PREFIX_PATTERN = /^(?:[\t ]*>)*[\t ]*$/u;
// CommonMark ends a line on a carriage return, a line feed, or the pair.
const LINE_ENDING_PATTERN = /\r\n|[\n\r]/u;

// A fence opens on three or more of one character. Indented code opens on the four spaces that
// make it, so a slice standing on a run of either character was written as a fence.
const CODE_FENCE_PATTERN = /^(?:`{3,}|~{3,})/u;
// The opening run, the spacing after it, and whether an info string follows that spacing. The
// spacing is the separator only where something follows it; a run closing its line carries
// line-final whitespace, which is not the block's to write.
const CODE_FENCE_HEAD_PATTERN = /^(`{3,}|~{3,})([\t ]*)(\S)?/u;
// A closing fence carries its run and nothing else. Only the prefix a container wrote and the
// block's own indentation stand before it, and neither says anything the run does not.
const CODE_FENCE_CLOSING_PATTERN = /^[\t >]*(`{3,}|~{3,})[\t ]*$/u;
// The run the handler wrote, which the recorded surplus is added to rather than replacing.
const WRITTEN_CODE_FENCE_PATTERN = /^(`+|~+)/u;

const CODE_SEPARATOR_PATTERN = /^[\t ]*$/u;

export interface AuthoredCodeForm {
  fenced: boolean;
  fence: CodeFence;
  fenceSurplus: number;
  separator: string;
  indent: number;
  closed: boolean;
}

const INDENTED_CODE_FORM: AuthoredCodeForm = {
  fenced: false,
  fence: DEFAULT_CODE_FENCE,
  fenceSurplus: DEFAULT_CODE_FENCE_SURPLUS,
  separator: DEFAULT_CODE_SEPARATOR,
  indent: DEFAULT_CODE_INDENT,
  closed: DEFAULT_CODE_CLOSED,
};

export const readCodeFenced = (source: object): boolean =>
  (source as Record<string, unknown>)[CODE_FENCED_ATTRIBUTE_NAME] !== false;

export const readCodeFence = (source: object): CodeFence => {
  const fence = (source as Record<string, unknown>)[CODE_FENCE_ATTRIBUTE_NAME];

  return fence === "`" || fence === "~" ? fence : DEFAULT_CODE_FENCE;
};

export const readCodeFenceSurplus = (source: object): number => {
  const surplus = (source as Record<string, unknown>)[CODE_FENCE_SURPLUS_ATTRIBUTE_NAME];

  return typeof surplus === "number" && Number.isInteger(surplus) && surplus > 0
    ? surplus
    : DEFAULT_CODE_FENCE_SURPLUS;
};

// The longest run of the fence's own character the content holds, which is what a fence has to
// outrun to hold it.
const findLongestRun = (value: string, fence: CodeFence) => {
  let longest = 0;
  let current = 0;

  for (const character of value) {
    current = character === fence ? current + 1 : 0;
    longest = Math.max(longest, current);
  }

  return longest;
};

// The shortest run that can hold the content, which is the length the serializer arrives at on its
// own and the floor the authored length is measured against.
const findRequiredFenceLength = (value: string, fence: CodeFence) =>
  Math.max(findLongestRun(value, fence) + 1, DEFAULT_CODE_FENCE_LENGTH);

export const readCodeSeparator = (source: object): string => {
  const separator = (source as Record<string, unknown>)[CODE_SEPARATOR_ATTRIBUTE_NAME];

  return typeof separator === "string" && CODE_SEPARATOR_PATTERN.test(separator)
    ? separator
    : DEFAULT_CODE_SEPARATOR;
};

export const readCodeIndent = (source: object): number => {
  const indent = (source as Record<string, unknown>)[CODE_INDENT_ATTRIBUTE_NAME];

  return typeof indent === "number" && Number.isInteger(indent) && indent > 0
    ? Math.min(indent, CODE_INDENT_MAX)
    : DEFAULT_CODE_INDENT;
};

export const validateCodeLinePrefixes = (value: unknown) => {
  if (!Array.isArray(value) || value.some((line) => typeof line !== "string")) {
    throw new RangeError("Expected a line prefix for each of an indented block's lines");
  }
};

export const readCodeLinePrefixes = (source: object): string[] => {
  const recorded = (source as Record<string, unknown>)[CODE_LINE_PREFIXES_ATTRIBUTE_NAME];

  return Array.isArray(recorded) && recorded.every((line) => typeof line === "string")
    ? [...recorded]
    : [...DEFAULT_CODE_LINE_PREFIXES];
};

/// Reads what each line of an indented block stood behind in the file. The prefix ends where the
/// line's own content begins, which the value the parse kept is what names: a whitespace run before
/// it is the block's indentation, and one the parse left in the value is content the block holds.
/// The slice a block was built from opens at its own indentation rather than at the head of the
/// line, so the prefix the containers wrote before it is only on the first line and is passed in.
/// Exported for colocated tests.
export const findCodeLinePrefixes = (raw: string, value: string, opening: string): string[] => {
  const lines = raw.split(LINE_ENDING_PATTERN);
  const content = value.split(LINE_ENDING_PATTERN);

  if (lines.length !== content.length) {
    return [...DEFAULT_CODE_LINE_PREFIXES];
  }

  return lines.map((line, index) => {
    const text = content[index] ?? "";

    // A parse expands a tab against the tab stops rather than recording it, so a run covering the
    // column the content stands at leaves the line spelling characters the value does not hold.
    // Such a line keeps no record: the run reaches past the block's indentation into what the block
    // holds as content, and restoring it would move the column that content stands at.
    if (!line.endsWith(text)) {
      return "";
    }

    const prefix = (index === 0 ? opening : "") + line.slice(0, line.length - text.length);

    // A prefix spelled in spaces is one the canonical run already reproduces, character for
    // character, so recording it would only make the same line answer for two spellings of itself.
    // A tab is the one spelling whose width is not its length, and the only one worth a record.
    return prefix.includes("\t") && CODE_LINE_PREFIX_PATTERN.test(prefix) ? prefix : "";
  });
};

export const readCodeClosed = (source: object): boolean =>
  (source as Record<string, unknown>)[CODE_CLOSED_ATTRIBUTE_NAME] !== false;

// A fence's slice opens at the fence itself, past whatever indentation the file gave it, so the
// indentation is read off the column instead. Only at the document root is that column the
// indentation alone. Inside a container it also counts the prefix the container wrote, and mdast
// names neither separately: the two cannot be told apart from the block's own lines either,
// because a footnote definition writes a label on the line the block opens on and indents the
// lines under it by four, so the difference between them reads as indentation the file never
// wrote and would be written into the content. A block inside a container therefore keeps no
// indentation of its own, which costs bytes rather than content.
const findFenceIndent = (column: number, atRoot: boolean) =>
  atRoot ? Math.min(Math.max(column - 1, 0), CODE_INDENT_MAX) : DEFAULT_CODE_INDENT;

// A fence the file never closed runs to the end of the block, so the slice ends on content rather
// than on a run of its own. A run shorter than the one that opened the block closes nothing, which
// is what keeps a fence written inside the content from reading as the end of it.
const findFenceClosed = (raw: string, fence: string, length: number) => {
  const lines = raw.split("\n");

  if (lines.length < 2) {
    return false;
  }

  const closing = CODE_FENCE_CLOSING_PATTERN.exec(lines[lines.length - 1] ?? "");

  return closing !== null && closing[1].charAt(0) === fence && closing[1].length >= length;
};

export interface CodeFormSource {
  // The slice of the file the node was built from.
  raw: string;
  // The value the parse kept from it, whose lines run against the slice's own.
  value: string;
  column: number;
  atRoot: boolean;
  // Whether the block stands last in the document, which is the only place a fence can be left
  // open. Recording an open fence anywhere else would record a form the file can never be written
  // in, and the record would flip on the save that closes it.
  endsDocument: boolean;
}

// An indented block's slice opens at the line its indentation is written on, and a fence's opens
// at the fence itself, whatever the container or the indentation before it, so the head of that
// slice is what names the form: indented code can never stand on a fence run, because the four
// spaces that open it stand there first.
export const findCodeForm = ({
  raw,
  value,
  column,
  atRoot,
  endsDocument,
}: CodeFormSource): AuthoredCodeForm => {
  const head = CODE_FENCE_PATTERN.test(raw) ? CODE_FENCE_HEAD_PATTERN.exec(raw) : null;

  if (head === null) {
    return INDENTED_CODE_FORM;
  }

  const [, run, spacing, info] = head;
  const fence = run.charAt(0) as CodeFence;

  return {
    fenced: true,
    fence,
    fenceSurplus: Math.max(run.length - findRequiredFenceLength(value, fence), 0),
    separator: info === undefined ? DEFAULT_CODE_SEPARATOR : spacing,
    indent: findFenceIndent(column, atRoot),
    closed: !endsDocument || findFenceClosed(raw, fence, run.length),
  };
};

// A fence left open runs to the end of the file, so the form is written back only where the block
// ends the document. Anything after it would be read as the code the block holds.
const standsLastInDocument = (node: CodeNode, parent: StringifyParent) =>
  parent !== undefined && parent.children[parent.children.length - 1] === node;

// The handler sizes the run to the content it just wrote, and a fence has to outrun anything
// inside it, so the file's own length is kept as the surplus over that floor rather than as a
// number that could fall under it. Content edited to hold a longer run raises the floor and
// carries the surplus with it. The indentation and the closing run stand outside what the handler
// tracks, so both are put back on its own output, and the block's own lines carry the indentation
// because CommonMark strips it from them again on the way back in.
const withFenceForm = (value: string, run: string, node: CodeNode, parent: StringifyParent) => {
  const lines = value.split("\n");
  const fence = run.charAt(0).repeat(run.length + readCodeFenceSurplus(node));
  const indent = " ".repeat(readCodeIndent(node));
  const info = (lines[0] ?? "").slice(run.length);
  const opening = info === "" ? fence : fence + readCodeSeparator(node) + info;
  const content = lines.slice(1, -1).map((line) => (line === "" ? "" : indent + line));
  const written = [indent + opening, ...content];

  return (
    readCodeClosed(node) || !standsLastInDocument(node, parent)
      ? [...written, indent + fence]
      : written
  ).join("\n");
};

// `mdast-util-to-markdown` chooses between the two code forms from one option for the whole
// document and spells a fence from another, and its indented branch also holds the conditions
// CommonMark puts on that form: a block carrying an info string, opening or closing on a blank
// line, or holding nothing but whitespace cannot be written indented, and is fenced whatever the
// file wrote. Both choices are reachable only through those options, so they carry the authored
// form for the length of the block and the runs are put back on the handler's own output.
export const serializeCode: NonNullable<RemarkStringifyHandlers["code"]> = (
  node: CodeNode,
  parent,
  state,
  info,
) => {
  const { fence, fences } = state.options;

  state.options.fences = readCodeFenced(node);
  state.options.fence = readCodeFence(node);

  try {
    const value = defaultHandlers.code(node, parent, state, info);
    const written = WRITTEN_CODE_FENCE_PATTERN.exec(value);

    // The indented branch is the one that writes an indentation of its own, and it is reached only
    // where the preset declined every condition that forces a fence, so the record is put back on
    // the lines that branch actually wrote rather than on the form the node asked for.
    return written
      ? withFenceForm(value, written[1], node, parent)
      : markVerbatimLines(value, INDENTED_CODE_PREFIX, readCodeLinePrefixes(node));
  } finally {
    Object.assign(state.options, { fence, fences });
  }
};

// The preset's own runner opens the mdast node itself and carries only the info string, so it is
// replaced rather than wrapped: the authored form has to reach the node the runner opens. The
// separator every block carries travels with it, the way each block Leafdown holds another form
// for carries it in that form's own module.
export const withCodeForm = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: {
    ...schema.attrs,
    [CODE_FENCED_ATTRIBUTE_NAME]: { default: DEFAULT_CODE_FENCED, validate: "boolean" },
    [CODE_FENCE_ATTRIBUTE_NAME]: { default: DEFAULT_CODE_FENCE, validate: "string" },
    [CODE_FENCE_SURPLUS_ATTRIBUTE_NAME]: {
      default: DEFAULT_CODE_FENCE_SURPLUS,
      validate: "number",
    },
    [CODE_SEPARATOR_ATTRIBUTE_NAME]: { default: DEFAULT_CODE_SEPARATOR, validate: "string" },
    [CODE_INDENT_ATTRIBUTE_NAME]: { default: DEFAULT_CODE_INDENT, validate: "number" },
    [CODE_LINE_PREFIXES_ATTRIBUTE_NAME]: {
      default: DEFAULT_CODE_LINE_PREFIXES,
      validate: validateCodeLinePrefixes,
    },
    [CODE_CLOSED_ATTRIBUTE_NAME]: { default: DEFAULT_CODE_CLOSED, validate: "boolean" },
    [BLOCK_ADJACENT_ATTRIBUTE_NAME]: { default: DEFAULT_BLOCK_ADJACENT, validate: "boolean" },
  },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      const value = node.value as string | undefined;

      state.openNode(type, {
        language: node.lang ?? "",
        [CODE_FENCED_ATTRIBUTE_NAME]: readCodeFenced(node),
        [CODE_FENCE_ATTRIBUTE_NAME]: readCodeFence(node),
        [CODE_FENCE_SURPLUS_ATTRIBUTE_NAME]: readCodeFenceSurplus(node),
        [CODE_SEPARATOR_ATTRIBUTE_NAME]: readCodeSeparator(node),
        [CODE_INDENT_ATTRIBUTE_NAME]: readCodeIndent(node),
        [CODE_LINE_PREFIXES_ATTRIBUTE_NAME]: readCodeLinePrefixes(node),
        [CODE_CLOSED_ATTRIBUTE_NAME]: readCodeClosed(node),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node),
      });

      if (value) {
        state.addText(value);
      }

      state.closeNode();
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      state.addNode(CODE_MARKDOWN_TYPE, undefined, node.content.firstChild?.text ?? "", {
        lang: node.attrs.language,
        [CODE_FENCED_ATTRIBUTE_NAME]: readCodeFenced(node.attrs),
        [CODE_FENCE_ATTRIBUTE_NAME]: readCodeFence(node.attrs),
        [CODE_FENCE_SURPLUS_ATTRIBUTE_NAME]: readCodeFenceSurplus(node.attrs),
        [CODE_SEPARATOR_ATTRIBUTE_NAME]: readCodeSeparator(node.attrs),
        [CODE_INDENT_ATTRIBUTE_NAME]: readCodeIndent(node.attrs),
        [CODE_LINE_PREFIXES_ATTRIBUTE_NAME]: readCodeLinePrefixes(node.attrs),
        [CODE_CLOSED_ATTRIBUTE_NAME]: readCodeClosed(node.attrs),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node.attrs),
      });
    },
  },
});

// A span's slice opens on the run that delimits it, whatever the content it holds.
const CODE_SPAN_RUN_PATTERN = /^`+/u;
// The construct the serializer is inside while it writes a cell's content.
const TABLE_CELL_MARKDOWN_TYPE = "tableCell";

type CodeSpanNode = Parameters<typeof defaultHandlers.inlineCode>[0];

export const readCodeSpanRunSurplus = (source: object): number => {
  const surplus = (source as Record<string, unknown>)[CODE_SPAN_RUN_SURPLUS_ATTRIBUTE_NAME];

  return typeof surplus === "number" && Number.isInteger(surplus) && surplus > 0
    ? surplus
    : DEFAULT_CODE_SPAN_RUN_SURPLUS;
};

// The run lengths the content spells, which are the lengths that cannot delimit it.
const findCodeSpanRuns = (value: string) => {
  const runs = new Set<number>();
  let current = 0;

  for (const character of value) {
    if (character === "`") {
      current += 1;
      continue;
    }

    if (current > 0) {
      runs.add(current);
    }

    current = 0;
  }

  if (current > 0) {
    runs.add(current);
  }

  return runs;
};

// The run a span is written with. A span closes on a run of its own length, so the shortest run
// that can delimit it is the shortest one its content spells nowhere. That is not the longest run
// plus one, which is what separates a span from a fence: content holding a run of two leaves a
// single backtick free. The surplus the file spent stands on top of that, and gives way to the free
// length again wherever the content has grown to spell the sum, since a longer run is not free for
// being longer and would close the span at itself.
export const findCodeSpanRun = (value: string, surplus: number = DEFAULT_CODE_SPAN_RUN_SURPLUS) => {
  const runs = findCodeSpanRuns(value);
  let required = 1;

  while (runs.has(required)) {
    required += 1;
  }

  const length = required + surplus;

  return runs.has(length) ? required : length;
};

// The parse keeps the content and drops the run around it, so the authored length survives only in
// the slice of the file the span was built from. It is kept as the surplus over the length the
// content forces, so content edited to hold a longer run raises that floor and carries the surplus
// with it, which is how the block form records its fence.
export const findCodeSpanRunSurplus = (raw: string, value: string) => {
  const run = CODE_SPAN_RUN_PATTERN.exec(raw);

  return run === null
    ? DEFAULT_CODE_SPAN_RUN_SURPLUS
    : Math.max(run[0].length - findCodeSpanRun(value), 0);
};

// A cell is split on the pipes it holds before its content is read, so a pipe inside a span has to
// be escaped for the span to survive the split. `mdast-util-gfm-table` carries that rule in an
// `inlineCode` handler of its own, which a handler registered here replaces, so the rule is
// reproduced rather than lost. It reaches only the content, since the delimiters are backticks.
const withCellPipeEscapes = (value: string, state: StringifyState) =>
  state.stack.includes(TABLE_CELL_MARKDOWN_TYPE) ? value.replaceAll("|", String.raw`\|`) : value;

// The handler sizes the run to the shortest length the content leaves free and pads the value where
// a delimiter would otherwise touch a backtick or an edge space, so the run the file was written
// with is put back on both ends of its output and the padding it chose still holds.
export const serializeCodeSpan: NonNullable<RemarkStringifyHandlers["inlineCode"]> = (
  node: CodeSpanNode,
  parent,
  state,
) => {
  const value = withCellPipeEscapes(defaultHandlers.inlineCode(node, parent, state), state);
  const written = CODE_SPAN_RUN_PATTERN.exec(value);

  if (written === null) {
    return value;
  }

  const length = findCodeSpanRun(node.value, readCodeSpanRunSurplus(node));

  if (length === written[0].length) {
    return value;
  }

  const run = "`".repeat(length);

  return run + value.slice(written[0].length, value.length - written[0].length) + run;
};

// The preset's runners carry the value alone, so both are replaced to put the recorded run beside
// it. The mark's `toDOM` writes only the attributes the preset's own slice holds, so the record
// reaches no rendered attribute of its own.
export const withCodeSpanForm = (schema: MarkSchema): MarkSchema => ({
  ...schema,
  attrs: {
    ...schema.attrs,
    [CODE_SPAN_RUN_SURPLUS_ATTRIBUTE_NAME]: {
      default: DEFAULT_CODE_SPAN_RUN_SURPLUS,
      validate: "number",
    },
  },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, markType) => {
      state.openMark(markType, {
        [CODE_SPAN_RUN_SURPLUS_ATTRIBUTE_NAME]: readCodeSpanRunSurplus(node),
      });
      state.addText((node.value as string | undefined) ?? "");
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, mark, node) => {
      state.withMark(mark, CODE_SPAN_MARKDOWN_TYPE, node.text ?? "", {
        [CODE_SPAN_RUN_SURPLUS_ATTRIBUTE_NAME]: readCodeSpanRunSurplus(mark.attrs),
      });

      return true;
    },
  },
});
