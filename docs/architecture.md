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
- Localization: ICU MessageFormat catalogs formatted by `intl-messageformat`

## Frontend Organization

Domain code lives in `src/features/`. Each feature exposes a root `index.ts` public API and groups implementation by responsibility:

- `components/` and `hooks/` contain feature-owned React code.
- `commands/`, `services/`, and `stores/` contain domain behavior, workflows, integrations, and state.
- `plugins/` contains editor-runtime ProseMirror and Milkdown plugins, currently only in the `editor` feature.
- `utils/` contains focused code with no stronger subsystem owner.
- `tests/` contains behavior spanning multiple implementation modules.

Single-subject tests are colocated as `*.test.ts` or `*.test.tsx`; feature-level `tests/` directories are reserved for broader integration behavior.

Types are colocated with the module that owns the concept. A `types/` directory is reserved for a coherent set of shared domain contracts without a clearer owner.

Application composition lives under `src/components/` in `layout/` and `screens/`. Application commands live in `src/commands/`. Domain-agnostic UI and utilities live in `src/components/ui/` and `src/lib/`.

The `release-notes` feature owns the changelog bundled into the frontend, current-version selection, and persisted launch and seen-version history. It renders notes with the `help` feature's bundled-page Markdown renderer, so both Help surfaces share one link policy, and it does not access document or session state.

The `session` feature owns the relationship between the active document and folder context, plus workflows spanning multiple features. Dependencies flow left to right:

`application components -> commands -> session -> domain features -> shared UI/lib`

Arrows define direction, not required intermediate dependencies: a layer may import any layer to its right. Leaf features (`diagnostics`, `document`, `editor`, `folder-context`, `preferences`, and `release-notes`) do not import session, commands, or application components. Cross-feature imports use feature-root public APIs. When these layers or feature groups change, update the matching boundary lists in `oxlint.config.ts`.

Global scope does not make code shared. Domain-owned global behavior stays in its feature; only domain-agnostic reuse belongs in shared UI or `lib`.

Session and editor workflows request yes/no decisions through the shared confirmation service in `src/lib/`. The app shell renders its queued request using the shared dialog UI. Each feature keeps its own prompt wording and verifies the relevant document or link state after the decision; session tracks document activation separately from its path so a reopened file cannot satisfy an older confirmation.

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
- **Active document metadata:** File metadata and a content fingerprint utilized for dirty-state and external modification checks.

## Editor Architecture

### Milkdown Responsibilities

- Managing the editor model, schema, parsing, serialization, and native command implementations.
- Providing native history, structural keymaps, clipboard serialization and fallback primitives, event listeners, and default plugins.
- Providing the installed CommonMark/GFM parsing and serialization behavior.
- Retaining raw HTML as inline atoms carrying their authored `value`; Leafdown owns their safe live presentation and source-projection adapter.
- Retaining dollar-delimited math as inline atoms carrying their complete authored source; Leafdown owns the math grammar, safe rendering, projection adapter and its rendered preview, and source-based serialization.

### Leafdown Responsibilities

- Rendering the React editor wrapper and application layout.
- Controlling the context popup, marker visibility rules, and menu integration.
- Routing semantic formatting and projection-aware history shortcuts through the same command IDs and availability rules as other command surfaces.
- Owning default editor Copy and Cut payload resolution and deletion semantics across native editor events and application command surfaces.
- Owning how a blank paragraph is represented in the file, so raw HTML stays document content instead of doubling as editor state.

Leafdown's editor integration uses Milkdown Kit directly through a Leafdown-owned React wrapper. Crepe and packages that introduce Crepe transitively are excluded from the editor foundation. Milkdown plugins and components are adopted when aligned with Leafdown's user experience.

Shortcut execution follows the layer that owns the interaction. The window-level application listener routes application command IDs, the document search commands, and reserved webview suppression. Search belongs to the document rather than to the editor's focus, so its shortcuts reach it from the search surface and anywhere else in the window, and are held back from the webview's own find bar while unavailable. Leafdown's editor keymap routes semantic editor commands and projection-aware history while the editor has focus. Milkdown, ProseMirror, and the browser retain structural editing and native clipboard gesture ownership. The shared command metadata describes labels and displayed shortcuts across these surfaces; it is not itself a global executable shortcut registry.

Focus ownership follows the same layering. A pointer-opened context popup leaves focus with the editor, which still owns the selection the popup acts on; a keyboard-opened popup takes focus, having no other route in, and returns it to the editor on close rather than leaving it on the document body. ProseMirror keeps its selection across a blur, so restoring the editor's focus restores the selection with it, and the popup holds no selection state of its own.

Syntax highlighting uses bundled Shiki assets through Milkdown highlighting plugins. A raw HTML NodeView parses `value` into a source-located inert tree, validates the complete tree against the attribute-free allowlist and self-containment predicate, then constructs the corresponding DOM with element and text-node primitives. The retained source locations map pointer positions in that DOM back to exact offsets in the authored token without reparsing a string into executable markup. A rejected tree renders as muted source text. Rendering never rewrites `value`, and the schema's source-based serialization and clipboard representation remain unchanged.

A math NodeView renders its atom's TeX through the one KaTeX configuration in the math render module, which builds DOM directly and never passes an HTML string, and shows the muted source when the TeX does not parse. The atom's flow follows its paragraph: a `$$` span alone in it is the paragraph's display block. The module reads the TeX out of the source, applying a table cell's `\|` unescaping from the atom's position. Every NodeView renders as it is created, since deferring renders was measured to spread the layout they cost rather than save it. The math projection adapter supplies its preview as a rendered variant of the projection preview widget. Each edit draws the widget again, but the session keeps one preview element, and a display block's preview stands after the paragraph holding its source rather than inside it; otherwise every keystroke would lay the whole rendering out again, which for a large expression costs more than rendering it. While renders stay within a frame's budget the preview renders at once, and a costlier one keeps its rendering until typing pauses.

The code block NodeView uses that same KaTeX configuration for fenced blocks whose language is exactly `math`. Its editable `code` content remains the ProseMirror content DOM; the render is presentation owned by the view. Selection decorations reveal the code beside its preview while editing, and the schema continues to serialize the authored fence, metadata, and code content.

For fenced `mermaid` blocks, the code block NodeView retains that same content DOM. A plugin decorates each diagram holding either end of a text selection, and the NodeView shows the code of a decorated, failed, or unsupported diagram. Because native caret motion skips hidden code, the plugin moves an arrow key at a block edge into an adjacent diagram's code. While its code is shown, a diagram renders again after edits pause; otherwise it renders as soon as it is visible. Diagram blocks queue renders one at a time. The first render loads a bundled Mermaid 12 entry in a sandboxed child document with an opaque origin; the frame has no same-origin or navigation permission. The parent checks message source, opaque origin, and request identity. The child checks its parent as message source and locks Mermaid's security level, HTML labels, size and edge limits, layout, and error behavior against authored configuration. Configuration directives and frontmatter remain source but are not previewed. Its CSP denies connections, images, fonts, forms, and nested frames. Each request carries the app's color tokens and the code block background as CSS text; the child converts them to opaque colors for Mermaid's `base` theme and `classic` look, because Mermaid cannot parse the tokens' oklch form. A change to the root theme class renders visible diagrams again. The child returns SVG data sized to its view box; the parent displays it through an inert blob image and never inserts SVG into the editor DOM. The NodeView aborts or ignores stale results and revokes blob URLs. There is no same-process hard CPU timeout for Mermaid rendering.

### Clipboard Ownership

Leafdown resolves one default Copy/Cut payload from the current editor selection. For regular selections, Milkdown's ProseMirror clipboard serializer provides the Markdown plain text and semantic HTML fragment, except that Leafdown serializes a slice holding one unmarked text node itself, because Milkdown's serializer writes those characters as they are and the save path escapes them. Source projection may replace only the rich slice through its read-only semantic resolver while preserving the exact transient source selection as plain text.

Explicit HTML and rich-text copy commands reuse that semantic slice policy, remove ProseMirror clipboard metadata from exported HTML, and use semantic selection text as the rich-text plain fallback. HTML copy writes the fragment as literal plain text.

Two adapters apply that shared policy. A ProseMirror plugin owns native `copy` and `cut` events inside the Milkdown editor and writes both formats synchronously through `ClipboardEvent.clipboardData`. Edit-menu and context-popup commands use the asynchronous system Clipboard API. Both adapters delete through the same regular-or-projected Cut policy only after a successful write; asynchronous Cut also verifies that its document, selection, and projection mode have not changed while the write was pending.

Copy/Cut shortcut metadata remains available for menu labels, but those native gestures are excluded from the application keydown dispatcher. Focused controls outside Milkdown retain their native browser/WebView behavior. Leafdown supplies editor HTML fragments while the browser/WebView owns platform clipboard transport. The shared HTML ingress unwraps one qualifying ProseMirror fragment, preserving its content and structural context; unrelated external HTML remains unchanged.

### Source Projection

Source projection temporarily exposes supported Markdown source as editable, unmarked document text. [Specification](./specification.md#inline-content) owns the visible behavior; the engine owns the active session, projected range, local history, dirty-state integration, and finalization.

A session covers one object or a pair of adjacent objects under one adapter and one history. A clean session restores its canonical content; an edited one rehydrates valid source or commits literal text. If its range no longer holds flat text, the session ends without overwriting the content that replaced it. Restructuring finalizes projection before reading canonical content.

The engine keeps track of text written by the current session. It validates that text through the same adapters used for projected objects when the caret leaves it, but does not retroactively convert untouched escaped source. Relocation steps, such as moving a table row, and source exposed by an escape projection are not newly authored text. Undo clears the corresponding write record. Composition may change the projected range outside the engine's edit path; that change still dirties the document and enters projection-local history, but stays out of native history because committing it changes its coordinates.

Each object adapter owns target discovery, source generation, validation, rehydration, presentation spans, and selection mapping. The precedence is logical link, qualifying marked fragment, standalone image, standalone footnote reference, raw HTML, math, preserved character reference, then escaped literal run. An adapter without a safe semantic mapping commits literal text. A construct just created by an input rule waits until the caret returns before projecting, so the author's next character stays outside it.

A boundary adapter runs before object precedence only at a caret between two objects. It probes each side without active plugins, then treats their combined source as one range. Committing that range parses it as the file would; otherwise a character inserted at the seam could attach to one object and invalidate it. A caret owned outright by one object still uses ordinary precedence.

An adapter may finish while the caret remains inside its range. Its commit needs a separate transaction because projected edits opt out of native history and an appended commit would be dropped with them. The resulting object can project in place, preserving the caret.

Marker presentation is independent of session lifetime. Decorations style projected text, which remains document text rather than a detached input. A standalone image, or a logical link whose entire label is one image, retains its rendered image node while source appears immediately before it. The editable source is the session range; the retained node stays outside it. Pointer entry and keyboard traversal are distinguished through restore and commit, and finalization replaces the retained node only after a valid edit. Mixed or multi-node link labels use source-only projection.

### Document Search

The search plugin keeps what the author chose, the query and its options, with the current match as a range mapped through each transaction. The matches are derived from the finished editor state and cached per document and query: they exclude the active projection range, which another plugin's state holds and a plugin's own `apply` cannot see settled. Search commands compute each move against that state and record it in a meta-only transaction that suppresses projection entry, so searching changes neither the document, history, nor dirty state. Highlights are decorations for a window of matches around the current one, because building a decoration set costs its size times the document's top-level blocks. While the surface is open, a clearance above the document lets a match on its first line scroll out from under the surface; the scroll position moves by the clearance's height as it appears and goes, so no text moves, and a match is revealed a frame after it becomes current, once the clearance is in place. Replacements are ordinary history transactions. Only closing the surface, and `Find next` or `Find previous` while it is closed, move the selection.

## Backend Responsibilities

The Rust backend manages:

- Native file and folder path pickers and file IO.
- Decoding a Markdown file in the encoding its byte order mark names, otherwise in the encoding the user chose or as UTF-8, and refusing a chosen encoding whose re-encoded text would not reproduce the file's bytes. Encoding saved text back strictly in the document's encoding and byte order mark form, reporting each character that encoding cannot represent instead of substituting it. Legacy encodings go through `encoding_rs`'s non-replacing encoder; UTF-8 and UTF-16 use the standard library.
- Classifying native dropped paths as folders, supported Markdown files, or unsupported items.
- File metadata reads and existence checks.
- Resolving Markdown link and image targets, and handing confirmed local link targets to the system default application.
- Fetching a user-approved remote image under the remote image policy: `https:` only, public destination addresses checked at DNS resolution and for IP literals, re-validated redirects, bounded time and size, and a PNG, JPEG, GIF, or WebP signature. Image resolution never fetches.
- Directory scanning and article-tree generation.
- Creating Markdown files and folders, renaming entries, and moving entries to the system Recycle Bin or Trash inside the current folder context. Each operation resolves its target's parent through the filesystem and refuses one outside the folder context, so the root itself is never renamed or trashed. It refuses names the platform cannot hold, never replaces an existing entry, and never falls back to permanent deletion.
- Filesystem watching to monitor directory changes: the folder context for the article tree, and the active document's directory, non-recursively, for events naming that file. A symlinked document is watched under its own name and its target's.
- Inspecting the active document's file against its recorded metadata and fingerprint, reading the file's bytes only when the metadata differs.
- Intercepting window close requests to prompt for unsaved changes before exit, and closing the window on the next request when the frontend leaves one unanswered.
- Blocking webview navigation to remote origins, and granting asset-protocol access only to resolved image paths.
- Mapping permission and IO errors.
- Writing bounded JSONL local diagnostic logs, owning diagnostic log envelope fields, and reporting the app log directory.
- Persisting configuration settings and application data.

## Frontend Responsibilities

The React frontend manages:

- User interface rendering and application commands.
- App-rendered confirmation dialogs for document and local-link decisions.
- Milkdown integration and custom editor elements.
- Application state (folder context, active document, settings).
- Updating the article navigator in response to backend file events.
- Reconciling the active document with its file after a document watcher event.
- Path normalization and local image loading via Tauri's custom asset protocol.
- Presenting a fetched remote image through a `blob:` object URL owned by its image node view, which revokes it when the target changes or the view is destroyed and discards results that arrive after either.
- Marker visibility rules, thematic styling, and error presentation.
- Mirroring shared unexpected-error reports and feature-owned operational diagnostics into local logs as event-specific payloads, and exposing the Help diagnostics dialog.
- Showing the window once startup initialization finishes or fails, and answering intercepted close requests by destroying the window or declining the request.
- Suppressing standard window-level drag-and-drop navigation and routing native file and folder drops through session workflows.

The frontend calls feature-owned Rust commands only through feature-owned Tauri API modules. See [Engineering Patterns](./patterns.md#tauri-api-modules) for the implementation rules for that boundary.

### Localization

The frontend owns all translated text. The backend returns typed error `kind`s and data, never translated prose, and each feature maps a `kind` to its own messages.

- Messages are ICU MessageFormat strings in flat JSON catalogs, one per locale under `src/locales/`, keyed by stable IDs namespaced by the owning area. English, `en.json`, is the source catalog, and its IDs type every lookup. Command labels are `command.<commandId>` and menu labels `menu.<menuId>`, so every command needs a label to compile. Catalogs are bundled; none is loaded from outside the application.
- The localizer in `src/lib/i18n/` resolves the `language` setting to a locale, and publishes an immutable snapshot holding `t` and the locale's number, relative-time, and list formatters, together with a signal that fires when the locale changes. It sets `lang` and `dir` on the document root, and falls back to English one message at a time. It does not depend on React: components read the snapshot through `useLocalization()`, and editor plugins and other code that owns persistent text subscribe to the signal and re-label.
- Domain code returns data, and presentation builds sentences from whole messages. Values enter a message only as arguments; wording that depends on one uses ICU `plural` or `select`.
- Markdown content, file and folder names, paths, document metadata, code, literal syntax, and operating-system error text are source data. They are never translated and reach the interface only as message arguments or as a notification's detail line. Command IDs, setting keys and values, error `kind`s, persisted schema keys, and IPC contracts are stable identifiers and are never localized.
- Document statistics segment words and graphemes independently of the interface language.
- The Diagnostics summary and log are written in English for bug reports; only the Diagnostics dialog around them is translated. Development-only tools are not translated.

## Data Contracts

- Session owns the active document, folder context, and document metadata used for dirty-state and external-modification checks.
- Opening and saving return a fingerprint of the file's bytes beside its metadata, which together name the version of the file the document holds. The fingerprint is a 64-bit hash compared only for equality within one run of the application and never persisted. The document also records an external change: a newer version observed on disk, or a missing file.
- An opened document carries its encoding, as an encoding name and a byte order mark flag, beside its line ending. Session holds it as document state and sends it back with each save. Opening takes an optional chosen encoding name, which the backend ignores when the file has a byte order mark. Session also keeps the encoding the file holds, so the document can be converted back to it, and remounts the editor when a reopen of the same path replaces its text. The frontend labels it but never decodes or encodes text.
- Preferences own persisted settings and session history.
- Release notes own a separate persisted record of the last launched version and versions whose notes were shown. The current dialog and version are runtime state.
- The `language` setting holds `system` or a BCP 47 tag. A tag Leafdown does not ship resolves as `system` without being rewritten.
- Folder scans return a nested Markdown article tree. The Rust scan owns canonical child ordering; the frontend supplies the selected sort order and preserves returned order when rendering the article navigator.

## Data Flow

### Open Workflow

Backend reads target document -> Session updates active document -> Session bootstraps folder context only when none exists.

### Drop Workflow

Tauri reports native paths -> Backend classifies one dropped path -> Session reads the matching persisted preference -> Session opens through the existing file or folder workflow, or inserts a path link through the active editor bridge.

### Folder Entry Workflow

The article navigator names a target row and hands the action to the application layer; it holds no filesystem or session behavior of its own. Session confirms a deletion, and asks about unsaved changes before creating a file or deleting an entry that holds the active document -> Backend validates and changes the filesystem -> Session moves the active document path, recent items, and expanded folders under a renamed path, or closes a trashed active document -> Session rescans the folder context -> The watcher's later refresh produces the same tree.

Renames and deletions queue behind a pending save, so a save in flight cannot recreate a file at its old path. The editor is keyed by document path, so a renamed active document remounts from the Markdown the editor held, keeping its unsaved changes and its metadata snapshot for the next freshness check.

### Save Workflow

Serialize editor state to Markdown -> Verify metadata freshness via backend -> Encode in the document's encoding and write file to disk -> Update dirty state, cached metadata, and fingerprint.

### Save As Workflow

Write document to new path -> Update active document path -> Bootstrap folder context when none exists, refresh the current folder context when the saved file is inside it, or leave the pinned folder context unchanged when the saved file is outside it.

### External Change Workflow

Backend reports an event naming the active document -> Session debounces events into one check -> The check queues behind pending saves and renames, which replace the file and the document's version together -> Backend compares the file's metadata, then its fingerprint, with the document's version -> Session accepts a touch's metadata, reloads a clean document through the open path, records a newer version for a dirty document, or records a missing file -> A result for a document that was replaced, renamed, or closed in the meantime is discarded.

The document watch starts whenever the active saved document's path changes and checks the file once it is in place, since the file can change between being read and being watched. A reload remounts the editor, as a reopen does, and carries the caret and focus into the new editor.

## Security

- Prevent script execution from Markdown content.
- Render raw HTML only through the source-located parse, validate, and safe-construction boundary. Accept only a self-contained, single HTML-namespace element whose entire tree consists of allowlisted elements without attributes and text. Reject the whole fragment if sanitization would change it; never insert a reparsed or partially sanitized string. CSP remains defense in depth, not the allowlist implementation.
- Render math only through KaTeX with `trust: false`, bounded `maxSize` and `maxExpand`, and a fresh macro table per render, building DOM directly. No rendered math element carries a URL or an author-chosen class, id, style, or data attribute. KaTeX's fonts are bundled woff2 assets served from the app origin.
- Render Mermaid only in the opaque-origin sandboxed child with a restrictive CSP; never execute diagram actions or insert returned SVG as DOM. The parent CSP admits only blob images from the result, not remote image origins.
- Block automatic loading of remote images. A remote image loads only through the backend fetch after its own explicit activation, and the WebView CSP admits `blob:` images but never a remote image origin.
- Open external links in the default system browser, and keep webview navigation on the local frontend origin.
- Require confirmation before handing local non-Markdown links to the system default app.
- Bundle Shiki themes and grammars to avoid runtime network dependencies.
- Keep diagnostic logs local; never upload them automatically. Application code must not intentionally add active document text to diagnostic context, but browser, editor, or library errors may include user content. Treat logs as potentially sensitive rather than as redacted data.

## Verification Strategy

Automated tests cover Markdown round trips; editor commands and projection; file, folder, watcher, and persistence workflows; path, encoding, size, symlink, and permission boundaries; local resource resolution; safe raw HTML; safe math rendering; and context popup behavior. Rendered HTML parsing, block layout, and native interactions also need the desktop WebView.

The Windows desktop E2E suite runs separately from `pnpm check`, locally and in CI. It uses a debug binary and isolated application state, WebDriver port, fixture tree, and artifacts for each worker. Workers start a fresh application process per scenario, except the ordered persistence restart group. The runner validates `--scenario` and `--workers <1-4>`; its default is one worker. `pnpm test:e2e:desktop:run` uses an already built binary, so rebuild when binary inputs change. The suite covers document lifecycle, folder watching, external changes to the active document, find and replace from the keyboard and the Edit menu, math rendering, its preview, and source editing under the app's CSP, Mermaid image rendering and its opaque child network boundary, article navigator file actions through the native filesystem and Recycle Bin, backend errors, persisted settings, frame controls, diagnostics, window-close handling, and remote image request gating.

Acceptance assertions use state that outlives the action, such as saved files, editor contents, menu state, or diagnostic records. The E2E build holds toasts open when the notification itself is the outcome. Direct bridge calls corroborate diagnostics; filesystem and process access provide setup and native-boundary evidence. WebDriver dependencies and permissions stay in the E2E build, as does the allowance that lets the remote image fetch trust one runner-named host on loopback with a test certificate authority. The E2E build also replaces the opener plugin with one that records URL, path, and reveal requests as diagnostic records instead of handing them to the system shell, so the capability still gates each command but opener scopes and link-click interception are not exercised.

The manual [Markdown corpus](../corpus/README.md) covers parsing, rendering, editing, serialization, folder navigation, and local resources. Keep it aligned with the specification when supported behavior changes.
