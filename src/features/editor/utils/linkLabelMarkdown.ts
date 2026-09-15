import type { MarkdownNode, MarkSchema } from "@milkdown/kit/transformer";
import type { ConstructName } from "mdast-util-to-markdown";

interface MarkdownTree {
  type: string;
  children?: MarkdownTree[];
}

const LABEL_EDGE_MARKDOWN_TYPE = "leafdownLinkLabelEdge";

const createLabelEdge = (): MarkdownNode => ({ type: LABEL_EDGE_MARKDOWN_TYPE });

// Milkdown closes every mark by lifting the spaces its first and last text children hold out beside
// it, which CommonMark needs for a delimiter but not for a link, whose brackets own the space inside
// them. It only lifts off a text child, so the label is held between two edges that are not text
// for as long as the link is open, with everything pushed into it landing between them. The root
// handler removes the edges before any other handler reads the tree.
export const withLinkLabelWhitespace = (schema: MarkSchema): MarkSchema => {
  const { toMarkdown } = schema;

  return {
    ...schema,
    toMarkdown: {
      ...toMarkdown,
      runner: (state, mark, node) => {
        const enclosing = state.top();
        const result = toMarkdown.runner(state, mark, node);
        const opened = state.top();

        if (opened && opened !== enclosing) {
          const children = [createLabelEdge(), createLabelEdge()];

          opened.children = children;
          opened.push = (...nodes) => {
            children.splice(children.length - 1, 0, ...nodes);
          };
        }

        return result;
      },
    },
  };
};

let enclosingConstructs: readonly ConstructName[] = [];

// A label whose formatting is mixed is written on its own and stood into its block as a placeholder,
// so neither pass sees the brackets the label is written between, nor the cell a table writes it in.
// A projected fragment is written on its own as well, outside the cell holding it. A `[`, a `]`, and
// the `(` a `]` stands before read as a label's own delimiters wherever they fall in it, and a `|`
// closes the cell, so the constructs the fragment is written inside are named here for the passes
// that decide an escape.
export const writeInsideConstructs = <T>(
  constructs: readonly ConstructName[],
  write: () => T,
): T => {
  const enclosing = enclosingConstructs;

  enclosingConstructs = constructs;

  try {
    return write();
  } finally {
    enclosingConstructs = enclosing;
  }
};

export const readEnclosingConstructs = () => enclosingConstructs;

export const removeLinkLabelEdges = (node: MarkdownTree) => {
  const children = node.children ?? [];

  for (let index = children.length - 1; index >= 0; index -= 1) {
    if (children[index].type === LABEL_EDGE_MARKDOWN_TYPE) {
      children.splice(index, 1);
    } else {
      removeLinkLabelEdges(children[index]);
    }
  }
};
