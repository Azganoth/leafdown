import { Fragment, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $nodeSchema, $prose } from "@milkdown/kit/utils";

import {
  AUTHORED_TITLE_ATTRIBUTE_NAME,
  decodeCharacterReferences,
  decodeMarkdownText,
  readWrittenTitle,
  resolveMarkdownEscapes,
} from "../utils/characterReferenceMarkdown";
import {
  chooseTitleMarker,
  readTitleMarker,
  TITLE_MARKER_ATTRIBUTE_NAME,
  TITLE_MARKER_PAIRS,
} from "../utils/markdownTitle";
import {
  DEFINITION_DESTINATION_NODE_NAME,
  DEFINITION_LABEL_NODE_NAME,
  DEFINITION_NODE_NAME,
  DEFINITION_TITLE_NODE_NAME,
  definitionDestinationNodeSchema,
  definitionLabelNodeSchema,
  definitionTitleNodeSchema,
  getDefinitionFieldNodes,
  isWritableReferenceDefinitionLabel,
  normalizeReferenceLabel,
  readDefinitionAttrs,
  readDestinationMarker,
  readDestinationSeparator,
  readReferenceType,
  readTitleSeparator,
  REFERENCE_LABEL_ATTRIBUTE_NAME,
  usesAngleDestination,
} from "../utils/referenceLinkMarkdown";

export const leafdownDefinitionLabelSchema = $nodeSchema(
  DEFINITION_LABEL_NODE_NAME,
  () => definitionLabelNodeSchema,
);

export const leafdownDefinitionDestinationSchema = $nodeSchema(
  DEFINITION_DESTINATION_NODE_NAME,
  () => definitionDestinationNodeSchema,
);

export const leafdownDefinitionTitleSchema = $nodeSchema(
  DEFINITION_TITLE_NODE_NAME,
  () => definitionTitleNodeSchema,
);

export const leafdownReferenceDefinitionFieldsPluginKey = new PluginKey<DecorationSet>(
  "leafdownReferenceDefinitionFields",
);

interface DefinitionMatch {
  destinationPos: number;
  labelPos: number;
  node: ProseMirrorNode;
  pos: number;
  titlePos: number;
}

interface ReferenceUpdate {
  fromIdentifier: string;
  label: string;
  title: string;
  url: string;
}

const findDefinitions = (document: ProseMirrorNode) => {
  const definitions: DefinitionMatch[] = [];

  document.descendants((node, pos) => {
    if (node.type.name !== DEFINITION_NODE_NAME) {
      return node.isBlock;
    }

    const fields = getDefinitionFieldNodes(node);

    if (fields) {
      const labelPos = pos + 1;
      const destinationPos = labelPos + fields.label.nodeSize;

      definitions.push({
        destinationPos,
        labelPos,
        node,
        pos,
        titlePos: destinationPos + fields.destination.nodeSize,
      });
    }

    return false;
  });

  return definitions;
};

const fieldIsSelected = (_state: EditorState, _pos: number, node: ProseMirrorNode) => {
  const selection = _state.selection;

  return (
    selection instanceof TextSelection &&
    (selection.$from.parent === node || selection.$to.parent === node)
  );
};

const setFieldText = (
  transaction: Transaction,
  pos: number,
  node: ProseMirrorNode,
  text: string,
) => {
  const from = transaction.mapping.map(pos + 1);
  const to = transaction.mapping.map(pos + 1 + node.content.size);

  transaction.replaceWith(from, to, text ? transaction.doc.type.schema.text(text) : Fragment.empty);
};

const referenceUpdateFor = (updates: readonly ReferenceUpdate[], label: unknown) => {
  if (typeof label !== "string") {
    return null;
  }

  const identifier = normalizeReferenceLabel(label);

  return updates.find(({ fromIdentifier }) => fromIdentifier === identifier) ?? null;
};

const updateReferences = (
  transaction: Transaction,
  document: ProseMirrorNode,
  updates: readonly ReferenceUpdate[],
) => {
  document.descendants((node, pos) => {
    if (node.type.name === "image" && readReferenceType(node.attrs) !== null) {
      const update = referenceUpdateFor(updates, node.attrs[REFERENCE_LABEL_ATTRIBUTE_NAME]);

      if (update) {
        transaction.setNodeMarkup(transaction.mapping.map(pos), undefined, {
          ...node.attrs,
          [REFERENCE_LABEL_ATTRIBUTE_NAME]: update.label,
          src: update.url,
          title: update.title,
        });
      }

      return false;
    }

    if (!node.isText) {
      return true;
    }

    for (const mark of node.marks) {
      if (mark.type.name !== "link" || readReferenceType(mark.attrs) === null) {
        continue;
      }

      const update = referenceUpdateFor(updates, mark.attrs[REFERENCE_LABEL_ATTRIBUTE_NAME]);

      if (!update) {
        continue;
      }

      const from = transaction.mapping.map(pos);
      const to = transaction.mapping.map(pos + node.nodeSize);

      transaction.removeMark(from, to, mark);
      transaction.addMark(
        from,
        to,
        mark.type.create({
          ...mark.attrs,
          [REFERENCE_LABEL_ATTRIBUTE_NAME]: update.label,
          href: update.url,
          title: update.title || null,
        }),
      );
    }

    return false;
  });
};

const getAuthoredTitle = (source: string, title: string) => {
  const authored = resolveMarkdownEscapes(source);

  return authored !== title && decodeCharacterReferences(authored) === title ? authored : null;
};

const definitionHasCaret = (state: EditorState, definition: DefinitionMatch) =>
  state.selection instanceof TextSelection &&
  state.selection.empty &&
  definition.pos < state.selection.from &&
  state.selection.from < definition.pos + definition.node.nodeSize;

const createTitlePrefixDecoration = (position: number, content: string) =>
  Decoration.widget(
    position,
    (view, getPos) => {
      const prefix = document.createElement("span");

      prefix.className = "leafdown-definition-title-prefix";
      prefix.dataset.definitionTitlePrefix = "";
      prefix.textContent = content;
      prefix.contentEditable = "false";

      prefix.addEventListener("mousedown", (event) => {
        if (event.button !== 0) {
          return;
        }

        const pos = getPos();

        if (pos === undefined) {
          return;
        }

        event.preventDefault();
        view.focus();
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)).scrollIntoView(),
        );
      });

      return prefix;
    },
    {
      key: ["definition-title-prefix", position, content].join(":"),
      side: -1,
      stopEvent: (event) => event.type === "mousedown",
    },
  );

const createDefinitionCommitTransaction = (state: EditorState, force: boolean) => {
  const definitions = findDefinitions(state.doc);
  const updates: ReferenceUpdate[] = [];
  const claimed = new Set<string>();
  let transaction: Transaction | null = null;

  for (const definition of definitions) {
    const fields = getDefinitionFieldNodes(definition.node);

    if (!fields) {
      continue;
    }

    const current = readDefinitionAttrs(definition.node.attrs);
    const currentIdentifier = normalizeReferenceLabel(current.label);
    const ownsReferences = !claimed.has(currentIdentifier);

    claimed.add(currentIdentifier);

    const attrs = { ...definition.node.attrs };
    let changed = false;
    let label = current.label;
    let title = current.title;
    let url = current.url;

    const typedLabel = fields.label.textContent;

    if (
      typedLabel !== current.label &&
      (force || !fieldIsSelected(state, definition.labelPos, fields.label))
    ) {
      const typedIdentifier = normalizeReferenceLabel(typedLabel);
      const collides = definitions.some(
        ({ node }) =>
          node !== definition.node &&
          normalizeReferenceLabel(readDefinitionAttrs(node.attrs).label) === typedIdentifier,
      );

      transaction ??= state.tr;

      if (!isWritableReferenceDefinitionLabel(typedLabel) || collides) {
        setFieldText(transaction, definition.labelPos, fields.label, current.label);
      } else {
        attrs.label = typedLabel;
        label = typedLabel;
        changed = true;
      }
    }

    const typedDestination = fields.destination.textContent;

    if (
      typedDestination !== current.url &&
      (force || !fieldIsSelected(state, definition.destinationPos, fields.destination))
    ) {
      attrs.url = typedDestination;
      url = typedDestination;
      changed = true;
    }

    const currentTitleSource = readWrittenTitle(current, current.title).title;
    const typedTitle = fields.title.textContent;

    if (
      typedTitle !== currentTitleSource &&
      (force || !fieldIsSelected(state, definition.titlePos, fields.title))
    ) {
      title = decodeMarkdownText(typedTitle);
      attrs.title = title;
      attrs[AUTHORED_TITLE_ATTRIBUTE_NAME] = getAuthoredTitle(typedTitle, title);
      attrs[TITLE_MARKER_ATTRIBUTE_NAME] = typedTitle
        ? chooseTitleMarker(typedTitle, readTitleMarker(current))
        : '"';
      changed = true;
    }

    if (!changed) {
      continue;
    }

    transaction ??= state.tr;
    transaction.setNodeMarkup(transaction.mapping.map(definition.pos), undefined, attrs);

    if (ownsReferences) {
      updates.push({ fromIdentifier: currentIdentifier, label, title, url });
    }
  }

  if (transaction && updates.length > 0) {
    updateReferences(transaction, state.doc, updates);
  }

  return transaction;
};

const createChromeDecorations = (state: EditorState) => {
  const decorations: Decoration[] = [];

  for (const definition of findDefinitions(state.doc)) {
    const fields = getDefinitionFieldNodes(definition.node);

    if (!fields) {
      continue;
    }

    const attrs = readDefinitionAttrs(definition.node.attrs);
    const angle = usesAngleDestination(
      fields.destination.textContent,
      readDestinationMarker(attrs),
    );
    const title = fields.title.textContent;
    const titleMarker = title ? chooseTitleMarker(title, readTitleMarker(attrs)) : '"';
    const [titleOpening, titleClosing] = TITLE_MARKER_PAIRS[titleMarker];

    const titlePosition = definition.titlePos + 1;
    const showsTitlePlaceholder = !title && definitionHasCaret(state, definition);

    decorations.push(
      Decoration.node(definition.labelPos, definition.labelPos + fields.label.nodeSize, {
        "data-after": "]:",
        "data-before": "[",
      }),
      Decoration.node(
        definition.destinationPos,
        definition.destinationPos + fields.destination.nodeSize,
        {
          "data-after": angle ? ">" : "",
          "data-before": `${readDestinationSeparator(attrs)}${angle ? "<" : ""}`,
        },
      ),
      Decoration.node(definition.titlePos, definition.titlePos + fields.title.nodeSize, {
        "data-after": title ? titleClosing : showsTitlePlaceholder ? ' title (optional) "' : "",
        ...(showsTitlePlaceholder ? { "data-placeholder": "" } : {}),
      }),
    );

    if (title) {
      decorations.push(
        createTitlePrefixDecoration(titlePosition, readTitleSeparator(attrs) + titleOpening),
      );
    } else if (showsTitlePlaceholder) {
      decorations.push(createTitlePrefixDecoration(titlePosition, readTitleSeparator(attrs) + '"'));
    }
  }

  return DecorationSet.create(state.doc, decorations);
};

const handleFieldKeyDown = (view: EditorView, event: KeyboardEvent) => {
  const { $from } = view.state.selection;

  if (event.key === "Enter" && $from.parent.type.name.startsWith("definition_")) {
    return true;
  }

  if (
    event.key !== "ArrowRight" ||
    !view.state.selection.empty ||
    $from.parent.type.name !== DEFINITION_DESTINATION_NODE_NAME ||
    $from.parentOffset !== $from.parent.content.size
  ) {
    return false;
  }

  const titleStart = $from.after() + 1;

  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, titleStart)).scrollIntoView(),
  );

  return true;
};

const handleFieldMouseDown = (view: EditorView, event: MouseEvent) => {
  if (event.button !== 0 || !(event.target instanceof Element)) {
    return false;
  }

  const title = event.target.closest('[data-type="definition-title"][data-placeholder]');

  if (!title || !view.dom.contains(title)) {
    return false;
  }

  event.preventDefault();
  view.focus();
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, view.posAtDOM(title, 0)))
      .scrollIntoView(),
  );

  return true;
};

export const commitReferenceDefinitionFields = (view: EditorView) => {
  const transaction = createDefinitionCommitTransaction(view.state, true);

  if (transaction) {
    view.dispatch(transaction.setMeta("addToHistory", false));
  }
};

export const createLeafdownReferenceDefinitionFieldsPlugin = () =>
  $prose(
    () =>
      new Plugin({
        key: leafdownReferenceDefinitionFieldsPluginKey,
        state: {
          init: (_config, state) => createChromeDecorations(state),
          apply: (transaction, decorations, oldState, newState) =>
            transaction.docChanged || !oldState.selection.eq(newState.selection)
              ? createChromeDecorations(newState)
              : decorations.map(transaction.mapping, transaction.doc),
        },
        appendTransaction: (_transactions, _oldState, newState) =>
          createDefinitionCommitTransaction(newState, false)?.setMeta("addToHistory", false) ??
          null,
        props: {
          decorations: (state) =>
            leafdownReferenceDefinitionFieldsPluginKey.getState(state) ?? null,
          handleDOMEvents: {
            mousedown: handleFieldMouseDown,
          },
          handleKeyDown: handleFieldKeyDown,
        },
      }),
  );
