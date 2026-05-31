import type { Mark, MarkType, Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export const leafdownMarkerPresentationPluginKey = new PluginKey("leafdownMarkerPresentation");

interface TextRange {
  from: number;
  to: number;
}

interface ActiveMarkRange extends TextRange {
  mark: Mark;
}

interface NodeWithPos {
  node: ProseMirrorNode;
  pos: number;
}

interface ParsedMarkSource {
  attrs?: Record<string, unknown>;
  text: string;
}

const inlineSourceMarkNames = [
  "inlineCode",
  "link",
  "strong",
  "emphasis",
  "strike_through",
] as const;

const sourceNodeNames = new Set(["footnote_reference", "html"]);

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
  addVisualObjectAffordances(state, decorations);
  addFocusedCodeBlockLanguageControl(state, decorations);
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
      createMarkerWidget(pos + 1, serializeFootnoteDefinitionMarker(node), {
        key: `footnote-definition:${pos}`,
        persistent: true,
      }),
    );

    return false;
  });
};

const addCaretBasedMarkers = (state: EditorState, decorations: Decoration[]) => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || !selection.empty) {
    return;
  }

  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    const pos = $from.before(depth);
    const marker = getSubtleMarkerForNode($from, depth, node);

    if (!marker) {
      continue;
    }

    decorations.push(createSubtleMarkerDecoration(pos, node, marker));
  }
};

const addVisualObjectAffordances = (state: EditorState, decorations: Decoration[]) => {
  const activeRanges = getActiveVisualObjectRanges(state);

  for (const range of activeRanges) {
    decorations.push(
      Decoration.node(range.from, range.to, {
        class: "leafdown-visual-object--active",
      }),
    );
  }
};

const addFocusedCodeBlockLanguageControl = (state: EditorState, decorations: Decoration[]) => {
  const codeBlock = getActiveCodeBlock(state);

  if (!codeBlock || !isCaretSelection(state)) {
    return;
  }

  decorations.push(
    Decoration.widget(
      codeBlock.pos + 1,
      (view, getPos) => createCodeBlockLanguageControl(view, getPos, codeBlock.node),
      {
        key: `code-language:${codeBlock.pos}:${codeBlock.node.attrs.language ?? ""}`,
        side: -1,
        stopEvent: isWidgetInputEvent,
      },
    ),
  );
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

const isCaretSelection = (state: EditorState) =>
  state.selection instanceof TextSelection && state.selection.empty;

const createMarkerWidget = (
  pos: number,
  marker: string,
  { key, persistent }: { key: string; persistent: boolean },
) =>
  Decoration.widget(
    pos,
    () => {
      const element = document.createElement("span");

      element.className = persistent
        ? "leafdown-marker-widget leafdown-marker-widget--persistent"
        : "leafdown-marker-widget leafdown-marker-widget--subtle";
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

const getSubtleMarkerForNode = (
  $from: TextSelection["$from"],
  depth: number,
  node: ProseMirrorNode,
) => {
  switch (node.type.name) {
    case "heading":
      return `H${node.attrs.level ?? 1}`;

    case "blockquote":
      return ">";

    case "list_item":
      return getListItemMarker($from, depth, node);

    default:
      return null;
  }
};

const getListItemMarker = ($from: TextSelection["$from"], depth: number, node: ProseMirrorNode) => {
  if (node.attrs.checked === true) {
    return "[x]";
  }

  if (node.attrs.checked === false) {
    return "[ ]";
  }

  const parent = depth > 0 ? $from.node(depth - 1) : null;

  if (parent?.type.name === "ordered_list") {
    const order = Number(parent.attrs.order ?? 1);
    const index = $from.index(depth - 1);

    return `${order + index}.`;
  }

  if (parent?.type.name === "bullet_list") {
    return "-";
  }

  return null;
};

const getActiveVisualObjectRanges = (state: EditorState): TextRange[] => {
  const { selection } = state;
  const ranges: TextRange[] = [];

  if (selection instanceof TextSelection && selection.empty) {
    for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
      const node = selection.$from.node(depth);

      if (!isVisualObjectNode(node)) {
        continue;
      }

      const from = selection.$from.before(depth);

      ranges.push({ from, to: from + node.nodeSize });
    }
  }

  state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!isVisualObjectNode(node)) {
      return true;
    }

    if (
      selection.from <= pos + node.nodeSize &&
      selection.to >= pos &&
      !ranges.some((range) => range.from === pos)
    ) {
      ranges.push({ from: pos, to: pos + node.nodeSize });
    }

    return false;
  });

  return ranges;
};

const isVisualObjectNode = (node: ProseMirrorNode) =>
  node.type.name === "code_block" || node.type.name === "table" || node.type.name === "hr";

const getActiveCodeBlock = (state: EditorState): NodeWithPos | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection)) {
    return null;
  }

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);

    if (node.type.name !== "code_block") {
      continue;
    }

    return {
      node,
      pos: selection.$from.before(depth),
    };
  }

  return null;
};

const createCodeBlockLanguageControl = (
  view: EditorView,
  getPos: () => number | undefined,
  node: ProseMirrorNode,
) => {
  const label = document.createElement("label");
  const input = document.createElement("input");

  label.className = "leafdown-code-language-control";
  label.contentEditable = "false";
  label.textContent = "Language";
  input.className = "leafdown-code-language-input";
  input.type = "text";
  input.value = String(node.attrs.language ?? "");
  input.placeholder = "plain text";
  input.setAttribute("aria-label", "Code block language");
  label.append(input);

  const applyLanguage = () => {
    const position = getPos();

    if (typeof position !== "number") {
      return;
    }

    const codeBlock = view.state.doc.nodeAt(position - 1);

    if (codeBlock?.type.name !== "code_block") {
      return;
    }

    view.dispatch(
      view.state.tr
        .setNodeMarkup(position - 1, undefined, {
          ...codeBlock.attrs,
          language: input.value.trim(),
        })
        .scrollIntoView(),
    );
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyLanguage();
      view.focus();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      view.focus();
    }
  });
  input.addEventListener("blur", applyLanguage);

  return label;
};

const getActiveInlineSourceMarkRange = (state: EditorState): ActiveMarkRange | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null;
  }

  const markTypes = inlineSourceMarkNames
    .map((markName) => state.schema.marks[markName])
    .filter((markType): markType is MarkType => Boolean(markType));
  const candidateMarks = [
    ...(state.storedMarks ?? []),
    ...selection.$from.marks(),
    ...(selection.$from.nodeBefore?.marks ?? []),
    ...(selection.$from.nodeAfter?.marks ?? []),
  ];
  const activeMark =
    inlineSourceMarkNames
      .map((markName) =>
        candidateMarks.find((mark) => mark.type.name === markName && markTypes.includes(mark.type)),
      )
      .find(Boolean) ?? null;

  return activeMark ? getMarkRangeAtSelection(state, activeMark) : null;
};

const getMarkRangeAtSelection = (state: EditorState, mark: Mark): ActiveMarkRange | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection)) {
    return null;
  }

  const { $from } = selection;
  const parent = $from.parent;
  const cursorOffset = $from.parentOffset;
  const markedRanges: TextRange[] = [];

  parent.forEach((node, offset) => {
    if (!mark.isInSet(node.marks)) {
      return;
    }

    markedRanges.push({
      from: offset,
      to: offset + node.nodeSize,
    });
  });

  const activeRange = markedRanges.find(
    (range) => range.from <= cursorOffset && cursorOffset <= range.to,
  );

  if (!activeRange) {
    return null;
  }

  let from = activeRange.from;
  let to = activeRange.to;

  for (let index = markedRanges.indexOf(activeRange) - 1; index >= 0; index -= 1) {
    const range = markedRanges[index];

    if (range.to !== from) {
      break;
    }

    from = range.from;
  }

  for (let index = markedRanges.indexOf(activeRange) + 1; index < markedRanges.length; index += 1) {
    const range = markedRanges[index];

    if (range.from !== to) {
      break;
    }

    to = range.to;
  }

  return {
    from: $from.start() + from,
    mark,
    to: $from.start() + to,
  };
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
    const textNode = view.state.schema.text(parsed.text, [mark]);
    const tr = view.state.tr.replaceWith(range.from, range.to, textNode);

    applied = true;
    dispatchWithTextSelection(view, tr, range.from + parsed.text.length);
  };

  bindSourceInput(input, applySource, view);

  return input;
};

const serializeMarkSource = (state: EditorState, range: ActiveMarkRange) => {
  const text = state.doc.textBetween(range.from, range.to, "\n", "\n");

  switch (range.mark.type.name) {
    case "strong":
      return `**${text}**`;

    case "emphasis":
      return `*${text}*`;

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

  if (text === href && href) {
    return `<${href}>`;
  }

  return `[${text}](${href}${title})`;
};

const parseMarkSource = (source: string, markName: string): ParsedMarkSource | null => {
  switch (markName) {
    case "strong":
      return parseWrappedSource(source, /^\*\*(?<text>.+)\*\*$/u);

    case "emphasis":
      return parseWrappedSource(source, /^\*(?<text>.+)\*$/u);

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

  return text ? { text } : null;
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
    if (!sourceNodeNames.has(node.type.name)) {
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

    return label ? { label } : null;
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
