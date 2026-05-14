# Architecture

Leafdown uses Tauri with a Rust backend and a React frontend. The local filesystem is the source of truth.

## Tech Stack

- Desktop shell: Tauri
- Backend: Rust
- Frontend: React, TypeScript, Vite
- Styling: Tailwind
- State management: Zustand (persisted via Tauri storage)
- Editor engine: Milkdown Kit

## Runtime Model

The application maintains three primary runtime states:

- **Current folder context:** The directory used for sidebar navigation and folder workflows.
- **Active document:** The saved or untitled Markdown document currently loaded in the editor.
- **Active document metadata:** File metadata utilized for dirty-state and external modification checks.

## Editor Architecture

### Milkdown Responsibilities

- Managing the editor model, schema, parsing, serialization, commands, and keymaps.
- Handling history, clipboard events, event listeners, and default plugins.
- Enforcing CommonMark and GFM specifications.

### Leafdown Responsibilities

- Rendering the React editor wrapper and application layout.
- Managing folder context, active document state, global settings, and recent lists.
- Controlling the context popup, marker visibility rules, and menu integration.
- Orchestrating local file workflows, dirty-state checks, and external-change handling.
- Resolving relative links/images, handling missing-image states, and blocking remote images.
- Applying theme variables and general app-level styling.

Milkdown plugins and components are adopted when aligned with Leafdown's user experience. Crepe is excluded.

## Backend Responsibilities

The Rust backend manages:

- Native file dialogs and file IO.
- File metadata reads and existence checks.
- Directory scanning and file tree generation.
- Filesystem watching to monitor directory changes.
- Intercepting window close requests to prompt for unsaved changes before exit.
- Mapping permission and IO errors.
- Persisting configuration settings and application data.

## Frontend Responsibilities

The React frontend manages:

- User interface rendering and application commands.
- Milkdown integration and custom editor elements.
- Application state (folder context, active document, settings).
- Updating the sidebar file tree in response to backend file events.
- Path normalization and local image loading via Tauri's custom asset protocol.
- Marker visibility rules, thematic styling, and error presentation.
- Suppressing default webview context menus and standard window-level drag-and-drop navigation.

## Data Contracts

- Recent lists store absolute paths, deduplicated and ordered by access time.
- Global settings store user preferences. The active document state tracks the current line ending, initialized from the disk file or system defaults.
- Folder scans return a nested, Markdown-only tree structure. File metadata is tracked to identify external modifications before write operations.

## Data Flow

### Open Workflow

Backend reads or scans target path -> Updates folder context, editor state, and sidebar.

### Save Workflow

Serialize editor state to Markdown -> Verify metadata freshness via backend -> Write file to disk -> Update dirty state and cached metadata.

### Save As Workflow

Write document to new path -> Update active document path -> Refresh folder context and file tree if the parent directory changed.

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
