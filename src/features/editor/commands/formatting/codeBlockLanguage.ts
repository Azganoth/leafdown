import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  CODE_BLOCK_NODE_NAME,
  findSelectedCodeBlockPosition,
  getCodeBlockLanguageRequestPosition,
  setCodeBlockLanguageRequestMeta,
  type CodeBlockLanguageRequest,
} from "../../plugins/codeBlockLanguage";
import {
  CODE_META_ATTRIBUTE_NAME,
  DEFAULT_CODE_META,
  readCodeFenced,
} from "../../utils/codeMarkdown";

const WHITESPACE_PATTERN = /\s/u;

// Indented code has no fence line to carry an info string on.
const findEditableCodeBlock = (state: EditorState) => {
  const position = findSelectedCodeBlockPosition(state);
  const node = position === null ? null : state.doc.nodeAt(position);

  return node && readCodeFenced(node.attrs) ? position : null;
};

export const canEditCodeBlockLanguage = (state: EditorState) =>
  findEditableCodeBlock(state) !== null;

export const editCodeBlockLanguage = (view: EditorView) => {
  const position = findEditableCodeBlock(view.state);

  if (position === null) {
    return false;
  }

  view.dispatch(setCodeBlockLanguageRequestMeta(view.state.tr, { type: "open", position }));

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
