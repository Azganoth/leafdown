import type { MarkdownNode, RemarkPluginRaw } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import { positionValuePieces } from "../utils/characterReferenceMarkdown";

type ChildrenRecord = WeakMap<MarkdownNode, readonly MarkdownNode[]>;

const TEXT_MARKDOWN_TYPE = "text";
const LINK_MARKDOWN_TYPE = "link";

const recordChildren = (node: MarkdownNode, record: ChildrenRecord) => {
  const children = node.children;

  if (!children) {
    return;
  }

  if (children.some((child) => child.type === TEXT_MARKDOWN_TYPE)) {
    record.set(node, [...children]);
  }

  for (const child of children) {
    recordChildren(child, record);
  }
};

// The text a node rebuilt from a text node holds: its own value, or the value of the one text
// child of the link that stands for a literal.
const readRebuiltText = (node: MarkdownNode) => {
  const [child, ...rest] = node.type === LINK_MARKDOWN_TYPE ? (node.children ?? []) : [node];

  return rest.length === 0 && child?.type === TEXT_MARKDOWN_TYPE && typeof child.value === "string"
    ? child.value
    : null;
};

const positionRebuiltRun = (run: readonly MarkdownNode[], text: MarkdownNode, source: string) => {
  const start = text.position?.start;
  const end = text.position?.end.offset;
  const pieces = run.map(readRebuiltText);

  if (
    start?.offset === undefined ||
    end === undefined ||
    pieces.some((piece) => piece === null) ||
    pieces.join("") !== text.value
  ) {
    return;
  }

  const positions = positionValuePieces(pieces as string[], source.slice(start.offset, end), {
    column: start.column,
    line: start.line,
    offset: start.offset,
  });

  positions?.forEach((position, index) => {
    const node = run[index];

    if (node.type !== LINK_MARKDOWN_TYPE) {
      node.position = position;
      return;
    }

    // The tokenizer keeps a literal's text as the file spells it, while this search found the
    // literal in decoded text, so a literal spelled with an escape or a reference is left as it
    // was built rather than read back as a bare literal the tokenizer would read differently.
    if (source.slice(position.start.offset, position.end.offset) === pieces[index]) {
      node.position = position;
      // A literal spans its target exactly, which is how its bare form is told from angle brackets.
      node.children?.forEach((child) => {
        child.position = position;
      });
    }
  });
};

// Each text node the parser rebuilt stands where it stood, as a run of nodes carrying no position.
const restorePositions = (node: MarkdownNode, source: string, record: ChildrenRecord) => {
  const children = node.children;

  if (!children) {
    return;
  }

  const recorded = record.get(node);

  if (recorded) {
    const kept = new Set(children);
    const rebuilt = recorded.filter(
      (child) => child.type === TEXT_MARKDOWN_TYPE && !kept.has(child),
    );
    const runs: MarkdownNode[][] = [];
    let run: MarkdownNode[] | null = null;

    for (const child of children) {
      if (child.position) {
        run = null;
      } else if (run) {
        run.push(child);
      } else {
        run = [child];
        runs.push(run);
      }
    }

    if (rebuilt.length > 0 && rebuilt.length === runs.length) {
      runs.forEach((rebuiltRun, index) => positionRebuiltRun(rebuiltRun, rebuilt[index], source));
    }
  }

  for (const child of children) {
    restorePositions(child, source, record);
  }
};

// GFM finds a literal the tokenizer passed over, such as one after a quote or after the space a
// character reference names, by searching text that has already been decoded, and the nodes it
// replaces that text with carry no position. Every pass that reads a node's authored form from the
// file needs one, so the children are recorded before that search and the rebuilt nodes are
// positioned from the text node they replaced. This plugin has to be used before GFM so that its
// record is taken first.
export const createLeafdownAutolinkLiteralPositionPlugin = () =>
  $remark(
    "leafdownAutolinkLiteralPosition",
    () =>
      function (this: ThisParameterType<RemarkPluginRaw<unknown>>) {
        const record: ChildrenRecord = new WeakMap();
        const data = this.data();

        (data.fromMarkdownExtensions ??= []).push({
          transforms: [(tree) => recordChildren(tree as MarkdownNode, record)],
        });

        return (tree, file) => restorePositions(tree as MarkdownNode, String(file), record);
      },
  );
