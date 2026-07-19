# Architecture

Leafdown uses Tauri with a Rust backend and a React frontend. The local filesystem is the source of truth.

## Tech Stack

- Desktop shell: Tauri
- Backend: Rust
- Frontend: React, TypeScript, Vite
- Styling: Tailwind
- State management: Zustand (persisted via Tauri storage)
- Editor engine: Milkdown Kit

## Frontend Organization

Domain code lives in `src/features/`. Each feature exposes a root `index.ts` public API and groups
implementation by responsibility:

- `components/` and `hooks/` contain feature-owned React code.
- `commands/`, `services/`, and `stores/` contain domain behavior, workflows, integrations, and state.
- `utils/` contains focused code with no stronger subsystem owner.
- `tests/` contains behavior spanning multiple implementation modules.

Single-subject tests are colocated as `*.test.ts` or `*.test.tsx`; feature-level `tests/` directories
are reserved for broader integration behavior.

Types are colocated with the module that owns the concept. A `types/` directory is reserved for a
coherent set of shared domain contracts without a clearer owner.

Application composition lives under `src/components/` in `layout/`, `screens/`, and `dialogs/`.
Application commands live in `src/commands/`. Domain-agnostic UI and utilities live in
`src/components/ui/` and `src/lib/`.

The `session` feature owns the relationship between the active document and folder context, plus
workflows spanning multiple features. Dependencies flow left to right:

`application components -> commands -> session -> domain features -> shared UI/lib`

Arrows define direction, not required intermediate dependencies: a layer may import any layer to its
right. Leaf features (`document`, `editor`, `folder-context`, and `preferences`) do not import
session, commands, or application components. Cross-feature imports use feature-root public APIs.
When these layers or feature groups change, update the matching boundary lists in `oxlint.config.ts`.

Global scope does not make code shared. Domain-owned global behavior stays in its feature; only
domain-agnostic reuse belongs in shared UI or `lib`.

## Domain Vocabulary

- **Folder context:** the runtime root folder used for scanning, navigation, path resolution, and watching. It creates no metadata.
- **Article:** a supported Markdown file.
- **Article navigator:** the presentation of articles within a folder context.
- **Session:** the active document plus an optional folder context.
- **Workspace:** not an application domain term; Leafdown creates neither a workspace model nor workspace metadata.

## Runtime Model

The application maintains three primary runtime states:

- **Current folder context:** The directory used for article navigation and folder workflows.
- **Active document:** The saved or untitled Markdown document currently loaded in the editor.
- **Active document metadata:** File metadata utilized for dirty-state and external modification checks.

## Editor Architecture

### Milkdown Responsibilities

- Managing the editor model, schema, parsing, serialization, and native command
  implementations.
- Providing native history, structural keymaps, clipboard events, event
  listeners, and default plugins.
- Enforcing CommonMark and GFM specifications.

### Leafdown Responsibilities

- Rendering the React editor wrapper and application layout.
- Managing folder context, active document state, global settings, and session history.
- Controlling the context popup, marker visibility rules, and menu integration.
- Routing semantic formatting and projection-aware history shortcuts through the
  same command IDs and availability rules as other command surfaces.
- Orchestrating local file workflows, dirty-state checks, and external-change handling.
- Resolving relative links/images, handling missing-image states, and blocking remote images.
- Applying theme variables and general app-level styling.

The MVP editor integration uses Milkdown Kit directly through a Leafdown-owned
React wrapper. Crepe and packages that introduce Crepe transitively are excluded
from the MVP editor foundation. Milkdown plugins and components are adopted when
aligned with Leafdown's user experience.

Shortcut execution follows the layer that owns the interaction. The window-level
application listener routes only application command IDs and reserved webview
suppression. Leafdown's editor keymap routes semantic editor commands and
projection-aware history while the editor has focus. Milkdown, ProseMirror, and
the browser retain structural editing and native clipboard event ownership. The
shared command metadata describes labels and displayed shortcuts across these
surfaces; it is not itself a global executable shortcut registry.

Syntax highlighting uses bundled Shiki assets through Milkdown highlighting
plugins. Raw Markdown HTML is preserved as text-like editor content instead of
being rendered as browser DOM.

### Source Projection

Source projection temporarily exposes a supported Markdown object as unmarked,
editable document text while Milkdown's canonical model remains the resting
document representation.

The shared plugin engine owns the active session, projected range, exact original
ProseMirror `Slice`, projection-local undo and redo, transaction metadata,
dirty-state integration, serialization finalization, and the native-history
restore-before-commit sequence. A clean session restores the immutable original
slice exactly. An edited session first restores that slice outside history, then
commits the adapter-produced replacement as the native history change. Invalid
source is committed literally so projected characters are never discarded.

Registered object adapters own target discovery and precedence, source
generation, entry and clean-restoration transforms, validation and rehydration,
presentation spans, and selection mapping. Ownership precedence is logical link,
qualifying marked fragment, then standalone footnote reference. The mark adapter
supports strong, emphasis, strikethrough, and inline code. Its fragment-local
codec additionally lets one exact, contiguous strong, emphasis, or strikethrough
combination own both text and canonical footnote-reference nodes. It validates
reference syntax through the installed Milkdown parser and Remark pipeline,
maps atomic references within the projected source, and rehydrates rich marked
fragments without changing footnote definitions.

The higher-precedence logical-link adapter owns links and autolinks as complete
wrappers, including rich labels whose child text nodes carry different nested
marks and labels containing semantic soft line endings. Milkdown transforms
those endings into inline `hardbreak` nodes and removes positions from the
resulting Remark children, so the adapter captures positioned semantic leaves
before that transform and maps each inline break as one document unit. Clean
entry and restoration preserve existing label content while adding or removing
projected delimiters and canonical marks, so native history steps remain mapped
across transient projection. Edited source rehydrates the parsed inline fragment
or falls back to literal text.

Milkdown's default serializer can emit adjacent link wrappers when one logical
link contains mixed child marks. Leafdown wraps serialization with a transient,
collision-free placeholder transform so saved Markdown retains one outer link
without placing placeholders in editor state or history. Future rich inline
wrappers and atomic inline nodes extend the adapter boundary independently; the
shared lifecycle must not acquire object-specific syntax assumptions. Marked
footnote fragments do not use that link-specific serialization transform:
Milkdown's existing document serializer already preserves the issue's supported
one-wrapper examples.

Marker presentation is a separate capability. Decorations may style active
source, but projected Markdown remains real ProseMirror document text rather than
widget or NodeView input state. Projected links additionally expose one semantic
label range, including nested Markdown delimiters but excluding link syntax, so
fragmented decoration spans retain one coordinated presentation and hover state.

## Backend Responsibilities

The Rust backend manages:

- Native file dialogs and file IO.
- File metadata reads and existence checks.
- Directory scanning and article-tree generation.
- Filesystem watching to monitor directory changes.
- Intercepting window close requests to prompt for unsaved changes before exit.
- Mapping permission and IO errors.
- Writing bounded JSONL local diagnostic logs, owning diagnostic log envelope
  fields, and reporting the app log directory.
- Persisting configuration settings and application data.

## Frontend Responsibilities

The React frontend manages:

- User interface rendering and application commands.
- Milkdown integration and custom editor elements.
- Application state (folder context, active document, settings).
- Updating the article navigator in response to backend file events.
- Path normalization and local image loading via Tauri's custom asset protocol.
- Marker visibility rules, thematic styling, and error presentation.
- Mirroring shared unexpected-error reports and feature-owned operational
  diagnostics into local logs as event-specific payloads, and exposing the Help
  diagnostics dialog.
- Suppressing default webview context menus and standard window-level drag-and-drop navigation.

## Data Contracts

- Session history stores recent absolute paths, deduplicated and ordered by access time.
- Global settings store user preferences. The active document state tracks the current line ending, initialized from the disk file or system defaults.
- Folder scans return a nested, Markdown-only tree structure. File metadata is tracked to identify external modifications before write operations.
- The Rust folder scan owns canonical article-tree ordering. The frontend sends
  the selected article sort order with scan/open requests and preserves the
  returned child order when flattening rows for the article navigator.
- Changing the article sort order refreshes the active folder context with a new
  backend scan. Frontend local re-sorting, if introduced for optimistic
  client-only mutations, must be treated as temporary and match the backend
  comparator until the next scan result arrives.

## Data Flow

### Open Workflow

Backend reads target document -> Session updates active document -> Session
bootstraps folder context only when none exists.

### Save Workflow

Serialize editor state to Markdown -> Verify metadata freshness via backend -> Write file to disk -> Update dirty state and cached metadata.

### Save As Workflow

Write document to new path -> Update active document path -> Bootstrap folder
context when none exists, refresh the current folder context when the saved file
is inside it, or leave the pinned folder context unchanged when the saved file is
outside it.

## Security

- Prevent script execution from Markdown content.
- Do not parse or render raw HTML; escape it or preserve it as plain text.
- Block automatic loading of remote images.
- Open external links in the default system browser.
- Require confirmation before handing local non-Markdown links to the system
  default app.
- Bundle Shiki themes and grammars to avoid runtime network dependencies.

## Test Focus

- Markdown round trips and serializer behavior.
- File workflows, dirty state, external-change warnings, and line-ending output.
- Permission, missing/deleted file, invalid path/encoding, oversized-file, and empty-file handling.
- Folder scanning, index-file auto-open, folder-context updates, ignored directories, and symlink behavior.
- Recent-list persistence, deduplication, and bounds.
- Relative link/image resolution, remote-image blocking, and outside-folder confirmation.
- Raw HTML sanitization and script execution prevention.
- Context popup layout and caret-based marker visibility.

## Development Corpus

The repository keeps its manual Markdown corpus in [`../corpus/`](../corpus/).
Open the corpus root for a broad walkthrough or a focused subdirectory while
iterating on parsing, rendering, serialization, folder scans, or local resource
handling.

The committed corpus complements automated tests with focused CommonMark and
GFM family documents, explicitly separated nonstandard extensions, meaningful
syntax interactions, malformed inputs, and coherent practical documents.
Focused environment scenarios retain article sort order and index precedence,
non-Markdown entries, local and outside-folder references, and Unicode paths.
Committed byte-boundary fixtures preserve exact line endings, BOM,
representative control characters, tabs, and end-of-file behavior through
repository attributes. Loading limits,
timestamp sorting, ignored directories, and symlink scanning remain covered by
automated application tests. Keep the corpus aligned with the specification and
backlog when behavior changes. Structural and error fixtures may stay
deliberately artificial when necessary to exercise a boundary.
