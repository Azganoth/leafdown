import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { NodeSchema } from "@milkdown/kit/transformer";
import { defaultHandlers } from "mdast-util-to-markdown";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

// Milkdown types a stringify handler's node as `any` and its parent as every mdast node that holds
// children, so the siblings a break stands among are named here by the parts a line is read from.
interface PhrasingSibling {
  type: string;
  value?: string;
}

export const HARD_BREAK_MARKDOWN_TYPE = "break";
export const HARD_BREAK_RUN_ATTRIBUTE_NAME = "run";

const TEXT_MARKDOWN_TYPE = "text";
const SOFT_BREAK_ATTRIBUTE_NAME = "isInline";
const SOFT_BREAK_VALUE = "\n";

// The run a break is written with when it has none of its own: one the editor created and one whose
// authored characters cannot be recovered. A backslash is the one spelling a reader can see, and the
// one every position reads as a break.
export const DEFAULT_HARD_BREAK_RUN = "\\";

// CommonMark ends a line on a hard break where two or more spaces precede the line ending, or where
// a backslash does. A tab is neither, so no other run spells one.
const HARD_BREAK_RUN_PATTERN = /^(?:\\| {2,})$/u;
const LINE_ENDING_PATTERN = /(?:\r\n|[\n\r])$/u;
// A character the parse leaves on the line rather than trimming into the break beside it.
const LINE_CONTENT_PATTERN = /[^\t\n\r ]$/u;

const isHardBreakRun = (value: unknown): value is string =>
  typeof value === "string" && HARD_BREAK_RUN_PATTERN.test(value);

const readSoftBreak = (source: object): boolean =>
  Boolean((source as { data?: Record<string, unknown> }).data?.[SOFT_BREAK_ATTRIBUTE_NAME]);

export const readHardBreakRun = (source: object): string => {
  const run = (source as Record<string, unknown>)[HARD_BREAK_RUN_ATTRIBUTE_NAME];

  return isHardBreakRun(run) ? run : DEFAULT_HARD_BREAK_RUN;
};

// A break holds no children, so the characters it was written with survive only in the slice of the
// file it was built from. That slice closes on the line ending the break spends, which is the one
// correction it needs to become the run the file is written back with.
export const findHardBreakRun = (raw: string): string => {
  const run = raw.replace(LINE_ENDING_PATTERN, "");

  return isHardBreakRun(run) ? run : DEFAULT_HARD_BREAK_RUN;
};

// Whether the line the break closes already holds a character of its own. A line opening on a run of
// spaces is blank and ends the block instead, and a run written against whitespace already there is
// trimmed into the break along with it, costing the text that wrote it. The character is read off
// the tree rather than off `info.before`, because `containerPhrasing` peeks the next child with an
// empty `before` and a peek disagreeing with the write would escape the text before the break
// against a character the file never receives. A text node writes its own characters and a break
// closes the line above this one; every other phrasing construct writes at least the delimiters that
// spell it, and none of those are whitespace.
const closesContentLine = (node: unknown, parent: unknown) => {
  const children =
    (parent as { children?: readonly PhrasingSibling[] } | undefined)?.children ?? [];
  const index = children.findIndex((child) => child === node);

  if (index <= 0) {
    return false;
  }

  const previous = children[index - 1];

  if (previous.type === HARD_BREAK_MARKDOWN_TYPE) {
    return false;
  }

  return previous.type !== TEXT_MARKDOWN_TYPE || LINE_CONTENT_PATTERN.test(previous.value ?? "");
};

// The default handler answers for every construct that admits no line ending, writing a space or
// nothing where a setext heading or a table cell holds the break, so the run replaces only the
// spelling it would otherwise write.
export const serializeHardBreak: NonNullable<RemarkStringifyHandlers["break"]> = (
  node: Parameters<typeof defaultHandlers.break>[0],
  parent,
  state,
  info,
) => {
  const written = defaultHandlers.break(node, parent, state, info);
  const run = readHardBreakRun(node);

  return written === DEFAULT_HARD_BREAK_RUN + "\n" && closesContentLine(node, parent)
    ? run + "\n"
    : written;
};

// The preset's runners carry the break's own kind and nothing else, so both are replaced to put the
// recorded run beside it. A soft break is the same node with `isInline` set, and writes the line
// ending it stands for rather than a break of any spelling, so it carries no run.
export const withHardBreakForm = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: {
    ...schema.attrs,
    [HARD_BREAK_RUN_ATTRIBUTE_NAME]: {
      default: DEFAULT_HARD_BREAK_RUN,
      validate: "string",
    },
  },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      state.addNode(type, {
        [SOFT_BREAK_ATTRIBUTE_NAME]: readSoftBreak(node),
        [HARD_BREAK_RUN_ATTRIBUTE_NAME]: readHardBreakRun(node),
      });
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      if (node.attrs[SOFT_BREAK_ATTRIBUTE_NAME]) {
        state.addNode(TEXT_MARKDOWN_TYPE, undefined, SOFT_BREAK_VALUE);

        return;
      }

      state.addNode(HARD_BREAK_MARKDOWN_TYPE, undefined, undefined, {
        [HARD_BREAK_RUN_ATTRIBUTE_NAME]: readHardBreakRun(node.attrs),
      });
    },
  },
});
