export interface MarkdownReferenceContext {
  documentPath: string | null;
  folderContextPath: string | null;
}

export const EMPTY_MARKDOWN_REFERENCE_CONTEXT = {
  documentPath: null,
  folderContextPath: null,
} satisfies MarkdownReferenceContext;
