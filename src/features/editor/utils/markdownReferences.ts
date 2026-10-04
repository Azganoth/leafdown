import { $ctx } from "@milkdown/kit/utils";

export interface MarkdownReferenceContext {
  documentPath: string | null;
  folderContextPath: string | null;
}

export const EMPTY_MARKDOWN_REFERENCE_CONTEXT = {
  documentPath: null,
  folderContextPath: null,
} satisfies MarkdownReferenceContext;

/** Where commands read the document's location, which changes as the document is saved or moved. */
export const markdownReferenceContextCtx = $ctx<
  () => MarkdownReferenceContext,
  "leafdownMarkdownReferenceContext"
>(() => EMPTY_MARKDOWN_REFERENCE_CONTEXT, "leafdownMarkdownReferenceContext");
