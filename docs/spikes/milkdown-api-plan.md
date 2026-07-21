# Milkdown API Plan Spike

Issue: https://github.com/Azganoth/leafdown/issues/21

Parent issue: https://github.com/Azganoth/leafdown/issues/4

Date checked: 2026-05-23

## Decision

Use Milkdown Kit directly from a Leafdown-owned React wrapper.

Install exact Milkdown versions after this spike:

- `@milkdown/kit@7.21.1`
- `@milkdown/plugin-highlight@7.21.1`
- `shiki@4.1.0`

Do not install `@milkdown/react` for Leafdown's editor foundation. The package was verified at `7.21.1`, but it depends on `@milkdown/crepe@7.21.1`. That conflicts with the current follow-up issue requirement that no Crepe package be introduced, and the adapter does not provide enough value to justify loosening that rule. A local wrapper can mount and destroy `Editor` with ordinary React effects while keeping Crepe completely absent.

If the project later chooses the official React adapter, issue #22 must be changed from "No Crepe package, imports, or styles are introduced" to "No Crepe imports, runtime usage, or styles are introduced."

## Crepe Evaluation

Crepe was rechecked after the initial spike because it is not only a built-in UI shell. It has two integration modes:

- `Crepe` is the ready-made editor. It enables most Crepe features by default: cursor, list item UI, link tooltip, image block, block edit/slash UI, placeholder, selection toolbar, CodeMirror code blocks, table UI, and LaTeX. Only top bar and AI are disabled by default.
- `CrepeBuilder` is a lower-level builder. It can add individual features manually and exposes `editor`, `getMarkdown()`, `setReadonly()`, `create()`, `destroy()`, and `on()` listener registration.

Using `Crepe` would force more built-in editor UI than Leafdown wants. It is designed for a complete out-of-the-box editing surface and expects Crepe theme CSS. Its default features also introduce behavior outside the intended editing surface, especially LaTeX, image upload UI, block handles/slash menu UI, and a selection toolbar.

`CrepeBuilder` avoids the full default UI if no features are added, but it is still opinionated. Its base editor always uses CommonMark, GFM, listener, history, indent, trailing, clipboard, and upload plugins. It sets Milkdown indent size to 4 and configures pasted or dropped images to create object URLs when no feature upload handler is provided. Those defaults are not fatal, but they are extra behavior Leafdown would need to audit or override immediately.

The package cost is also material. `@milkdown/crepe@7.21.1` depends on Vue, CodeMirror, KaTeX, DOMPurify, `remark-math`, `prosemirror-virtual-cursor`, and other UI dependencies. The package exports feature subpaths and `CrepeBuilder` can help tree-shaking, but the root `@milkdown/crepe` entry statically imports all feature modules. That makes the full `Crepe` path a poor default for a desktop app that already owns its React UI shell.

Crepe could still be useful in two narrow ways:

- as a throwaway prototype to compare Milkdown behavior quickly;
- as reference source for future local implementations of table controls, selection toolbar behavior, block handles, or CodeMirror code-block editing.

It should not be used as Leafdown's editor foundation unless the product direction changes toward adopting a Notion-like built-in editor UI. For Leafdown's current docs, use Milkdown Kit directly and evaluate individual Kit components before adopting them.

## Import Plan

Use these import paths as the starting point:

```ts
import { Editor, defaultValueCtx, editorViewCtx, rootCtx, serializerCtx } from "@milkdown/kit/core";
import { codeBlockAttr, commonmark, htmlAttr } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { $prose, getMarkdown } from "@milkdown/kit/utils";
import { highlight, highlightPluginConfig } from "@milkdown/plugin-highlight";
import { createParser } from "@milkdown/plugin-highlight/shiki";
import { getSingletonHighlighter } from "shiki";
```

Add ProseMirror base CSS where the wrapper is introduced:

```ts
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";
```

The `@milkdown/kit` package also exposes `@milkdown/kit/prose/state`, `@milkdown/kit/prose/view`, and related ProseMirror subpaths for narrow Leafdown plugins.

## Editor Lifecycle

Leafdown currently renders under `React.StrictMode`. The wrapper should create an editor in an effect and always destroy the same instance in cleanup. Because `Editor.create()` is async, the wrapper should guard against create resolving after cleanup:

```ts
useEffect(() => {
  let disposed = false;
  const editor = buildEditor(rootElement, initialMarkdown);

  editor.create().then((created) => {
    if (disposed) {
      void created.destroy();
      return;
    }

    editorRef.current = created;
  });

  return () => {
    disposed = true;
    editorRef.current = undefined;
    void editor.destroy();
  };
}, [documentKey, initialMarkdown]);
```

This gives the same StrictMode behavior expected from `@milkdown/react` without its Crepe dependency. Switching documents should either recreate the editor using a stable document key or use a documented reset path with non-history transactions.

## Serialization And Events

Use `editor.action(getMarkdown())` to retrieve Markdown while the editor is alive. Do not call serializer helpers after destroy; a local JSDOM probe showed serializer work can throw once `editorViewCtx` has been removed.

The `@milkdown/plugin-listener` `markdownUpdated` callback is debounced by 200 ms, does not fire for initial content, and skips transactions with `addToHistory === false`. That matches the product rule that opening a document does not make it dirty, but it is not an exact transaction feed.

For issue #22, expose two bridge points:

- `getMarkdown(): string` using `editor.action(getMarkdown())`.
- A documented update hook based on `listenerCtx.markdownUpdated`.

For issue #6 dirty-state work, prefer a small Leafdown `$prose` plugin that observes ProseMirror transactions directly:

- treat `tr.docChanged && tr.getMeta("addToHistory") !== false` as an editor content transaction candidate;
- mark programmatic document resets with `addToHistory: false`;
- keep the listener path for debounced serialized Markdown updates.

## Presets And Keymaps

Use `commonmark`, `gfm`, `history`, `clipboard`, and `listener` as the foundation. Milkdown CommonMark and GFM export the expected command and keymap pieces, including code-block, list, hardbreak, strikethrough, task-list, and table keymaps. Keep Milkdown defaults unless a specification requirement proves an override is necessary.

Important verified defaults:

- `codeBlockKeymap` uses `Mod-Alt-c`, matching the current spec shortcut.
- `hardbreakKeymap` provides the `Shift-Enter` hardbreak path.
- list and table behavior should be verified in-app before adding overrides.

## Raw HTML

Use Milkdown CommonMark's verified `htmlSchema` as the escaping foundation. Raw HTML is parsed into an inline atom rendered as a `span` with `data-type="html"` and `data-value`. Its text is rendered as text content, not live HTML. A local runtime probe confirmed that `<div>`, `<script>`, inline `<span>`, and event-handler-looking attributes did not create matching live DOM elements or execute script during editor mount.

Issue #23 should make this explicit with tests and CSS:

- assert block HTML, inline HTML, script tags, malformed HTML, and event-handler-looking attributes render as text;
- assert the corresponding live DOM elements are not created inside the editor;
- style `[data-type="html"]` as code-like text using Leafdown tokens;
- document any serializer normalization in fixture expectations.

No custom sanitizer or DOMPurify dependency is needed for the initial Milkdown HTML path because Leafdown is not converting raw Markdown HTML into browser DOM.

## Syntax Highlighting

Use Shiki through `@milkdown/plugin-highlight`.

Reasons:

- the architecture already requires bundled Shiki themes and grammars;
- the verified parser path is `createParser` from `@milkdown/plugin-highlight/shiki`;
- a local runtime probe confirmed `.shiki` decorations and inline styles are produced without network access.

Create one highlighter during editor setup:

```ts
const highlighter = await getSingletonHighlighter({
  themes: ["github-dark"],
  langs: ["markdown", "typescript", "javascript", "json", "rust", "bash"],
});

const parser = createParser(highlighter, { theme: "github-dark" });
```

Wrap the parser or language extractor so unknown languages fall back to plain-text highlighting. A probe showed that Shiki throws for unloaded language names, while `undefined` or `plaintext` is safe.

Issue #24 should use bundled assets only, avoid CDN/runtime fetches, and keep the language set deliberately small. Expand supported languages only after measuring bundle impact or after user-facing settings exist.

## Auto Pair And Soft Wrap

No official Milkdown auto-pair plugin was found in the verified packages. Use a small Leafdown ProseMirror-compatible plugin for auto-pair behavior:

- implement it with `$prose` and ProseMirror plugin props;
- gate it behind the `Auto pair brackets and quotes` setting;
- handle only the documented bracket and quote pairs;
- avoid Markdown structural contexts where pairing would corrupt syntax unless tests show the behavior is safe.

Code-block soft wrap should be CSS-only:

- default Off;
- when On, toggle a class or data attribute on the editor root;
- alter only code-block `white-space` and overflow styling;
- never dispatch an editor transaction and never affect serialized Markdown.

Issue #25 should use those paths unless a later Milkdown package adds an official, verified alternative.

## Follow-Up Issue Adjustments

Issue #22 should be updated before implementation:

- replace "The editor is built on Milkdown Kit and `@milkdown/react`, not Crepe" with "The editor is built on Milkdown Kit through a Leafdown-owned React wrapper, not Crepe";
- keep "No Crepe package, imports, or styles are introduced";
- add a note that `@milkdown/react@7.21.1` was rejected because it depends on `@milkdown/crepe@7.21.1`.

Issue #23 is consistent with the spike if "spike-selected approach" means the verified CommonMark `htmlSchema` plus explicit safety tests and code-like styling.

Issue #24 is consistent with the spike if it uses Shiki via `@milkdown/plugin-highlight/shiki` and handles unknown languages without throwing.

Issue #25 is consistent with the spike if auto-pair is implemented as a narrow Leafdown `$prose` plugin and code-block soft wrap remains CSS-only.

## Verification Notes

Temporary sandbox checks were run outside the repository with:

- `@milkdown/kit@7.21.1`
- `@milkdown/plugin-highlight@7.21.1`
- `@milkdown/react@7.21.1`
- `shiki@4.1.0`
- `jsdom`

Verified locally:

- project has no current `@milkdown/*` dependencies;
- package exports exist for `Editor`, `rootCtx`, `defaultValueCtx`, CommonMark, GFM, listener, serializer/get-Markdown, keymap exports, and highlight config;
- `getMarkdown()` and `serializerCtx` work while the editor is alive;
- listener updates fire after document-changing transactions once the 200 ms debounce elapses;
- raw HTML is represented as text-like `span[data-type="html"]` nodes, not live HTML;
- Shiki highlighting works with bundled package assets and no network.

## Post-Implementation Findings

Date added: 2026-05-23

Related issue: https://github.com/Azganoth/leafdown/issues/24

Issue #24 confirmed the broad spike direction, but changed several implementation details:

- The final implementation added direct `@shikijs/langs@4.1.0` and `@shikijs/themes@4.1.0` dependencies for the current language/theme set. Importing Shiki's singleton highlighter path caused the build to enumerate the full grammar/theme registry, while direct Shiki core imports kept bundled assets explicit.
- The highlight parser should be ready before `Editor.create()` and passed to Milkdown as a synchronous parser through `highlightPluginConfig`. A lazy async parser can dispatch after React StrictMode destroys the first editor mount, producing missing-context errors from the destroyed editor.
- Milkdown table DOM may be a direct `table` instead of a `.tableWrapper` container. Its imported table CSS is unlayered and can override Tailwind layer rules, so Leafdown editor presentation overrides should remain unlayered or otherwise win the cascade.
- Product direction changed after seeing the rendered ProseMirror model: Leafdown now chooses marker presentation per Markdown object. Structural block editing is already handled by Milkdown/ProseMirror, so headings use subtle caret-based markers, footnote definitions keep a persistent marker, and blockquotes, lists, tables, code blocks, and horizontal rules remain rendered structural objects without marker-driven editing affordances. Inline and source-oriented objects can still expose editable raw Markdown syntax. See `docs/decisions.md#treat-marker-presentation-as-object-specific` and `docs/specification.md#marker-visibility-and-presentation`.
