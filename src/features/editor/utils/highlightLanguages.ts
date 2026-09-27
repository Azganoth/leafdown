// Kept apart from the highlighter so the names can be offered without loading Shiki.
export const HIGHLIGHT_LANGUAGES = [
  "markdown",
  "typescript",
  "javascript",
  "json",
  "rust",
  "bash",
] as const;

export type HighlightLanguage = (typeof HIGHLIGHT_LANGUAGES)[number];

export const HIGHLIGHT_LANGUAGE_ALIASES = new Map<string, HighlightLanguage>([
  ["md", "markdown"],
  ["ts", "typescript"],
  ["js", "javascript"],
  ["jsx", "javascript"],
  ["tsx", "typescript"],
  ["rs", "rust"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["shellscript", "bash"],
]);

const HIGHLIGHT_LANGUAGES_SET = new Set<string>(HIGHLIGHT_LANGUAGES);

export const HIGHLIGHT_LANGUAGE_IDENTIFIERS = [
  ...HIGHLIGHT_LANGUAGES,
  ...HIGHLIGHT_LANGUAGE_ALIASES.keys(),
].toSorted();

export const normalizeHighlightLanguage = (language?: string): HighlightLanguage | undefined => {
  const normalized = language?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  const alias = HIGHLIGHT_LANGUAGE_ALIASES.get(normalized);

  if (alias) {
    return alias;
  }

  return HIGHLIGHT_LANGUAGES_SET.has(normalized) ? (normalized as HighlightLanguage) : undefined;
};
