import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { htmlBlockNames, htmlRawNames } from "micromark-util-html-tag-name";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

export const RAW_HTML_MARKDOWN_TYPE = "leafdownRawHtml";

export const HTML_MARKDOWN_TYPE = "html";
const TAG_NAME_END = String.raw`[\t\n\f\r >]|/>|$`;

// The block start conditions that interrupt a paragraph, one through six, each allowing the three
// spaces of indentation a block may carry. Condition seven, any other complete tag alone on its
// line, is the one that does not interrupt.
const INTERRUPTING_BLOCK_PATTERN = new RegExp(
  String.raw`^ {0,3}<(?:(?:${htmlRawNames.join("|")})(?:[\t\n\f\r >]|$)|!--|\?|![A-Za-z]|!\[CDATA\[|/?(?:${htmlBlockNames.join("|")})(?:${TAG_NAME_END}))`,
  "iu",
);

export const interruptsParagraphAsHtmlBlock = (value: string) =>
  INTERRUPTING_BLOCK_PATTERN.test(value);

// Block start conditions one through five close on an end condition of their own rather than on a
// blank line, so a block whose source holds none runs to the end of the document and takes in
// every line after it.
const SELF_CLOSING_BLOCK_CONDITIONS: readonly (readonly [RegExp, RegExp])[] = [
  [
    new RegExp(String.raw`^ {0,3}<(?:${htmlRawNames.join("|")})(?:[\t\n\f\r >]|$)`, "iu"),
    new RegExp(String.raw`</(?:${htmlRawNames.join("|")})>`, "iu"),
  ],
  [/^ {0,3}<!--/u, /-->/u],
  [/^ {0,3}<\?/u, /\?>/u],
  [/^ {0,3}<![A-Za-z]/u, />/u],
  [/^ {0,3}<!\[CDATA\[/u, /\]\]>/u],
];

export const runsToDocumentEnd = (value: string) =>
  SELF_CLOSING_BLOCK_CONDITIONS.some(([start, end]) => start.test(value) && !end.test(value));

// `containerPhrasing` rewrites a line ending before an `html` node to a space, so a break authored
// before raw HTML reaches the file as a space and the node is gone on reopen. Raw HTML that cannot
// interrupt a paragraph carries a private type the rewrite does not match, and keeps its break.
export const getRawHtmlMarkdownType = (value: string) =>
  interruptsParagraphAsHtmlBlock(value) ? HTML_MARKDOWN_TYPE : RAW_HTML_MARKDOWN_TYPE;

export const serializeRawHtml: NonNullable<RemarkStringifyHandlers["html"]> = (node: {
  value?: string;
}) => node.value ?? "";
