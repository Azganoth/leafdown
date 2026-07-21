# Architecture

This document owns component boundaries, dependency direction, runtime responsibilities, and cross-boundary data flow. [Decisions](./decisions.md) records rationale, the [Specification](./specification.md) defines product behavior, and [Engineering Patterns](./patterns.md) defines implementation tactics.

Leafdown uses Tauri with a Rust backend and a React frontend. The local filesystem is the source of truth.

## Tech Stack

- Desktop shell: Tauri
- Backend: Rust
- Frontend: React, TypeScript, Vite
- Styling: Tailwind
- State management: Zustand (persisted via Tauri storage)
- Editor engine: Milkdown Kit

## Frontend Organization

Domain code lives in `src/features/`. Each feature exposes a root `index.ts` public API and groups implementation by responsibility:

- `components/` and `hooks/` contain feature-owned React code.
- `commands/`, `services/`, and `stores/` contain domain behavior, workflows, integrations, and state.
- `utils/` contains focused code with no stronger subsystem owner.
- `tests/` contains behavior spanning multiple implementation modules.

Single-subject tests are colocated as `*.test.ts` or `*.test.tsx`; feature-level `tests/` directories are reserved for broader integration behavior.

Types are colocated with the module that owns the concept. A `types/` directory is reserved for a coherent set of shared domain contracts without a clearer owner.

Application composition lives under `src/components/` in `layout/`, `screens/`, and `dialogs/`. Application commands live in `src/commands/`. Domain-agnostic UI and utilities live in `src/components/ui/` and `src/lib/`.

The `session` feature owns the relationship between the active document and folder context, plus workflows spanning multiple features. Dependencies flow left to right:

`application components -> commands -> session -> domain features -> shared UI/lib`

Arrows define direction, not required intermediate dependencies: a layer may import any layer to its right. Leaf features (`document`, `editor`, `folder-context`, and `preferences`) do not import session, commands, or application components. Cross-feature imports use feature-root public APIs. When these layers or feature groups change, update the matching boundary lists in `oxlint.config.ts`.

Global scope does not make code shared. Domain-owned global behavior stays in its feature; only domain-agnostic reuse belongs in shared UI or `lib`.

## Domain Vocabulary

- **Folder context:** the runtime root folder used for scanning, navigation, path resolution, and watching. It creates no metadata.
- **Article:** a supported Markdown file.
- **Article navigator:** the presentation of articles within a folder context.
- **Session:** the active document, when one exists, plus an optional folder context.
- **Source projection:** a temporary editable source representation of a supported Markdown object while the editor retains its canonical document model.
- **Workspace:** not an application domain term; Leafdown creates neither a workspace model nor workspace metadata.

## Runtime Model

The runtime tracks three primary state values:

- **Current folder context:** The directory used for article navigation and folder workflows.
- **Active document:** The saved or untitled Markdown document currently loaded in the editor.
- **Active document metadata:** File metadata utilized for dirty-state and external modification checks.

## Editor Architecture

### Milkdown Responsibilities

- Managing the editor model, schema, parsing, serialization, and native command implementations.
- Providing native history, structural keymaps, clipboard serialization and fallback primitives, event listeners, and default plugins.
- Providing the installed CommonMark/GFM parsing and serialization behavior.

### Leafdown Responsibilities

- Rendering the React editor wrapper and application layout.
- Controlling the context popup, marker visibility rules, and menu integration.
- Routing semantic formatting and projection-aware history shortcuts through the same command IDs and availability rules as other command surfaces.
- Owning default editor Copy and Cut payload resolution and deletion semantics across native editor events and application command surfaces.

Leafdown's editor integration uses Milkdown Kit directly through a Leafdown-owned React wrapper. Crepe and packages that introduce Crepe transitively are excluded from the editor foundation. Milkdown plugins and components are adopted when aligned with Leafdown's user experience.

Shortcut execution follows the layer that owns the interaction. The window-level application listener routes only application command IDs and reserved webview suppression. Leafdown's editor keymap routes semantic editor commands and projection-aware history while the editor has focus. Milkdown, ProseMirror, and the browser retain structural editing and native clipboard gesture ownership. The shared command metadata describes labels and displayed shortcuts across these surfaces; it is not itself a global executable shortcut registry.

Syntax highlighting uses bundled Shiki assets through Milkdown highlighting plugins. Raw Markdown HTML is preserved as text-like editor content instead of being rendered as browser DOM.

### Clipboard Ownership

Leafdown resolves one default Copy/Cut payload from the current editor selection. For regular selections, Milkdown's ProseMirror clipboard serializer provides the Markdown plain text and semantic HTML fragment. Source projection may replace only the rich slice through its read-only semantic resolver while preserving the exact transient source selection as plain text.

Two adapters apply that shared policy. A ProseMirror plugin owns native `copy` and `cut` events inside the Milkdown editor and writes both formats synchronously through `ClipboardEvent.clipboardData`. Edit-menu and context-popup commands use the asynchronous system Clipboard API. Both adapters delete through the same regular-or-projected Cut policy only after a successful write; asynchronous Cut also verifies that its document, selection, and projection mode have not changed while the write was pending.

Copy/Cut shortcut metadata remains available for menu labels, but those native gestures are excluded from the application keydown dispatcher. Focused controls outside Milkdown retain their native browser/WebView behavior. Leafdown supplies editor HTML fragments while the browser/WebView owns platform clipboard transport. The shared HTML ingress unwraps one qualifying ProseMirror fragment, preserving its content and structural context; unrelated external HTML remains unchanged.

### Source Projection

Source projection temporarily exposes a supported Markdown object as unmarked, editable document text while the editor retains its canonical document model.

The shared projection engine owns the active session, projected range, projection-local history, dirty-state integration, and finalization. A clean session restores its original content; an edited session rehydrates valid source or commits literal text so projected characters are not discarded.

Object adapters own target discovery, source generation, validation, rehydration, presentation spans, and selection mapping. Ownership precedence is logical link, qualifying marked fragment, then standalone footnote reference. Adapters that cannot preserve a semantic mapping fall back to literal text.

Marker presentation remains separate from projection lifecycle. Decorations style active source, while projected Markdown remains document text rather than widget or NodeView input state.

## Backend Responsibilities

The Rust backend manages:

- Native file dialogs and file IO.
- File metadata reads and existence checks.
- Directory scanning and article-tree generation.
- Filesystem watching to monitor directory changes.
- Intercepting window close requests to prompt for unsaved changes before exit.
- Mapping permission and IO errors.
- Writing bounded JSONL local diagnostic logs, owning diagnostic log envelope fields, and reporting the app log directory.
- Persisting configuration settings and application data.

## Frontend Responsibilities

The React frontend manages:

- User interface rendering and application commands.
- Milkdown integration and custom editor elements.
- Application state (folder context, active document, settings).
- Updating the article navigator in response to backend file events.
- Path normalization and local image loading via Tauri's custom asset protocol.
- Marker visibility rules, thematic styling, and error presentation.
- Mirroring shared unexpected-error reports and feature-owned operational diagnostics into local logs as event-specific payloads, and exposing the Help diagnostics dialog.
- Suppressing default webview context menus and standard window-level drag-and-drop navigation.

The frontend calls feature-owned Rust commands only through feature-owned Tauri API modules. See [Engineering Patterns](./patterns.md#tauri-api-modules) for the implementation rules for that boundary.

## Data Contracts

- Session owns the active document, folder context, and document metadata used for dirty-state and external-modification checks.
- Preferences own persisted settings and session history.
- Folder scans return a nested Markdown article tree. The Rust scan owns canonical child ordering; the frontend supplies the selected sort order and preserves returned order when rendering the article navigator.

## Data Flow

### Open Workflow

Backend reads target document -> Session updates active document -> Session bootstraps folder context only when none exists.

### Save Workflow

Serialize editor state to Markdown -> Verify metadata freshness via backend -> Write file to disk -> Update dirty state and cached metadata.

### Save As Workflow

Write document to new path -> Update active document path -> Bootstrap folder context when none exists, refresh the current folder context when the saved file is inside it, or leave the pinned folder context unchanged when the saved file is outside it.

## Security

- Prevent script execution from Markdown content.
- Do not parse or render raw HTML; escape it or preserve it as plain text.
- Block automatic loading of remote images.
- Open external links in the default system browser.
- Require confirmation before handing local non-Markdown links to the system default app.
- Bundle Shiki themes and grammars to avoid runtime network dependencies.
- Keep diagnostic logs local; never upload them automatically. Application code must not intentionally add active document text to diagnostic context, but browser, editor, or library errors may include user content. Treat logs as potentially sensitive rather than as redacted data.

## Verification Strategy

Automated tests focus on:

- Markdown round trips and serializer behavior.
- File workflows, dirty state, external-change warnings, and line-ending output.
- Permission, missing/deleted file, invalid path/encoding, oversized-file, and empty-file handling.
- Folder scanning, index-file auto-open, folder-context updates, ignored directories, and symlink behavior.
- Recent-list persistence, deduplication, and bounds.
- Relative link/image resolution, remote-image blocking, and outside-folder confirmation.
- Literal HTML rendering and script-execution prevention.
- Context popup layout and caret-based marker visibility.

The manual [Markdown corpus](../corpus/README.md) complements automated tests for parsing, rendering, editing, serialization, folder navigation, and local resources. Keep corpus scenarios aligned with the specification when supported behavior changes; use its README for fixture taxonomy and byte-sensitive handling.
