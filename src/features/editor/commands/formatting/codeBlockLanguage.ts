import { NodeSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { BlockSelection, getSelectedBlockTargets } from "../../plugins/blockSelection";
import {
  getCodeBlockLanguageRequestPosition,
  setCodeBlockLanguageRequestMeta,
  type CodeBlockLanguageRequest,
} from "../../plugins/codeBlockLanguage";
import {
  CODE_META_ATTRIBUTE_NAME,
  DEFAULT_CODE_META,
  readCodeFenced,
} from "../../utils/codeMarkdown";

const CODE_BLOCK_NODE_NAME = "code_block";
const WHITESPACE_PATTERN = /\s/u;

interface CodeBlockTarget {
  position: number;
}

const findSelectedCodeBlock = (state: EditorState): CodeBlockTarget | null => {
  const { selection } = state;

  if (selection instanceof BlockSelection) {
    const targets = getSelectedBlockTargets(selection);
    const [target] = targets;

    return targets.length === 1 && target.node.type.name === CODE_BLOCK_NODE_NAME
      ? { position: target.pos }
      : null;
  }

  if (selection instanceof NodeSelection) {
    return selection.node.type.name === CODE_BLOCK_NODE_NAME ? { position: selection.from } : null;
  }

  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === CODE_BLOCK_NODE_NAME) {
      return selection.to <= $from.end(depth) ? { position: $from.before(depth) } : null;
    }
  }

  return null;
};

// Indented code has no fence line to carry an info string on.
const findEditableCodeBlock = (state: EditorState) => {
  const target = findSelectedCodeBlock(state);
  const node = target ? state.doc.nodeAt(target.position) : null;

  return target && node && readCodeFenced(node.attrs) ? target : null;
};

export const canEditCodeBlockLanguage = (state: EditorState) =>
  findEditableCodeBlock(state) !== null;

export const editCodeBlockLanguage = (view: EditorView) => {
  const target = findEditableCodeBlock(view.state);

  if (!target) {
    return false;
  }

  view.dispatch(
    setCodeBlockLanguageRequestMeta(view.state.tr, { type: "open", position: target.position }),
  );

  return true;
};

export const closeCodeBlockLanguage = (view: EditorView) => {
  if (getCodeBlockLanguageRequestPosition(view.state) === null) {
    return false;
  }

  view.dispatch(setCodeBlockLanguageRequestMeta(view.state.tr, { type: "close" }));

  return true;
};

/** `null` for a value the info string cannot hold as one language identifier. */
export const normalizeCodeBlockLanguage = (value: string) => {
  const language = value.trim();

  return WHITESPACE_PATTERN.test(language) ? null : language;
};

// The metadata stands after the language on the fence line, so a fence without a language has
// nowhere to write it: its first word would be read back as the language.
export const applyCodeBlockLanguage = (
  view: EditorView,
  request: CodeBlockLanguageRequest,
  value: string,
) => {
  const language = normalizeCodeBlockLanguage(value);
  const { state } = view;
  const node = state.doc.nodeAt(request.position);

  if (
    language === null ||
    state.doc !== request.document ||
    getCodeBlockLanguageRequestPosition(state) !== request.position ||
    node?.type.name !== CODE_BLOCK_NODE_NAME ||
    !readCodeFenced(node.attrs)
  ) {
    return false;
  }

  const meta =
    language === "" ? DEFAULT_CODE_META : (node.attrs[CODE_META_ATTRIBUTE_NAME] as string);

  if (language === node.attrs.language && meta === node.attrs[CODE_META_ATTRIBUTE_NAME]) {
    return closeCodeBlockLanguage(view);
  }

  view.dispatch(
    state.tr.setNodeMarkup(request.position, undefined, {
      ...node.attrs,
      language,
      [CODE_META_ATTRIBUTE_NAME]: meta,
    }),
  );

  return true;
};
