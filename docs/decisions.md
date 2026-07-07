# Decisions

## Product Decisions

### Markdown files remain the source of truth

**Status:** Accepted

**Decision:** Saved documents remain ordinary Markdown files on disk.

**Rationale:** Operate on standard files and directories directly, avoiding a proprietary database or storage wrapper.

**Consequences:**

- The editor may use an internal model while a document is open.
- Save operations serialize back to standard Markdown.
- File workflows remain compatible with external editor tools.

### Preserve Markdown semantics over exact formatting

**Status:** Accepted

**Decision:** Leafdown prioritizes preserving Markdown meaning over byte-for-byte formatting.

**Rationale:** A hybrid editor normalizes source markup; semantic consistency is the primary product guarantee.

**Consequences:**

- The MVP normalizes generated Markdown to the default application style.
- Output-formatting customization is deferred to Post-MVP.
- Standardize on Milkdown serializer defaults unless configuration overrides are straightforward and reliable.
- Round-trip tests verify semantic preservation and account for known serializer normalizations.

### No vault or workspace model

**Status:** Accepted

**Decision:** Opening a folder does not create a vault, workspace, import process, database, or metadata files in that folder.

**Rationale:** Leafdown is designed as a document-centric editor rather than a personal knowledge management system with custom workspace setups.

**Consequences:**

- Existing folder structures remain unmodified.
- Application metadata is stored externally from the opened folders.
- Folder workflows execute without initialization steps.

### Always folder-aware

**Status:** Accepted

**Decision:** Opening a folder uses it as the current folder context. Opening a
file uses its parent folder as the current folder context only when no folder
context is active. Once a folder context exists, it remains pinned until changed
by an explicit folder action.

**Rationale:** Keeps folder-aware workflows available while preventing the
article navigator from unexpectedly collapsing to nested or unrelated document
parent folders.

**Consequences:**

- The sidebar matches the pinned folder context, not necessarily the active
  document's parent folder.
- Opening a single file scans its parent folder context only as a bootstrap path
  when no folder context is active.
- Opening Markdown documents outside the current folder context does not switch
  or prompt for a folder-context change.
- Untitled documents associate with the active folder context before saving.

### Use one hybrid document surface

**Status:** Accepted

**Decision:** The default document surface is one active hybrid WYSIWYG Markdown editor, without a permanent source/preview split or separate read/edit modes.

**Rationale:** A unified surface provides editing availability without the friction of explicit mode switching.

**Consequences:**

- The document surface supports both reading and editing workflows.
- Syntax markers display contextually based on the caret position.
- Source-only workflows cannot rely on a permanent second pane.
- A raw Markdown view, if implemented, is an explicit secondary view rather than the default surface.

### Treat marker presentation as object-specific

**Status:** Accepted

**Decision:** Leafdown chooses editable markers, subtle markers, persistent
markers, or visual object affordances per Markdown object instead of applying
one syntax-reveal rule to every object.

**Rationale:** Milkdown already provides structural editing for many block
objects, while inline and source-oriented objects still benefit from local raw
Markdown editing.

**Consequences:**

- The specification's marker visibility and presentation rules own the
  per-object behavior.
- Tables, code blocks, and horizontal rules remain visual objects rather than
  raw delimiter editing surfaces.
- Blockquotes and lists rely on structural presentation rather than caret marker
  decorations.
- MVP visual objects do not add marker-driven borders, code-language inputs, or
  other layout-changing affordances unless separately specified.
- Selection alone does not change marker visibility.

### Local-first

**Status:** Accepted

**Decision:** Leafdown has no accounts, telemetry, cloud sync, or proprietary remote storage.

**Rationale:** The application is built around direct user ownership of local files.

**Consequences:**

- Core workflows function offline.
- Configuration and recent lists persist locally.
- Network access is not required for standard operations.

## Editor Decisions

### Use Milkdown Kit

**Status:** Accepted

**Decision:** Use Milkdown Kit as the hybrid WYSIWYG Markdown editor foundation.

**Rationale:** Milkdown offers an extensible Markdown-first editor foundation with ProseMirror integration, reducing custom core development.

**Consequences:**

- Leverage Milkdown presets and official plugins before writing custom ProseMirror modules.
- Evaluate default plugin behaviors before applying overrides.
- Build the MVP editor through a Leafdown-owned React wrapper around Milkdown
  Kit rather than depending on framework adapters that introduce unwanted editor
  UI packages.

### Accept Milkdown GFM preset behavior

**Status:** Accepted

**Decision:** Use Milkdown's GFM preset for parsing, rendering, and round-trip serialization, including footnotes.

**Rationale:** Maintains feature parity with the underlying editor engine.

**Consequences:**

- Defer to GFM preset defaults unless explicitly overridden by the specification.
- Develop custom UI components only when required by the product specification.

### Do not use Crepe

**Status:** Accepted

**Decision:** Build a custom Leafdown React editor UI directly on top of Milkdown Kit instead of using Crepe.

**Rationale:** Leafdown requires specific document styling, a custom context popup, caret-based marker logic, and custom file navigation.

**Consequences:**

- Milkdown acts as the editor foundation.
- Leafdown owns the surrounding application shell and workflows.
- Prebuilt Crepe UI styling is excluded.
- Dependencies that introduce Crepe transitively are avoided.

## Technical Decisions

### Use Tauri

**Status:** Accepted

**Decision:** Use Tauri for the desktop shell, native dialogs, filesystem access, and packaging.

**Rationale:** Leafdown is a desktop-first application requiring direct local file and directory access.

**Consequences:**

- Native file workflows are handled via Tauri/Rust APIs.
- Desktop packaging is integrated into the primary build pipeline.

### Use React, TypeScript, and Vite

**Status:** Accepted

**Decision:** Use React with TypeScript and Vite for the frontend.

**Rationale:** Requires a modern desktop UI shell with strong typing, fast hot-reloading, and Tauri compatibility.

**Consequences:**

- User interface layout is built as React components.
- TypeScript defines frontend types and integration contracts.
- Vite handles frontend development builds and compilation.

### Use a custom titlebar and menu shell

**Status:** Accepted

**Decision:** Leafdown uses its own titlebar and menu shell.

**Rationale:** The titlebar and menus should blend with Leafdown's aesthetic and command architecture rather than default OS frames.

**Consequences:**

- Window decorations are implemented as custom UI components.
- Menu commands are executed according to the application command model.

## Platform Decisions

### Windows first, cross-platform aware

**Status:** Accepted

**Decision:** Initial polish targets Windows while avoiding unnecessary Windows-only assumptions.

**Rationale:** Windows is the initial target OS; code should remain cross-platform compatible.

**Consequences:**

- Windows UX is optimized first.
- Operating system differences (shortcuts, paths, line endings) are handled explicitly.

### Desktop first, web-possible later

**Status:** Accepted

**Decision:** Leafdown is desktop-first; a limited web version may be explored later.

**Rationale:** Core workflows rely on direct file IO, which is limited or inconsistent in standard web browsers.

**Consequences:**

- Desktop workflows are the primary design target.
- UI components avoid implicit desktop-only assumptions where practical.
- Any future web implementation may require a restricted filesystem subset.

## Distribution Decisions

### Keep Leafdown open source

**Status:** Accepted

**Decision:** Leafdown source code is public and distributed under an open-source license.

**Rationale:** The codebase remains public to support community inspection and contribution.

**Consequences:**

- The repository, source code, and license verify that Leafdown is open source.
- Public contribution workflows leverage the main repository.

### Use GPL-3.0-or-later license

**Status:** Accepted

**Decision:** Leafdown is licensed under GNU General Public License v3.0 or later (`GPL-3.0-or-later`).

**Rationale:** Ensures the codebase remains open source, requiring modified distributions to preserve equivalent rights.

**Consequences:**

- A `LICENSE` file is maintained in the repository root.
- Metadata and About dialogs reference `GPL-3.0-or-later`.
- Contributions are accepted under the project license.

### Free app with optional donation support

**Status:** Accepted

**Decision:** Core functionality is free, with optional donation/support.

**Rationale:** The distribution model must not introduce friction or lockouts in the main editing workflow.

**Consequences:**

- Donation options are located in passive surfaces (Settings, Help, or About).
- All core editing functionality is available without payment.
