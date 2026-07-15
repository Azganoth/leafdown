# Source Projection

Issue: https://github.com/Azganoth/leafdown/issues/44

Date checked: 2026-07-12

## Question

Which ProseMirror/Milkdown architecture should Leafdown use to expose
Markdown marker characters directly in the editor surface?

The target behavior is seamless source projection: when the caret enters a
supported inline/source Markdown object, the source marker characters should be
ordinary editable editor content. The caret should move through those marker
characters, deleting only part of a marker should be possible, and the editor
should recover without data loss when the edited syntax becomes invalid.

## Original Context

Leafdown uses Milkdown Kit directly through a Leafdown-owned React wrapper. The
installed editor packages checked for this document are:

- `@milkdown/kit@7.21.2`
- `@milkdown/plugin-highlight@7.21.2`
- `prosemirror-view@1.41.8`
- `prosemirror-model@1.25.7`
- `prosemirror-state@1.4.4`
- `prosemirror-transform@1.12.0`

At the time of the original spike, marker implementation exposed inline and
source-oriented Markdown through detached input controls:

- inline marks use widget decorations with `.leafdown-source-edit` inputs;
- footnote references and raw HTML use widget decorations with source inputs;
- images use a NodeView with `.leafdown-image-markdown-input`.

That implementation is intentionally safe, but the source text is not part of
the ProseMirror document text flow while the user is editing it.

Relevant source-of-truth docs:

- `docs/decisions.md`: Markdown files remain the source of truth; Leafdown uses
  one hybrid editor surface; marker presentation is object-specific; Milkdown Kit
  is the editor foundation.
- `docs/specification.md`: strong, emphasis, strikethrough, inline code, links,
  images, footnote references, autolinks, and raw HTML expose editable raw
  Markdown syntax; dirty state is triggered only by actual user transaction
  events in editor history; invalid or unusual Markdown should not crash.
- `docs/spikes/milkdown-api-plan.md`: Milkdown Kit direct integration is the
  foundation; programmatic housekeeping transactions should be marked out of
  history; `getMarkdown()` is the serialization bridge.

## Current Architecture

Issue #63 generalized the original mark-specific implementation into a shared
source-projection session engine with object-specific adapters.

- The plugin owns the active session, projected range, projection-local history,
  transaction metadata, dirty-state integration, finalization, and the
  restore-before-commit native-history bridge.
- Every target stores its exact original ProseMirror `Slice` as immutable session
  data. Clean finalization restores that content exactly; edited finalization
  restores it before committing the adapter-produced replacement.
- Registered adapters own target discovery and precedence, source generation,
  entry and clean-restoration transforms, validation and rehydration,
  presentation spans, and selection mapping.
- Adapters distinguish semantic source owned by their target from ambient marks
  that are not exposed for editing. Ambient context remains adapter-owned rather
  than leaking into projected source.
- Active source is unmarked, editable document text. Invalid source commits as
  literal document text so no projected character is lost.
- The mark adapter preserves source behavior for strong, emphasis,
  strikethrough, and inline code.
- A higher-precedence logical-link adapter owns links and autolinks as complete
  wrappers, including mixed-format and multiline labels. It validates source
  through Milkdown's parser and Remark AST, maps selections across nested label
  syntax and semantic inline breaks, and rehydrates a rich inline fragment with
  one link mark over the full label.
- A serialization wrapper preserves one logical outer link in saved Markdown
  when Milkdown's default serializer would split a mixed-format label into
  adjacent links. Its placeholders exist only in a temporary serialization
  document and never enter editor state or history.
- An atomic footnote-reference adapter owns complete `[^label]` source,
  left/right and node-selection entry mapping, Milkdown-backed validation,
  canonical node rehydration, ambient-mark preservation, and literal fallback.
  It does not share the logical-link implementation or modify footnote
  definitions.

The implementation is split between
`src/features/editor/plugins/sourceProjection.ts`, the shared lifecycle engine;
`src/features/editor/utils/sourceProjectionAdapters.ts`, the adapter contract,
registry, and current mark adapter; and
`src/features/editor/utils/sourceProjectionSyntax.ts`, the current mark syntax
parser and source builder. Logical-link behavior is split between
`sourceProjectionLinkAdapter.ts`, `sourceProjectionLinkSyntax.ts`, and
`logicalLinkMarkdown.ts`. Footnote-reference behavior lives in
`sourceProjectionFootnoteReferenceAdapter.ts`. Marker presentation remains a
separate capability.

## Original Probe Results

Focused probes were added in
`src/features/editor/plugins/sourceProjectionSpike.test.tsx`.

Findings:

- Current `.leafdown-source-edit` widgets display source text but the editor
  document text remains canonical rendered content. For `**Bold** plain`, the
  widget value is `**Bold**`, but `view.state.doc.textContent` is `Bold plain`.
- Replacing the active strong range with plain ProseMirror text can make marker
  characters real editable document content. Projection entry can be marked with
  `addToHistory: false`, so it does not trigger the current dirty tracker.
- User edits inside projected source text are ordinary document-changing
  transactions and do trigger dirty tracking.
- A valid projected strong source can be committed back to canonical Milkdown
  mark content and serialize as Markdown.
- A partially deleted marker can be committed as literal fallback text. Milkdown
  then escapes the literal marker characters during Markdown serialization, which
  preserves content without pretending invalid syntax is still a mark.
- A naive history strategy is not sufficient: projection entry and commit both
  marked as `addToHistory: false` allow undo of the source edit, but redo is not
  available afterward. The implementation needs explicit projection-session
  history handling rather than simply excluding entry and commit transactions
  from history.
- Current detached input editing is outside editor history until the input value
  is applied back to the document.

## Candidate Approaches

### Temporary Source-Projection Mode

Replace the active inline object with editable source text while it is active,
then commit the edited source back to the canonical Milkdown model on exit,
save, or other forced serialization boundary.

Assessment: preferred direction.

This is the only evaluated approach that can make marker characters ordinary
ProseMirror-editable text without replacing the editor engine. It supports the
desired caret path because the projected markers are actual document text while
active.

Required architecture:

- Keep Milkdown's canonical CommonMark/GFM model as the default document model.
- Add a Leafdown source projection plugin that owns projection state, source
  range mapping, entry/exit, parse status, and commit/fallback behavior.
- Projection entry replaces the active supported object with editable source
  text and maps the caret into the source string.
- Projection text is styled through decorations or a narrow transient marker,
  but the marker characters themselves must be real text nodes.
- User edits inside the projected source remain ordinary editor transactions.
- Projection commit parses source text back to canonical Milkdown content when
  valid.
- Invalid source commits as literal text, preserving user content without data
  loss.
- Save-time `getMarkdown()` must force active projection finalization before
  returning Markdown.
- The implementation must include a deliberate projection-session history bridge.
  The naive "entry/commit are both non-history transactions" path drops redo.

### Decoration Or Widget Projection

Use inline/widget decorations to display markers and intercept editing behavior.

Assessment: rejected for seamless editing.

Inline decorations can only add attributes around existing inline content, and
widget decorations sit at a document position. They are appropriate for subtle
markers, persistent markers, and detached controls, but they do not create
editable text positions for marker characters. Making them feel editable would
require keyboard, selection, deletion, clipboard, and IME emulation around
synthetic DOM. That is the brittle keyboard-hack path issue #44 is meant to
avoid.

### Schema Or Model Extension

Represent Markdown marker syntax explicitly in the editor model.

Assessment: reject as a permanent model replacement; allow only a narrow
transient projection detail if needed.

A full schema rewrite where Markdown markers are permanent document nodes would
fight Milkdown's CommonMark/GFM presets, command layer, parser, serializer,
clipboard behavior, and existing mark/node assumptions. It would also move
Leafdown toward owning a Markdown editor engine rather than extending
ProseMirror/Milkdown.

A small transient `sourceProjection` mark or node is acceptable if the
implementation needs it to style active source text, suppress input rules, or
track projection state. It must not become saved semantic content and must be
committed or converted to literal fallback before serialization.

### Keep Current Source Inputs

Retain detached source inputs and document why seamless source projection is too
risky.

Assessment: safe fallback, but not the target experience.

The current input controls are still the fallback for unsupported objects while
source projection is implemented incrementally. They preserve source safely, but
they cannot support truly inline caret movement through marker characters, normal
partial-marker deletion, or editor-native undo/redo for the draft input text.

## Probe Plan

The spike should verify the recommended architecture before implementation:

1. Confirm whether temporary source projection can keep projected source as real
   ProseMirror text while suppressing projection entry/exit from dirty tracking.
2. Confirm undo and redo semantics when projection entry/exit are not added to
   history but user edits are.
3. Confirm `getMarkdown()` can commit or normalize an active projection before
   save-time serialization.
4. Confirm invalid projected source can fall back to literal text without
   crashes or data loss.
5. Confirm decoration/widget projection cannot satisfy normal caret movement and
   editable marker requirements without custom keyboard emulation.

## Decision

Use temporary source-projection mode for the seamless inline Markdown marker
architecture.

Do not reimplement ProseMirror and do not replace Milkdown's canonical document
model. Leafdown should add a focused source projection plugin on top of the
existing Milkdown Kit integration. The plugin may use decorations for styling
and may use a narrow transient projection marker if required, but it must keep
the actual projected marker characters as editable document text while active.

The first implementation must not rely on the naive history path probed here.
Undo/redo is the highest-risk part of the architecture. The follow-up issue
should require an explicit projection-session history design before broadening
syntax support.

## Original Implementation Slice

Implement strong and emphasis only.

Scope constraints:

- same parent text range only;
- no nested mark projection in the first slice;
- no links, autolinks, footnote references, raw HTML, or images;
- existing source inputs remain for unsupported source-oriented objects.

Required behavior:

- Enter projection when the caret is inside a supported strong or emphasis mark.
- Map caret positions into opening marker, text, and closing marker source
  positions.
- Make marker characters ordinary editable document text while projected.
- Suppress Markdown mark input rules while the caret is inside projection text,
  so editing projected markers does not immediately reparse behind the user's
  back.
- Track valid and invalid projected source.
- Commit valid source back to canonical Milkdown marks.
- Commit invalid source as literal text.
- Force active projection finalization before `getMarkdown()` returns save
  output.
- Define and test undo/redo behavior for active and recently committed
  projection sessions.

## Edge Cases To Test

- Caret moves through each character of `**text**`, `__text__`, `*text*`, and
  `_text_`.
- Backspace/Delete removes one marker character without deleting the whole mark.
- Removing one opening or closing marker makes the projection invalid and keeps
  the source editable.
- Removing both wrapper markers converts to plain literal text on commit.
- Empty projected content, such as `****` or `** **`, does not crash.
- Typing marker characters inside projection does not trigger normal Markdown
  input rules.
- Undo and redo work while projection is active.
- Undo and redo work after projection commit.
- Dirty tracking ignores projection entry/exit housekeeping and tracks actual
  user edits.
- `onMarkdownUpdated` and saved output do not persist transient projection
  syntax accidentally.
- Copy/cut/paste inside projection uses the projected source text.
- Selection crossing into or out of a projected range exits or normalizes
  projection predictably.

## Required Docs Updates

When implementation lands, update:

- `docs/specification.md` marker behavior to distinguish detached source inputs
  from seamless source projection by supported object.
- `docs/specification.md` keyboard/undo behavior if projection sessions require
  a specific undo grouping rule.
- `docs/decisions.md` only if the implementation changes the accepted
  object-specific marker decision. The spike recommendation does not require a
  decision change.

## Original Follow-Up Issue Body

Title: `Implement source projection for strong and emphasis`

```md
### Summary

Implement the first seamless Markdown source projection slice for strong
and emphasis markers.

Leafdown should keep Milkdown/ProseMirror as the editor engine. This issue adds
a focused Leafdown projection plugin that temporarily exposes supported inline
Markdown as editable source text inside the ProseMirror document, then commits
valid source back to Milkdown's canonical model or falls back to literal text.

### Architecture

- Use temporary source-projection mode.
- Keep the default Milkdown CommonMark/GFM document model outside active
  projection sessions.
- When the caret enters a supported strong or emphasis range, replace the active
  range with editable source text and track the session in plugin state.
- Projected marker characters must be real editable document text, not widget
  DOM.
- Style projected source text with decorations or a narrow transient projection
  marker if needed.
- Suppress Markdown input rules while editing projected source.
- Commit valid projected source back to canonical Milkdown marks on exit/save.
- Commit invalid projected source as literal text.
- Force active projection finalization before `getMarkdown()` returns.
- Implement an explicit projection-session undo/redo strategy. Do not use the
  naive path where entry and commit are both non-history transactions, because
  the #44 spike showed that path drops redo after commit.

### Acceptance criteria

- Strong and emphasis markers appear as editable inline source text when active.
- Caret movement can pass through opening marker, content, and closing marker
  characters.
- Partial marker deletion is supported without crashes or data loss.
- Valid projected source commits back to canonical Milkdown marks.
- Invalid projected source falls back to literal text.
- Undo/redo works while projection is active.
- Undo/redo works after projection commit.
- Dirty state ignores projection entry/exit housekeeping and tracks actual user
  source edits.
- Save-time `getMarkdown()` serializes committed or fallback content correctly
  while projection is active.
- Existing detached source inputs remain for unsupported objects.
- Tests cover `**`, `__`, `*`, and `_` marker variants, partial deletion,
  invalid fallback, dirty tracking, serialization, and history behavior.

### Out of scope

- Links and autolinks.
- Footnote references.
- Raw HTML.
- Images.
- Permanent schema/model replacement for Markdown marker tokens.
```
