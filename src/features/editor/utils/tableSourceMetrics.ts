import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";

import {
  createSourceProjectionProbeState,
  findSourceProjectionTarget,
  type SourceProjectionAdapter,
  type SourceProjectionTargetMatch,
} from "./sourceProjectionAdapters";

export interface TableSourceSpan {
  className: string;
  text: string;
}

const appendSpan = (spans: TableSourceSpan[], className: string, text: string) => {
  if (!text) {
    return;
  }

  const previous = spans.at(-1);

  if (previous?.className === className) {
    previous.text += text;

    return;
  }

  spans.push({ className, text });
};

// Presentation spans nest rather than partition: a link draws its label and its content over the
// same characters. Collecting the classes each character carries keeps both without spending the
// character twice. A preview is drawn beside the source rather than over it, so it adds its own.
const appendPresentation = (
  spans: TableSourceSpan[],
  { adapter, target }: SourceProjectionTargetMatch,
) => {
  const source = target.originalSource;
  const presentation = adapter.getPresentation(target, source);
  const classNames: string[][] = Array.from({ length: source.length }, () => []);

  for (const span of presentation.spans) {
    for (let index = Math.max(0, span.from); index < Math.min(source.length, span.to); index += 1) {
      if (!classNames[index].includes(span.className)) {
        classNames[index].push(span.className);
      }
    }
  }

  const previews = new Map<number, string>();

  for (const preview of presentation.previews) {
    previews.set(preview.offset, (previews.get(preview.offset) ?? "") + preview.text);
  }

  for (let index = 0; index < source.length; index += 1) {
    const preview = previews.get(index);

    if (preview) {
      appendSpan(spans, "", preview);
    }

    appendSpan(spans, classNames[index].join(" "), source[index]);
  }

  appendSpan(spans, "", previews.get(source.length) ?? "");
};

// Text answers to a caret placed inside it, while an inline object has no inside, so the caret
// that owns one sits against its edges instead.
const findCoveringTarget = (
  doc: ProseMirrorNode,
  adapters: readonly SourceProjectionAdapter[],
  position: number,
  node: ProseMirrorNode,
) => {
  const candidates = node.isText
    ? [position + 1]
    : [position, position + node.nodeSize, position + 1];

  for (const candidate of candidates) {
    const probe = createSourceProjectionProbeState(doc, candidate);
    const match = probe ? findSourceProjectionTarget(probe, adapters) : null;

    if (match && match.target.from <= position && match.target.to >= position + node.nodeSize) {
      return match;
    }
  }

  return null;
};

/**
 * The source a cell would show with every one of its runs projected at once. No caret reaches that
 * state — only one run projects at a time — so the width it asks for is an upper bound on every
 * projection the cell can open, which is what makes it a floor the column can hold.
 */
export const getCellSourceSpans = (
  doc: ProseMirrorNode,
  adapters: readonly SourceProjectionAdapter[],
  cellPosition: number,
  cell: ProseMirrorNode,
): TableSourceSpan[] => {
  const spans: TableSourceSpan[] = [];
  const block = cell.firstChild;

  if (!block) {
    return spans;
  }

  // The cell opens, then the block it holds, and the inline content starts after both.
  const contentFrom = cellPosition + 2;
  let index = 0;
  let offset = 0;

  while (index < block.childCount) {
    const node = block.child(index);
    const position = contentFrom + offset;
    const match = findCoveringTarget(doc, adapters, position, node);

    if (match) {
      appendPresentation(spans, match);

      while (index < block.childCount && contentFrom + offset < match.target.to) {
        offset += block.child(index).nodeSize;
        index += 1;
      }

      continue;
    }

    appendSpan(spans, "", node.text ?? "");
    offset += node.nodeSize;
    index += 1;
  }

  return spans;
};
