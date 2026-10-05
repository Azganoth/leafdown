import { parserCtx } from "@milkdown/kit/core";

import type { Disposable } from "@/lib/lifecycle";

import { createMilkdownEditor } from "./createMilkdownEditor";
import { getSearchableText } from "./textSearch";

export interface MarkdownSearchTextParser extends Disposable {
  /** The searchable text of a Markdown file, as the editor would read it once the file opens. */
  read: (markdown: string) => string;
}

/**
 * Reads Markdown that no editor holds through an editor built as the document editor is, so a
 * file searched before it opens finds what the editor finds once it does. Its view stays on a
 * detached root and never receives a parsed document, so nothing is rendered or fetched.
 */
export const createMarkdownSearchTextParser = async (): Promise<MarkdownSearchTextParser> => {
  const editor = await createMilkdownEditor({
    root: document.createElement("div"),
    initialMarkdown: "",
  });

  await editor.create();

  const parse = editor.ctx.get(parserCtx);

  return {
    read: (markdown) => getSearchableText(parse(markdown)).text,
    dispose: () => {
      void editor.destroy();
    },
  };
};
