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
- [Mermaid diagrams](./extensions/mermaid.md)
- [Inline, leaf, and container directives](./extensions/directives.md)
- [Definition lists](./extensions/definition-lists.md)
- [Wiki links and embeds](./extensions/wiki-links.md)
- [Supported GitHub, MkDocs, Docusaurus, and VitePress callouts](./extensions/admonitions.md)
- [MDX JSX and expressions](./extensions/mdx.md), plus isolated
  [ESM](./extensions/mdx-esm.md) and
  [malformed](./extensions/mdx-malformed.md) candidates
- [Citations](./extensions/citations.md)
- [Block and inline attributes](./extensions/attributes.md)
- [Highlight, subscript, superscript, insertion, and CriticMarkup-style deletion and addition](./extensions/typography.md)
- [Emoji shortcodes](./extensions/emoji.md)

## Practical Documents

Syntax-family files pair recognition and source-form examples with relevant
Leafdown presentation checks. Practical documents combine them into editing
and navigation walkthroughs. For a visual
pass, use light and dark appearances at narrow and wide window sizes. Work on a
temporary copy for destructive edits; preserve the relative directory layout
when a document uses local assets or links. Restore any global settings changed
during the walkthrough.

- [Community garden field report](./practical/field-report.md): heading navigation,
  duplicate labels, skipped levels, container headings, and nested folding.
- [Release review](./practical/release-review.md)
- [Extension survey](./practical/extension-survey.md)
- [Technical README](./practical/technical-readme.md)
- [Multilingual field notes](./practical/multilingual-notes.md)
- [Round-trip form walkthrough](./practical/round-trip.md): serialization, adjacent
  source projections, marked links and images, and clipboard boundaries.
- [Deep headings only](./practical/outline-deep-headings.md): isolated H4 fallback
  when the outline's configured limit is shallower than every heading.
- [Large mixed document](./practical/large-document.md): a separate, bounded
  workload with 24 long code blocks and 12 diagrams for scrolling and deferred
  rendering and outline overflow. It is not a performance benchmark.

Presentation cases stay with their syntax families:

- [Code blocks](./commonmark/code.md#code-presentation-in-leafdown): 9/10-line
  boundaries, a 25-line highlighted example, wrapped rows, and blank lines.
- [Syntax interactions](./interactions.md#nested-blocks-collapse-independently):
  independently collapsible code inside lists, quotes, and callouts.
- [Math](./extensions/math.md#rendered-math-stays-fully-visible) and
  [Mermaid](./extensions/mermaid.md#a-rendered-diagram-stays-fully-visible): long
  sources whose rendered previews stay fully visible.
- [Footnotes](./extensions/footnotes.md#preview-navigation-and-renaming-walkthrough):
  repeated references, previews, navigation, renaming, and missing definitions.
- [Tables](./gfm/tables.md#table-layout-and-controls-in-leafdown): long cells, an
  unbroken token, mixed row heights, scrolling, and structural edits.

## Automated and Manual Checks

The suites cover different properties; passing one does not establish the others:

- [Corpus round trips](../src/features/editor/tests/corpusRoundTrip.test.ts)
  explicitly register files for either byte-identical serialization or stable
  convergence, and check that reopening preserves the document. The lists cover
  CommonMark, GFM, EOF cases, selected extensions, and the practical walkthroughs
  named there. Adding a file does not register it automatically. Keep intentional
  normalization, such as table padding, distinct from authored forms that must
  survive exactly.
- [Search text parity](../src/features/editor/tests/searchTextParity.test.ts) and
  [replacement parity](../src/features/editor/tests/searchReplacementParity.test.ts)
  recursively discover `.md` and `.markdown` files, ignoring extension case.
  They compare folder search with the opened editor; they do not assert every
  file's source identity, validate native decoding, or cover `.mdown` and `.mkd`.
- [Escaped source projection](../src/features/editor/tests/sourceProjectionEscapeCorpus.test.ts)
  checks its own explicit subset of CommonMark and GFM fixtures. Callout tests
  also exercise the admonition corpus, and desktop math tests use the math file.
- Rendering, fading, control placement, pointer and keyboard interaction, and
  navigator behavior require the manual walkthroughs or relevant desktop E2E
  scenarios. New manual inputs do not automatically extend E2E assertions.

The corpus is excluded from automatic formatting because spaces, fence spelling,
line counts, blank lines, and exact bytes can be the behavior under test. Check
changed fixtures with the relevant suites rather than formatting their examples.

![Corpus leaf](./assets/leaf.svg)
