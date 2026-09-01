import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { MarkdownNode, NodeSchema } from "@milkdown/kit/transformer";
import { markdownTable } from "markdown-table";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["table"]>>[2];

type StringifyInfo = Parameters<NonNullable<RemarkStringifyHandlers["table"]>>[3];

type JoinArguments = Parameters<StringifyState["join"][number]>;

// Milkdown types a stringify handler's node as `any`, so the table is named here from the blocks
// the serializer joins.
type TableNode = Extract<JoinArguments[0], { type: "table" }>;

export const TABLE_MARKDOWN_TYPE = "table";
export const TABLE_OUTER_PIPES_ATTRIBUTE_NAME = "outerPipes";

const TABLE_ROW_MARKDOWN_TYPE = "tableRow";

const OUTER_PIPE = "|";

// Which outer pipes a table's rows were authored with. GFM reads a row opening with a pipe,
// closing with one, carrying both, or carrying neither as the same row.
const TABLE_OUTER_PIPES_FORMS = ["both", "leading", "trailing", "none"] as const;

type TableOuterPipes = (typeof TABLE_OUTER_PIPES_FORMS)[number];

// The form a table is written with when it has none of its own: one the editor created, one whose
// authored form cannot be recovered, and one whose own form the rows it now holds would not be
// read back from. Both pipes are the form every row reads back as the row it was written from.
export const DEFAULT_TABLE_OUTER_PIPES: TableOuterPipes = "both";

const isTableOuterPipes = (value: unknown): value is TableOuterPipes =>
  TABLE_OUTER_PIPES_FORMS.includes(value as TableOuterPipes);

export const readTableOuterPipes = (source: object): TableOuterPipes => {
  const form = (source as Record<string, unknown>)[TABLE_OUTER_PIPES_ATTRIBUTE_NAME];

  return isTableOuterPipes(form) ? form : DEFAULT_TABLE_OUTER_PIPES;
};

const hasLeadingPipe = (form: TableOuterPipes) => form === "both" || form === "leading";

const hasTrailingPipe = (form: TableOuterPipes) => form === "both" || form === "trailing";

// A row is written without an outer pipe only where every row was authored without it, so a table
// whose rows disagree keeps the pipe rather than taking it off the rows that carry one. A trailing
// pipe an author escaped into a cell counts as one for the same reason: reading it as a delimiter
// keeps a pipe the file already had.
export const findTableOuterPipes = (rows: readonly string[]): TableOuterPipes => {
  if (rows.length === 0) {
    return DEFAULT_TABLE_OUTER_PIPES;
  }

  const leading = rows.some((row) => row.startsWith(OUTER_PIPE));
  const trailing = rows.some((row) => row.length > OUTER_PIPE.length && row.endsWith(OUTER_PIPE));

  if (leading) {
    return trailing ? "both" : "leading";
  }

  return trailing ? "trailing" : "none";
};

const readCell = (row: readonly string[], index: number) => row[index] ?? "";

// A cell holding nothing but the padding around it leaves the written row opening or closing on a
// pipe of its own, and GFM strips that pipe before it splits the row. The cell it stood for is
// gone and every cell after it has moved a column, so the form gives way rather than write a row
// the next open reads differently.
const hasBlankEdgeCell = (matrix: readonly string[][], edge: "leading" | "trailing") => {
  const width = Math.max(...matrix.map((row) => row.length));

  return matrix.some((row) => readCell(row, edge === "leading" ? 0 : width - 1).trim() === "");
};

// `markdown-table` sizes a delimiter cell to its column, so a first column one character wide is
// written `-`. With no pipe ahead of it, that hyphen and the space after it open a bullet list item
// and the lines stop being a table. An alignment marker widens the cell past a lone hyphen, so
// only a column carrying none can reach this.
const opensDelimiterRowWithBullet = (matrix: readonly string[][], align: TableNode["align"]) =>
  !align?.[0] && Math.max(...matrix.map((row) => readCell(row, 0).length)) <= 1;

const keepsRowsReadable = (
  form: TableOuterPipes,
  matrix: readonly string[][],
  align: TableNode["align"],
) => {
  if (
    !hasLeadingPipe(form) &&
    (hasBlankEdgeCell(matrix, "leading") || opensDelimiterRowWithBullet(matrix, align))
  ) {
    return false;
  }

  return hasTrailingPipe(form) || !hasBlankEdgeCell(matrix, "trailing");
};

// `mdast-util-gfm-table` calls `markdown-table` with the alignment, the padding, and the cell width
// it was configured with and never with the outer delimiters, so the option a preserved form needs
// is only reachable from a handler of Leafdown's own. The rows are built through the `tableCell`
// handler the extension registers, which is what escapes a pipe standing inside a cell.
export const serializeTable: NonNullable<RemarkStringifyHandlers["table"]> = (
  node: TableNode,
  _parent,
  state,
  info: StringifyInfo,
) => {
  const exitTable = state.enter(TABLE_MARKDOWN_TYPE);
  const matrix = node.children.map((row) => {
    const exitRow = state.enter(TABLE_ROW_MARKDOWN_TYPE);
    const cells = row.children.map((cell) => state.handle(cell, row, state, info));

    exitRow();

    return cells;
  });

  exitTable();

  const authored = readTableOuterPipes(node);
  const form = keepsRowsReadable(authored, matrix, node.align)
    ? authored
    : DEFAULT_TABLE_OUTER_PIPES;

  return markdownTable(matrix, {
    align: node.align,
    delimiterStart: hasLeadingPipe(form),
    delimiterEnd: hasTrailingPipe(form),
  });
};

// The preset's own runners carry the alignment down to the cells and mark the header row, and both
// are replaced rather than wrapped because the form has to reach the node the runner opens.
export const withTableOuterPipes = (schema: NodeSchema): NodeSchema => ({
  ...schema,
  attrs: {
    ...schema.attrs,
    [TABLE_OUTER_PIPES_ATTRIBUTE_NAME]: {
      default: DEFAULT_TABLE_OUTER_PIPES,
      validate: "string",
    },
  },
  parseMarkdown: {
    ...schema.parseMarkdown,
    runner: (state, node, type) => {
      const align = node.align as (string | null)[];
      const rows = (node.children ?? []).map((row, index): MarkdownNode => ({
        ...row,
        align,
        isHeader: index === 0,
      }));

      state.openNode(type, { [TABLE_OUTER_PIPES_ATTRIBUTE_NAME]: readTableOuterPipes(node) });
      state.next(rows);
      state.closeNode();
    },
  },
  toMarkdown: {
    ...schema.toMarkdown,
    runner: (state, node) => {
      const headerRow = node.content.firstChild?.content;

      if (!headerRow) {
        return;
      }

      const align: (string | null)[] = [];

      headerRow.forEach((cell) => align.push(cell.attrs.alignment as string | null));

      state.openNode(TABLE_MARKDOWN_TYPE, undefined, {
        align,
        [TABLE_OUTER_PIPES_ATTRIBUTE_NAME]: readTableOuterPipes(node.attrs),
      });
      state.next(node.content);
      state.closeNode();
    },
  },
});
