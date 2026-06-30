import { createParser, type Parser } from "@milkdown/plugin-highlight/shiki";
import bash from "@shikijs/langs/bash";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import markdown from "@shikijs/langs/markdown";
import rust from "@shikijs/langs/rust";
import typescript from "@shikijs/langs/typescript";
import githubDark from "@shikijs/themes/github-dark";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import { AsyncLazy } from "@/lib/async";

const SHIKI_THEME = "github-dark";

const SUPPORTED_LANGUAGES = [
  "markdown",
  "typescript",
  "javascript",
  "json",
  "rust",
  "bash",
] as const;

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const SUPPORTED_LANGUAGES_SET = new Set<string>(SUPPORTED_LANGUAGES);

const LANGUAGE_ALIASES = new Map<string, SupportedLanguage>([
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

const normalizeLanguage = (language?: string): SupportedLanguage | undefined => {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const alias = LANGUAGE_ALIASES.get(normalized);
  if (alias) {
    return alias;
  }

  if (SUPPORTED_LANGUAGES_SET.has(normalized)) {
    return normalized as SupportedLanguage;
  }

  return undefined;
};

const loadParser = async (): Promise<Parser> => {
  const highlighter = await createHighlighterCore({
    themes: [githubDark],
    langs: [markdown, typescript, javascript, json, rust, bash],
    engine: createJavaScriptRegexEngine(),
  });
  const parser = createParser(highlighter, { theme: SHIKI_THEME });

  return (options) =>
    parser({
      ...options,
      language: normalizeLanguage(options.language),
    });
};

const highlightParser = new AsyncLazy(loadParser, { retryOnFailure: true });

export const createLeafdownHighlightParser = () => highlightParser.value;
