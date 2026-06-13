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
- `services/` and `stores/` contain workflows, integrations, and state.
- `types/` and `utils/` contain domain contracts and focused utilities.
- `tests/` contains behavior spanning multiple implementation modules.

Single-subject tests are colocated as `*.test.ts` or `*.test.tsx`; feature-level `tests/` directories
are reserved for broader integration behavior.

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

- Managing the editor model, schema, parsing, serialization, commands, and keymaps.
- Handling history, clipboard events, event listeners, and default plugins.
- Enforcing CommonMark and GFM specifications.

### Leafdown Responsibilities

- Rendering the React editor wrapper and application layout.
- Managing folder context, active document state, global settings, and session history.
- Controlling the context popup, marker visibility rules, and menu integration.
- Orchestrating local file workflows, dirty-state checks, and external-change handling.
- Resolving relative links/images, handling missing-image states, and blocking remote images.
- Applying theme variables and general app-level styling.

The MVP editor integration uses Milkdown Kit directly through a Leafdown-owned
React wrapper. Crepe and packages that introduce Crepe transitively are excluded
from the MVP editor foundation. Milkdown plugins and components are adopted when
aligned with Leafdown's user experience.

Syntax highlighting uses bundled Shiki assets through Milkdown highlighting
plugins. Raw Markdown HTML is preserved as text-like editor content instead of
being rendered as browser DOM.

## Backend Responsibilities

The Rust backend manages:

- Native file dialogs and file IO.
- File metadata reads and existence checks.
- Directory scanning and article-tree generation.
- Filesystem watching to monitor directory changes.
- Intercepting window close requests to prompt for unsaved changes before exit.
- Mapping permission and IO errors.
- Persisting configuration settings and application data.

## Frontend Responsibilities

The React frontend manages:

- User interface rendering and application commands.
- Milkdown integration and custom editor elements.
- Application state (folder context, active document, settings).
- Updating the article navigator in response to backend file events.
- Path normalization and local image loading via Tauri's custom asset protocol.
- Marker visibility rules, thematic styling, and error presentation.
- Suppressing default webview context menus and standard window-level drag-and-drop navigation.

## Data Contracts

- Session history stores recent absolute paths, deduplicated and ordered by access time.
- Global settings store user preferences. The active document state tracks the current line ending, initialized from the disk file or system defaults.
- Folder scans return a nested, Markdown-only tree structure. File metadata is tracked to identify external modifications before write operations.

## Data Flow

### Open Workflow

Backend reads or scans target path -> Session updates folder context, active document, and article navigator.

### Save Workflow

Serialize editor state to Markdown -> Verify metadata freshness via backend -> Write file to disk -> Update dirty state and cached metadata.

### Save As Workflow

Write document to new path -> Update active document path -> Refresh folder context and article navigator if the parent directory changed.

## Security

- Prevent script execution from Markdown content.
- Do not parse or render raw HTML; escape it or preserve it as plain text.
- Block automatic loading of remote images.
- Open external links in the default system browser.
- Require confirmation before opening local file links that resolve outside the folder context.
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

## Development Fixtures

The repository keeps manual development content in [`../sample/`](../sample/).
Open that folder in Leafdown while iterating on folder scans, editor rendering,
local link/image handling, and loading error states.

The sample folder complements automated tests with ordinary files that exercise
documented behavior: nested supported Markdown files, ignored and non-Markdown
entries, local and outside-folder references, a local image, mixed line endings,
invalid UTF-8, and the oversized-file limit. Keep the fixtures aligned with the
specification when those behaviors change.
