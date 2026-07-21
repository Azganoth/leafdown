# Source Projection Design Record

**Status:** Completed technical spike.

**Origin:** [Issue #44](https://github.com/Azganoth/leafdown/issues/44), completed by the generalized session engine in [issue #63](https://github.com/Azganoth/leafdown/issues/63).

## Outcome

Leafdown uses temporary source projection for supported inline Markdown objects. Projection exposes the object's Markdown as unmarked, editable document text while Milkdown retains its canonical document model. A valid edit rehydrates semantic editor content; an invalid edit becomes literal text so no projected character is lost.

The shared projection engine owns the active session, projected range, projection-local history, dirty-state integration, and finalization. Object-specific adapters own discovery, source generation, validation, rehydration, presentation spans, and selection mapping. Ownership precedence is logical link, qualifying marked fragment, then standalone footnote reference.

## Rationale

Temporary projection is the only evaluated approach that lets marker characters occupy ordinary ProseMirror text positions without replacing the editor engine. It preserves normal caret movement and partial-marker editing while allowing Leafdown to return to Milkdown's canonical model when editing finishes.

Widget and decoration-only approaches remain appropriate for presentation or detached controls, but they cannot make marker characters editable document text without recreating selection, deletion, clipboard, IME, and keyboard behavior around synthetic DOM.

A permanent Markdown-token schema was rejected because it would conflict with Milkdown's CommonMark/GFM model, parser, serializer, clipboard behavior, and existing node and mark assumptions. A transient projection detail may support styling or session tracking, but it never becomes saved semantic content.

## Design Constraints

- Preserve the original target so a clean session can restore it exactly.
- Treat projection entry and exit as housekeeping, while user edits remain ordinary editor changes.
- Use an explicit projection-session history bridge; marking both entry and commit out of native history loses redo behavior.
- Finalize active projection before serializing Markdown.
- Keep marker presentation separate from projection lifecycle.

## Current Authority

- [Decisions](../decisions.md): Milkdown Kit foundation, GFM behavior, Crepe exclusion, and marker-presentation direction.
- [Architecture](../architecture.md): source-projection ownership, lifecycle, adapters, and dependency boundaries.
- [Specification](../specification.md): supported objects and observable selection, editing, clipboard, history, and fallback behavior.

## Historical Scope

The original spike evaluated a strong-and-emphasis proof of concept. Subsequent completed work generalized the design to the current supported objects and adapter model. The original probe plan, implementation slice, follow-up issue body, and test inventory are retained in Git history rather than duplicated as current guidance.
