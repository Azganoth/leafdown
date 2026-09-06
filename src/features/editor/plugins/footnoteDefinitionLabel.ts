import {
  Fragment,
  type Node as ProseMirrorNode,
  type ResolvedPos,
} from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $nodeSchema, $prose } from "@milkdown/kit/utils";

import {
  FOOTNOTE_DEFINITION_LABEL_NODE_NAME,
  footnoteDefinitionLabelNodeSchema,
  getFootnoteDefinitionLabel,
  getFootnoteDefinitionLabelNode,
  isFootnoteDefinitionLabel,
  isWritableFootnoteDefinitionLabel,
} from "../utils/footnoteDefinitionLabel";
import {
  findFootnoteDefinitions,
  type FootnoteDefinitionMatch,
} from "../utils/footnoteDefinitions";
import { FOOTNOTE_REFERENCE_NODE_NAME } from "../utils/sourceProjectionFootnoteReferenceSyntax";

export const leafdownFootnoteDefinitionLabelSchema = $nodeSchema(
  FOOTNOTE_DEFINITION_LABEL_NODE_NAME,
  () => footnoteDefinitionLabelNodeSchema,
);

export const leafdownFootnoteDefinitionLabelPluginKey = new PluginKey(
  "leafdownFootnoteDefinitionLabel",
);

const setLabelText = (
  transaction: Transaction,
  definition: FootnoteDefinitionMatch,
  label: ProseMirrorNode,
  text: string,
) => {
  const from = transaction.mapping.map(definition.pos + 2);
  const to = transaction.mapping.map(definition.pos + 2 + label.content.size);

  transaction.replaceWith(from, to, text ? transaction.doc.type.schema.text(text) : Fragment.empty);
};

const renameReferences = (
  transaction: Transaction,
  document: ProseMirrorNode,
  from: string,
  to: string,
) => {
  document.descendants((node, pos) => {
    if (node.type.name !== FOOTNOTE_REFERENCE_NODE_NAME || node.attrs.label !== from) {
      return true;
    }

    transaction.setNodeMarkup(transaction.mapping.map(pos), undefined, {
      ...node.attrs,
      label: to,
    });

    return false;
  });
};

const holdsLabel = (
  state: EditorState,
  definition: FootnoteDefinitionMatch,
  label: ProseMirrorNode,
) => {
  const from = definition.pos + 1;

  return state.selection.from <= from + label.nodeSize && state.selection.to >= from;
};

// The committed label is the definition's attribute and the label node holds what is being typed,
// so a definition whose two disagree has an edit in flight. Committing is derived from that
// disagreement rather than tracked as a session: whatever leaves the two apart — a caret moving
// off, `Undo` putting the earlier text back, `Redo` restoring it — is answered the same way, and
// the rename never has to be stored anywhere to be reversed.
const createLabelCommitTransaction = (state: EditorState, force: boolean) => {
  const definitions = findFootnoteDefinitions(state.doc);
  const committed = new Set(definitions.map(({ node }) => getFootnoteDefinitionLabel(node)));
  let transaction: Transaction | null = null;

  for (const definition of definitions) {
    const label = getFootnoteDefinitionLabelNode(definition.node);

    if (!label) {
      continue;
    }

    const current = getFootnoteDefinitionLabel(definition.node);
    const typed = label.textContent;

    if (typed === current || (!force && holdsLabel(state, definition, label))) {
      continue;
    }

    transaction ??= state.tr;

    // A label the file cannot be written with, or one another definition already answers to, would
    // leave the references that named it resolving somewhere the author did not ask for, so the
    // edit does not commit and the label the definition was read with stands.
    if (!isWritableFootnoteDefinitionLabel(typed) || committed.has(typed)) {
      setLabelText(transaction, definition, label, current);
      continue;
    }

    committed.delete(current);
    committed.add(typed);

    transaction.setNodeMarkup(transaction.mapping.map(definition.pos), undefined, {
      ...definition.node.attrs,
      label: typed,
    });
    renameReferences(transaction, state.doc, current, typed);
  }

  return transaction;
};

// The rename is derived from the label the document holds, so capturing it in history would put a
// second, redundant step behind every `Undo` of the typing that produced it.
const commitLabels = (state: EditorState, force: boolean) =>
  createLabelCommitTransaction(state, force)?.setMeta("addToHistory", false) ?? null;

export const commitFootnoteDefinitionLabels = (view: EditorView) => {
  const transaction = commitLabels(view.state, true);

  if (transaction) {
    view.dispatch(transaction);
  }
};

// `joinTextblocksAround` reads `isolating` only on the nodes it descends through to reach a
// textblock, so a label reached as one directly is joined into regardless of the flag. A forward
// delete never gets that far, because `findCutAfter` refuses to leave the isolating label at all.
const findLabelEndBeforeCaret = ($from: ResolvedPos) => {
  if ($from.parentOffset !== 0) {
    return null;
  }

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const index = $from.index(depth - 1);
    const parent = $from.node(depth - 1);

    if (index > 0) {
      return isFootnoteDefinitionLabel(parent.child(index - 1)) ? $from.before(depth) - 1 : null;
    }

    if (parent.type.spec.isolating) {
      return null;
    }
  }

  return null;
};

// The body opens after the label, so a backspace at its start steps into the label rather than
// pulling the body into it. The two hold different content: one names the definition and the other
// is its prose, and merging them would lose both the name and the block that carried it.
const handleBackspaceIntoLabel = (view: EditorView, event: KeyboardEvent) => {
  if (event.key !== "Backspace" || !view.state.selection.empty) {
    return false;
  }

  const labelEnd = findLabelEndBeforeCaret(view.state.selection.$from);

  if (labelEnd === null) {
    return false;
  }

  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, labelEnd)).scrollIntoView(),
  );

  return true;
};

export const createLeafdownFootnoteDefinitionLabelPlugin = () =>
  $prose(
    () =>
      new Plugin({
        key: leafdownFootnoteDefinitionLabelPluginKey,
        appendTransaction: (_transactions, _oldState, newState) => commitLabels(newState, false),
        props: {
          handleKeyDown: (view, event) => handleBackspaceIntoLabel(view, event),
        },
      }),
  );
