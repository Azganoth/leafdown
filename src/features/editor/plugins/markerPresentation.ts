import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { NodeSchema } from "@milkdown/kit/transformer";
import { $prose } from "@milkdown/kit/utils";

import { isCaretSelection, isTextCaretSelection } from "../utils/selections";

export const leafdownMarkerPresentationPluginKey = new PluginKey("leafdownMarkerPresentation");

interface NodeWithPos {
  node: ProseMirrorNode;
  pos: number;
}

const SOURCE_NODE_NAMES = new Set(["html"]);

export const createLeafdownMarkerPresentationPlugin = () =>
  $prose(
    () =>
      new Plugin({
        key: leafdownMarkerPresentationPluginKey,
        props: {
          decorations: (state) => DecorationSet.create(state.doc, getMarkerDecorations(state)),
        },
      }),
  );

const getMarkerDecorations = (state: EditorState) => {
  const decorations: Decoration[] = [];

  addPersistentFootnoteDefinitionMarkers(state, decorations);
  addCaretBasedMarkers(state, decorations);
  addFocusedSourceNodeEditors(state, decorations);

  return decorations;
};

const addPersistentFootnoteDefinitionMarkers = (state: EditorState, decorations: Decoration[]) => {
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "footnote_definition") {
      return true;
    }

    decorations.push(
      createMarkerNodeDecoration(pos, node, serializeFootnoteDefinitionMarker(node), "persistent"),
    );

    return false;
  });
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

    decorations.push(createMarkerNodeDecoration(pos, node, marker, "subtle"));
  }
};

const addFocusedSourceNodeEditors = (state: EditorState, decorations: Decoration[]) => {
  if (!isCaretSelection(state)) {
    return;
  }

  const sourceNode = getActiveSourceNode(state);

  if (!sourceNode) {
    return;
  }

  decorations.push(
    Decoration.widget(
      sourceNode.pos,
      (view, getPos) => createSourceNodeEditor(view, getPos, sourceNode.node),
      {
        key: `source-node:${sourceNode.pos}:${sourceNode.node.type.name}`,
        side: -1,
        stopEvent: isWidgetInputEvent,
      },
    ),
  );
};

// The marker is chrome on the block it names rather than a widget in its content. A widget would
// take a document position the block's own content does not hold, and a caret aimed at that
// position resolves into a neighbouring block instead.
const createMarkerNodeDecoration = (
  pos: number,
  node: ProseMirrorNode,
  marker: string,
  variant: "persistent" | "subtle",
) =>
  Decoration.node(pos, pos + node.nodeSize, {
    class: `leafdown-marker-node leafdown-marker-node--${variant}`,
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

const getActiveSourceNode = (state: EditorState): NodeWithPos | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection)) {
    return null;
  }

  let activeNode: NodeWithPos | null = null;

  state.doc.nodesBetween(Math.max(0, selection.from - 1), selection.to + 1, (node, pos) => {
    if (!SOURCE_NODE_NAMES.has(node.type.name)) {
      return true;
    }

    if (pos <= selection.from && selection.from <= pos + node.nodeSize) {
      activeNode = { node, pos };
      return false;
    }

    return true;
  });

  return activeNode;
};

const createSourceNodeEditor = (
  view: EditorView,
  getPos: () => number | undefined,
  node: ProseMirrorNode,
) => {
  const input = createSourceInput("Markdown source", serializeSourceNode(node));

  const applySource = () => {
    const parsedAttrs = parseSourceNode(input.value, node.type.name);
    const position = getPos();

    if (!parsedAttrs || typeof position !== "number") {
      return;
    }

    const sourceNode = view.state.doc.nodeAt(position);

    if (sourceNode?.type.name !== node.type.name) {
      return;
    }

    view.dispatch(
      view.state.tr
        .setNodeMarkup(position, undefined, {
          ...sourceNode.attrs,
          ...parsedAttrs,
        })
        .scrollIntoView(),
    );
  };

  bindSourceInput(input, applySource, view);

  return input;
};

const serializeSourceNode = (node: ProseMirrorNode) => {
  return String(node.attrs.value ?? "");
};

const parseSourceNode = (source: string, nodeName: string): Record<string, unknown> | null => {
  if (nodeName === "html") {
    return { value: source };
  }

  return null;
};

// The preset also renders the label as a definition term, which spells what the persistent marker
// already spells and, being node chrome, stands outside every position the definition holds.
export const withoutFootnoteDefinitionLabelTerm = (schema: NodeSchema): NodeSchema => {
  const { toDOM } = schema;

  return {
    ...schema,
    toDOM:
      toDOM &&
      ((node) => {
        const [tag, attributes, ...rest] = toDOM(node) as [
          string,
          Record<string, unknown>,
          ...unknown[],
        ];

        return [tag, attributes, ...rest.filter((child) => !isDefinitionTerm(child))];
      }),
  };
};

const isDefinitionTerm = (child: unknown) => Array.isArray(child) && child[0] === "dt";

const serializeFootnoteDefinitionMarker = (node: ProseMirrorNode) =>
  `[^${getFootnoteLabel(node)}]:`;

const getFootnoteLabel = (node: ProseMirrorNode) =>
  String(node.attrs.label ?? node.attrs.identifier ?? node.attrs.id ?? "");

const createSourceInput = (label: string, value: string) => {
  const input = document.createElement("input");

  input.className = "leafdown-source-edit";
  input.contentEditable = "false";
  input.type = "text";
  input.value = value;
  input.setAttribute("aria-label", label);

  return input;
};

const bindSourceInput = (input: HTMLInputElement, applySource: () => void, view: EditorView) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applySource();
      view.focus();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      view.focus();
    }
  });
  input.addEventListener("blur", applySource);
};

const isWidgetInputEvent = (event: Event) => event.target instanceof HTMLInputElement;
