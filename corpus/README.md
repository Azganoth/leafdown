# Markdown Test Corpus

This repository corpus is the primary manual-testing surface for Markdown
parsing, rendering, editing, and serialization. Open this directory in Leafdown
for a broad walkthrough, or open a focused family document or subdirectory to
reduce unrelated articles in the navigator.

The corpus aims to cover syntax families and specification boundaries rather
than every possible Markdown string. Broad topics live in focused files, and
descriptive headings identify the behavior or distinction to inspect. Canonical
forms remain beside their nearest incomplete, mismatched, ambiguous, or literal
variants in the owning syntax-family file. Fixtures whose bytes,
beginning-of-file position, or end-of-file position are significant remain
isolated under descriptive filenames. Markdown input remains free of embedded
expected HTML and parser-specific assertions.

A fixture identifies its own expected state, so that a heading covering several
cases never leaves the reader deriving which case is which. Where a construct
has room for content, that content names the outcome, as in
`*asterisk opens but underscore closes_`. Where the content is itself under
test, a label outside the construct names the case, as in
``Opening-only one: `code``. Where neither fits, such as thematic breaks,
escape runs, and exact-byte fixtures, a section holds one case so its heading
is unambiguous alone. Placeholder content such as `alpha`, `foo`, or `A` and
`B` is reserved for sections where every case shares one outcome. Naming an
outcome in prose is not the same as embedding expected HTML or a
parser-specific assertion, which stay out of Markdown input.

## Dialect Boundaries

- [`commonmark/`](./commonmark/) covers CommonMark 0.31.2 core syntax.
- [`gfm/`](./gfm/) covers the formal GitHub Flavored Markdown extensions.
- [`extensions/`](./extensions/) contains deliberately nonstandard syntax. Each
  feature is isolated and must not be interpreted as CommonMark or formal GFM.
- [`interactions.md`](./interactions.md) combines syntax families where
  precedence or nesting is meaningful.
- [`stress.md`](./stress.md) contains deliberately dense or
  implementation-sensitive inputs, including parser nesting limits that are not
  normative cutoffs.
- [`practical/`](./practical/) contains coherent documents for editing,
  navigation, save/reopen, copy/paste, and Undo/Redo walkthroughs.
- [`environment/`](./environment/) covers folder shape, supported extensions,
  local resources, outside-folder references, and navigator behavior.
- [`boundaries/`](./boundaries/) contains committed exact-byte and normative
  grammar-limit fixtures.
- [`isolated/`](./isolated/) contains small committed fixtures that must reach a
  particular document position without affecting other cases.
- [`scratch/`](./scratch/) is an ignored local area for temporary documents and
  destructive edit, paste, save/reopen, Undo, and Redo testing.

Primary references are the [CommonMark 0.31.2 specification](https://spec.commonmark.org/0.31.2/)
and the [GitHub Flavored Markdown specification](https://github.github.com/gfm/).
Extension files name their syntax family directly; compatibility varies by
parser and no extension is treated as core Markdown.

## Coverage Guide

CommonMark fixtures cover characters and line endings, tabs, insecure
characters, escapes, character references, block precedence, thematic breaks,
ATX and Setext headings, indented and fenced code, the seven HTML block
conditions, link-reference definitions, paragraphs, blank lines, blockquotes,
ordered and unordered lists, code spans, emphasis and strong-emphasis delimiter
rules, links, images, autolinks, inline raw HTML, hard and soft breaks, and
textual content.

The [boundary fixtures](./boundaries/) preserve LF, CRLF, CR, mixed endings,
missing final newlines, a UTF-8 BOM, representative ASCII controls, an invalid
UTF-8 byte, tabs, an empty document, reference-label lengths, and long lines.
The [stress fixtures](./stress.md) include 32- and 33-level link-destination
nesting without treating either depth as a CommonMark conformance cutoff.

Formal GFM fixtures cover [tables](./gfm/tables.md),
[task-list items](./gfm/task-lists.md), [strikethrough](./gfm/strikethrough.md),
[autolink literals](./gfm/autolinks.md), and
[raw HTML tag filtering](./gfm/tagfilter.md).

The extension survey includes:

- [Footnotes](./extensions/footnotes.md)
- [YAML](./extensions/frontmatter/yaml.md),
  [TOML](./extensions/frontmatter/toml.md), and
  [JSON](./extensions/frontmatter/json.md) frontmatter, plus
  [not-at-start](./extensions/frontmatter/not-at-start.md) and
  [unclosed](./extensions/frontmatter/unclosed.md) boundaries
- [Dollar and LaTeX-style math](./extensions/math.md)
- [Inline, leaf, and container directives](./extensions/directives.md)
- [Definition lists](./extensions/definition-lists.md)
- [Wiki links and embeds](./extensions/wiki-links.md)
- [GitHub, MkDocs, and fenced admonitions](./extensions/admonitions.md)
- [MDX JSX and expressions](./extensions/mdx.md), plus isolated
  [ESM](./extensions/mdx-esm.md) and
  [malformed](./extensions/mdx-malformed.md) candidates
- [Citations](./extensions/citations.md)
- [Block and inline attributes](./extensions/attributes.md)
- [Highlight, subscript, superscript, insertion, and CriticMarkup-style deletion and addition](./extensions/typography.md)
- [Emoji shortcodes](./extensions/emoji.md)

## Practical Documents

- [Community garden field report](./practical/field-report.md)
- [Release review](./practical/release-review.md)
- [Extension survey](./practical/extension-survey.md)
- [Technical README](./practical/technical-readme.md)
- [Multilingual field notes](./practical/multilingual-notes.md)
- [Round-trip normalization walkthrough](./practical/round-trip.md)

![Corpus leaf](./assets/leaf.svg)
