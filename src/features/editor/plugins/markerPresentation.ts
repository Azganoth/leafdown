import type { Mark, Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { isNonNullish } from "@/lib/predicates";

import {
  getCandidateMarksAtSelection,
  getMarkRangeAtSelection,
  type ActiveMarkRange,
} from "../utils/marks";
import { isCaretSelection, isTextCaretSelection } from "../utils/selections";
import { getRangeText } from "../utils/textRanges";

export const leafdownMarkerPresentationPluginKey = new PluginKey("leafdownMarkerPresentation");

interface NodeWithPos {
  node: ProseMirrorNode;
  pos: number;
}

interface ParsedMarkSource {
  attrs?: Record<string, unknown>;
  text: string;
}

const INLINE_SOURCE_MARK_NAMES = ["inlineCode", "link"] as const;
const SOURCE_NODE_NAMES = new Set(["footnote_reference", "html"]);

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
  addFocusedInlineSourceEditor(state, decorations);
  addFocusedSourceNodeEditors(state, decorations);

  return decorations;
};

const addPersistentFootnoteDefinitionMarkers = (state: EditorState, decorations: Decoration[]) => {
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "footnote_definition") {
      return true;
    }

    decorations.push(
      createPersistentMarkerWidget(
        pos + 1,
        serializeFootnoteDefinitionMarker(node),
        `footnote-definition:${pos}`,
      ),
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

    decorations.push(createSubtleMarkerDecoration(pos, node, marker));
  }
};

const addFocusedInlineSourceEditor = (state: EditorState, decorations: Decoration[]) => {
  if (!isCaretSelection(state)) {
    return;
  }

  const activeMarkRange = getActiveInlineSourceMarkRange(state);

  if (!activeMarkRange) {
    return;
  }

  decorations.push(
    Decoration.widget(
      activeMarkRange.from,
      (view) => createInlineSourceEditor(view, activeMarkRange),
      {
        key: `inline-source:${activeMarkRange.from}:${activeMarkRange.to}:${activeMarkRange.mark.type.name}`,
        side: -1,
        stopEvent: isWidgetInputEvent,
      },
    ),
  );
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

const createPersistentMarkerWidget = (pos: number, marker: string, key: string) =>
  Decoration.widget(
    pos,
    () => {
      const element = document.createElement("span");

      element.className = "leafdown-marker-widget leafdown-marker-widget--persistent";
      element.contentEditable = "false";
      element.textContent = marker;

      return element;
    },
    {
      key,
      side: -1,
      stopEvent: () => true,
    },
  );

const createSubtleMarkerDecoration = (pos: number, node: ProseMirrorNode, marker: string) =>
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

const getActiveInlineSourceMarkRange = (state: EditorState): ActiveMarkRange | null => {
  const { selection } = state;

  if (!isTextCaretSelection(selection)) {
    return null;
  }

  const markTypes = INLINE_SOURCE_MARK_NAMES.map((markName) => state.schema.marks[markName]).filter(
    isNonNullish,
  );
  const candidateMarks = getCandidateMarksAtSelection(state);
  const activeMark =
    INLINE_SOURCE_MARK_NAMES.map((markName) =>
      candidateMarks.find((mark) => mark.type.name === markName && markTypes.includes(mark.type)),
    ).find(Boolean) ?? null;

  if (!activeMark) {
    return null;
  }

  return getMarkRangeAtSelection(state, activeMark);
};

const createInlineSourceEditor = (view: EditorView, range: ActiveMarkRange) => {
  const input = createSourceInput("Inline Markdown", serializeMarkSource(view.state, range));
  let applied = false;

  const applySource = () => {
    if (applied) {
      return;
    }

    const parsed = parseMarkSource(input.value, range.mark.type.name);

    if (!parsed) {
      return;
    }

    const mark = range.mark.type.create({
      ...range.mark.attrs,
      ...parsed.attrs,
    });
    const textNode = view.state.schema.text(
      parsed.text,
      mark.addToSet(getPreservedInlineSourceMarks(view.state, range)),
    );
    const tr = view.state.tr.replaceWith(range.from, range.to, textNode);

    applied = true;
    dispatchWithTextSelection(view, tr, range.from + parsed.text.length);
  };

  bindSourceInput(input, applySource, view);

  return input;
};

const getPreservedInlineSourceMarks = (state: EditorState, range: ActiveMarkRange) => {
  let commonMarks: Mark[] | null = null;

  state.doc.nodesBetween(range.from, range.to, (node) => {
    if (!node.isText) {
      return true;
    }

    const nodeMarks = node.marks.filter((mark) => mark.type !== range.mark.type);
    commonMarks =
      commonMarks === null ? nodeMarks : commonMarks.filter((mark) => mark.isInSet(nodeMarks));

    return true;
  });

  return commonMarks ?? [];
};

const serializeMarkSource = (state: EditorState, range: ActiveMarkRange) => {
  const text = getRangeText(state.doc, range);

  switch (range.mark.type.name) {
    case "strike_through":
      return `~~${text}~~`;

    case "inlineCode":
      return `\`${text}\``;

    case "link":
      return serializeLinkSource(text, range.mark);

    default:
      return text;
  }
};

const serializeLinkSource = (text: string, mark: Mark) => {
  const href = String(mark.attrs.href ?? "");
  const title = mark.attrs.title ? ` "${String(mark.attrs.title).replaceAll('"', '\\"')}"` : "";

  return text === href && href ? `<${href}>` : `[${text}](${href}${title})`;
};

const parseMarkSource = (source: string, markName: string): ParsedMarkSource | null => {
  switch (markName) {
    case "strike_through":
      return parseWrappedSource(source, /^~~(?<text>.+)~~$/u);

    case "inlineCode":
      return parseWrappedSource(source, /^`(?<text>.+)`$/u);

    case "link":
      return parseLinkSource(source);

    default:
      return null;
  }
};

const parseWrappedSource = (source: string, pattern: RegExp): ParsedMarkSource | null => {
  const match = pattern.exec(source.trim());
  const text = match?.groups?.text;

  if (!text) {
    return null;
  }

  return { text };
};

const parseLinkSource = (source: string): ParsedMarkSource | null => {
  const autolink = /^<(?<target>[^<>]+)>$/u.exec(source.trim());

  if (autolink?.groups?.target) {
    return {
      attrs: { href: autolink.groups.target, title: null },
      text: autolink.groups.target,
    };
  }

  const match = /^\[(?<text>.*)\]\((?<body>.*)\)$/u.exec(source.trim());
  const groups = match?.groups;

  if (!groups?.text) {
    return null;
  }

  const body = groups.body.trim();
  const titleMatch = /^(?<href>.*)\s+"(?<title>[^"]*)"\s*$/u.exec(body);

  return {
    attrs: {
      href: titleMatch?.groups?.href.trim() ?? body,
      title: titleMatch?.groups?.title ?? null,
    },
    text: groups.text,
  };
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
  if (node.type.name === "footnote_reference") {
    return `[^${getFootnoteLabel(node)}]`;
  }

  return String(node.attrs.value ?? "");
};

const parseSourceNode = (source: string, nodeName: string): Record<string, unknown> | null => {
  if (nodeName === "footnote_reference") {
    const label = /^\[\^(?<label>[^\]]+)\]$/u.exec(source.trim())?.groups?.label;

    if (!label) {
      return null;
    }

    return { label };
  }

  if (nodeName === "html") {
    return { value: source };
  }

  return null;
};

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

const dispatchWithTextSelection = (view: EditorView, tr: Transaction, position: number) => {
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, position)).scrollIntoView());
};

const isWidgetInputEvent = (event: Event) => event.target instanceof HTMLInputElement;
