import { createParser, type Parser } from "@milkdown/plugin-highlight/shiki";
import bash from "@shikijs/langs/bash";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import markdown from "@shikijs/langs/markdown";
import mermaid from "@shikijs/langs/mermaid";
import rust from "@shikijs/langs/rust";
import typescript from "@shikijs/langs/typescript";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import { AsyncLazy } from "@/lib/async";

import { normalizeHighlightLanguage } from "./highlightLanguages";

// `defaultColor: false` keeps either palette from being written as a bare `color`, which would
// leak one appearance into the other. Each token carries both as variables instead, and the editor
// stylesheet paints the one the appearance in effect selects.
const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const;

const highlighterCore = new AsyncLazy(
  () =>
    createHighlighterCore({
      themes: [githubLight, githubDark],
      langs: [markdown, mermaid, typescript, javascript, json, rust, bash],
      engine: createJavaScriptRegexEngine(),
    }),
  { retryOnFailure: true },
);

export const loadLeafdownHighlighter = () => highlighterCore.value;

const loadParser = async (): Promise<Parser> => {
  const highlighter = await highlighterCore.value;
  const parser = createParser(highlighter, { themes: SHIKI_THEMES, defaultColor: false });

  return (options) =>
    parser({
      ...options,
      language: normalizeHighlightLanguage(options.language),
    });
};

const highlightParser = new AsyncLazy(loadParser, { retryOnFailure: true });

export const createLeafdownHighlightParser = () => highlightParser.value;
