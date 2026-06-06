# Inline Source Projection Spike

Issue: https://github.com/Azganoth/leafdown/issues/44

Date checked: 2026-06-06

## Question

Which ProseMirror/Milkdown architecture should Leafdown use to expose inline
Markdown marker characters directly in the editor surface?

The target behavior is seamless source projection: when the caret enters a
supported inline/source Markdown object, the source marker characters should be
ordinary editable editor content. The caret should move through those marker
characters, deleting only part of a marker should be possible, and the editor
should recover without data loss when the edited syntax becomes invalid.

## Context

Leafdown currently uses Milkdown Kit directly through a Leafdown-owned React
wrapper. The installed editor packages checked for this spike are:

- `@milkdown/kit@7.21.1`
- `@milkdown/plugin-highlight@7.21.1`
- `prosemirror-view@1.41.8`
- `prosemirror-model@1.25.7`
- `prosemirror-state@1.4.4`
- `prosemirror-transform@1.12.0`

The current marker implementation exposes inline and source-oriented Markdown
through detached input controls:

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

## Candidate Approaches

### Temporary Source-Projection Mode

Replace the active inline object with editable source text while it is active,
then commit the edited source back to the canonical Milkdown model on exit,
save, or other forced serialization boundary.

Initial assessment: preferred direction, pending probe results.

### Decoration Or Widget Projection

Use inline/widget decorations to display markers and intercept editing behavior.

Initial assessment: rejected for seamless editing because decorations are
presentation, not document text.

### Schema Or Model Extension

Represent Markdown marker syntax explicitly in the editor model.

Initial assessment: useful as a fallback or narrow transient implementation
detail, but too invasive as a permanent document model for the MVP path.

### Keep Current Source Inputs

Retain detached source inputs and document why seamless source projection is too
risky.

Initial assessment: safe fallback, but does not meet the desired caret and
partial-marker editing behavior.

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

Pending probe results.

## Follow-Up Issue Body

Pending final spike decision.
