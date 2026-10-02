import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, Selection, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { readCodeFenced } from "../utils/codeMarkdown";

export const isMermaidCodeBlock = (node: ProseMirrorNode | null) =>
  node?.type.name === "code_block" &&
  readCodeFenced(node.attrs) &&
  (node.attrs.language as string).toLowerCase() === "mermaid";

// Either end of a text selection opens the diagram it lies in, so neither end rests in hidden code.
const findEditedMermaidPositions = (state: EditorState) => {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return [];

  const positions = new Set<number>();
  for (const $end of [selection.$anchor, selection.$head]) {
    if ($end.depth > 0 && isMermaidCodeBlock($end.parent)) positions.add($end.before());
  }
  return [...positions];
};

export const isEditingMermaidCodeBlock = (state: EditorState, position: number) =>
  findEditedMermaidPositions(state).includes(position);

const ARROW_DIRECTIONS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
} as const;

// Native caret motion skips a diagram's hidden code, so arrows step into it explicitly.
const enterAdjacentDiagram = (view: EditorView, event: KeyboardEvent) => {
  const direction = ARROW_DIRECTIONS[event.key as keyof typeof ARROW_DIRECTIONS];
  if (!direction || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;

  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty || selection.$head.depth === 0)
    return false;
  if (!view.endOfTextblock(direction)) return false;

  const forward = direction === "down" || direction === "right";
  const { $head } = selection;
  const next = Selection.findFrom(
    view.state.doc.resolve(forward ? $head.after() : $head.before()),
    forward ? 1 : -1,
  );
  if (
    !(next instanceof TextSelection) ||
    !isMermaidCodeBlock(next.$head.parent) ||
    isEditingMermaidCodeBlock(view.state, next.$head.before())
  )
    return false;

  view.dispatch(view.state.tr.setSelection(next).scrollIntoView());
  return true;
};

export const createLeafdownMermaidModePlugin = () =>
  $prose(
    () =>
      new Plugin({
        props: {
          handleKeyDown: enterAdjacentDiagram,
          // The NodeView reads the mode on update, which a changed decoration is what triggers.
          decorations: (state) => {
            const decorations = findEditedMermaidPositions(state).map((position) =>
              Decoration.node(position, position + state.doc.nodeAt(position)!.nodeSize, {
                class: "leafdown-mermaid-editing",
              }),
            );
            return decorations.length
              ? DecorationSet.create(state.doc, decorations)
              : DecorationSet.empty;
          },
        },
      }),
  );
