import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { isTextCaretSelection } from "../utils/selections";
import { SOURCE_PROJECTION_ENTRY_SUPPRESSION_META } from "./sourceProjection";

export const leafdownMarkerPresentationPluginKey = new PluginKey<boolean>(
  "leafdownMarkerPresentation",
);

const setMarkerFocus = (view: EditorView, focused: boolean) => {
  if (leafdownMarkerPresentationPluginKey.getState(view.state) !== focused) {
    view.dispatch(
      view.state.tr
        .setMeta(leafdownMarkerPresentationPluginKey, focused)
        .setMeta(SOURCE_PROJECTION_ENTRY_SUPPRESSION_META, true),
    );
  }

  return false;
};

export const createLeafdownMarkerPresentationPlugin = () =>
  $prose(
    () =>
      new Plugin<boolean>({
        key: leafdownMarkerPresentationPluginKey,
        props: {
          decorations: (state) =>
            leafdownMarkerPresentationPluginKey.getState(state)
              ? DecorationSet.create(state.doc, getMarkerDecorations(state))
              : DecorationSet.empty,
          handleDOMEvents: {
            focus: (view) => setMarkerFocus(view, true),
            blur: (view) => setMarkerFocus(view, false),
          },
        },
        state: {
          init: () => false,
          apply: (transaction, focused) =>
            (transaction.getMeta(leafdownMarkerPresentationPluginKey) as boolean | undefined) ??
            focused,
        },
      }),
  );

const getMarkerDecorations = (state: EditorState) => {
  const decorations: Decoration[] = [];

  addCaretBasedMarkers(state, decorations);

  return decorations;
};

const addCaretBasedMarkers = (state: EditorState, decorations: Decoration[]) => {
  const { selection } = state;

  if (!isTextCaretSelection(selection)) {
    return;
  }

  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    const pos = $from.before(depth);
    const marker = getSubtleMarkerForNode(node);

    if (!marker) {
      continue;
    }

    decorations.push(createMarkerNodeDecoration(pos, node, marker));
  }
};

// The marker is chrome on the block it names rather than a widget in its content. A widget would
// take a document position the block's own content does not hold, and a caret aimed at that
// position resolves into a neighbouring block instead.
const createMarkerNodeDecoration = (pos: number, node: ProseMirrorNode, marker: string) =>
  Decoration.node(pos, pos + node.nodeSize, {
    class: "leafdown-marker-node leafdown-marker-node--subtle",
    "data-leafdown-marker": marker,
  });

const getSubtleMarkerForNode = (node: ProseMirrorNode) => {
  switch (node.type.name) {
    case "heading":
      return `H${node.attrs.level ?? 1}`;

    default:
      return null;
  }
};
