import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

import { writeLabel } from "./markdownDestination";
import { chooseLabelSpelling } from "./referenceLinkMarkdown";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["link"]>>[2];
type StringifyInfo = Parameters<NonNullable<RemarkStringifyHandlers["link"]>>[3];
type FootnoteDefinitionNode = Extract<
  Parameters<StringifyState["containerFlow"]>[0],
  { type: "footnoteDefinition" }
>;
type FootnoteReferenceNode = Parameters<StringifyState["associationId"]>[0];

export const FOOTNOTE_REFERENCE_MARKDOWN_TYPE = "footnoteReference";
export const FOOTNOTE_DEFINITION_MARKDOWN_TYPE = "footnoteDefinition";

const FOOTNOTE_REFERENCE_LABEL_PATTERN = /^\[\^((?:[^\\\]]|\\[\S\s])*)\]$/u;
const FOOTNOTE_DEFINITION_LABEL_PATTERN = /^\[\^((?:[^\\\]]|\\[\S\s])*)\]:/u;
const DEFINITION_CONTINUATION_INDENT = "    ";

// GFM matches a footnote to its definition on the label as the file spelled it, escapes included,
// so `[^a\*b]` and `[^a*b]` name two footnotes. The parser hands over the label decoded, which
// cannot tell them apart, so the spelling is read back out of the slice the node was built from.
export const findFootnoteLabelSpelling = (raw: string, node: object) => {
  const pattern =
    (node as { type?: unknown }).type === FOOTNOTE_DEFINITION_MARKDOWN_TYPE
      ? FOOTNOTE_DEFINITION_LABEL_PATTERN
      : FOOTNOTE_REFERENCE_LABEL_PATTERN;

  return chooseLabelSpelling(node, pattern.exec(raw)?.[1] ?? null);
};

// The label is the spelling the definition is matched on, so it is written as it stands rather than
// through the escaping `mdast-util-to-markdown` gives text, which would add a backslash before each
// escape it holds.
export const serializeMarkdownFootnoteReference = (
  node: FootnoteReferenceNode,
  _: unknown,
  state: StringifyState,
  info: StringifyInfo,
) => {
  const tracker = state.createTracker(info);
  let value = tracker.move("[^");
  const exit = state.enter("footnoteReference");

  value += tracker.move(writeLabel(state, node));
  exit();

  return value + tracker.move("]");
};

export const serializeMarkdownFootnoteDefinition = (
  node: FootnoteDefinitionNode,
  _: unknown,
  state: StringifyState,
  info: StringifyInfo,
) => {
  const tracker = state.createTracker(info);
  let value = tracker.move("[^");
  const exit = state.enter("footnoteDefinition");

  value += tracker.move(writeLabel(state, node));
  value += tracker.move("]:");

  if (node.children.length > 0) {
    tracker.shift(DEFINITION_CONTINUATION_INDENT.length);
    value += tracker.move(
      ` ${state.indentLines(state.containerFlow(node, tracker.current()), (line, index, blank) =>
        index === 0 || blank ? line : DEFINITION_CONTINUATION_INDENT + line,
      )}`,
    );
  }

  exit();

  return value;
};
