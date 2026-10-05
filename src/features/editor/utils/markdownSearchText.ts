import { editorViewCtx, parserCtx, serializerCtx } from "@milkdown/kit/core";
import { EditorState } from "@milkdown/kit/prose/state";

import type { Disposable } from "@/lib/lifecycle";

import { createMilkdownEditor } from "./createMilkdownEditor";
import {
  planStateReplacement,
  settleStateForSave,
  type DocumentReplacementPlan,
} from "./textReplacement";
import { getSearchableText, type TextSearchQuery } from "./textSearch";

export interface MarkdownSearchTextParser extends Disposable {
  /** The searchable text of a Markdown file, as the editor would read it once the file opens. */
  read: (markdown: string) => string;
  /** What replacing every match would make of a Markdown file, as the opened editor would. */
  planReplacement: (
    markdown: string,
    query: TextSearchQuery,
    replacement: string,
  ) => DocumentReplacementPlan;
  /** The Markdown a save writes for a file opened and saved without an edit. */
  normalize: (markdown: string) => string;
}

/**
 * Reads Markdown that no editor holds through an editor built as the document editor is, so a
 * file searched before it opens finds what the editor finds once it does. Its view stays on a
 * detached root and never receives a parsed document, so nothing is rendered or fetched; a
 * replacement runs on a state of its own, with the editor's plugins but no view.
 */
export const createMarkdownSearchTextParser = async (): Promise<MarkdownSearchTextParser> => {
  const editor = await createMilkdownEditor({
    root: document.createElement("div"),
    initialMarkdown: "",
  });

  await editor.create();

  const parse = editor.ctx.get(parserCtx);
  const serialize = editor.ctx.get(serializerCtx);
  const { plugins } = editor.ctx.get(editorViewCtx).state;
  const createState = (markdown: string) => EditorState.create({ doc: parse(markdown), plugins });

  return {
    read: (markdown) => getSearchableText(parse(markdown)).text,
    planReplacement: (markdown, query, replacement) =>
      planStateReplacement(createState(markdown), query, replacement, serialize),
    normalize: (markdown) => serialize(settleStateForSave(createState(markdown)).doc),
    dispose: () => {
      void editor.destroy();
    },
  };
};
