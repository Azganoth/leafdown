# Decision Log

This document records important product and technical decisions.

## Decision 001: Build With Tauri

### Status

Accepted

### Context

The app should be lightweight, local-first, and suitable for desktop file-system workflows.

Electron is mature but can produce heavier desktop apps. A native-only GUI stack may make Markdown rendering and hybrid editing harder because the strongest Markdown editor libraries are web-based.

### Decision

Use Tauri as the desktop application framework.

### Reason

Tauri provides a good balance:

- Rust backend for native operations.
- Web frontend for rich Markdown rendering and editing.
- Smaller footprint than typical Electron apps.
- Cross-platform potential.
- Good fit for local file tools.

### Consequences

- The app requires Rust knowledge.
- Some platform-specific packaging work will be needed.
- The frontend can use mature web-based editor/rendering libraries.

---

## Decision 002: Use a Hybrid Editor Instead of a Permanent Split View

### Status

Accepted

### Context

Many Markdown editors use a two-panel source/preview layout.

The desired user experience is closer to editing the rendered document directly, without constantly looking at raw Markdown and preview side by side.

### Decision

The main editing experience will use a hybrid rendered-document editor.

Source mode will exist as a fallback, but the default experience should not be a permanent split view.

### Reason

This better matches the product goal:

- Reader-first.
- Less visual clutter.
- More document-like.
- Faster for casual edits.
- More differentiated from IDE-style Markdown editing.

### Consequences

- Editor implementation is more complex.
- Markdown serialization must be tested carefully.
- Some edge cases may require source mode.
- The editor library choice is critical.

---

## Decision 003: Markdown Files Remain the Source of Truth

### Status

Accepted

### Context

Some editors use an internal database or proprietary document model.

This app is intended for loose Markdown files and ordinary folders.

### Decision

Markdown files on disk are the canonical source of truth.

The app may use an internal editing model while the document is open, but saving must write ordinary Markdown back to disk.

### Reason

This preserves user ownership and keeps the app simple:

- No import step.
- No lock-in.
- No required workspace.
- Files remain usable in other editors.
- Users can keep using Git, backups, or any folder structure they prefer.

### Consequences

- The app must handle Markdown parsing and serialization reliably.
- Some formatting may be normalized by the editor.
- Source mode is required for precise control.

---

## Decision 004: MVP Excludes Mermaid

### Status

Accepted

### Context

Diagram rendering is useful for technical documentation and may become a strong differentiator.

However, the MVP already has a difficult core problem: hybrid Markdown editing.

### Decision

Do not include Mermaid support in the MVP.

### Reason

This keeps the MVP focused on the core file/folder reader/editor experience.

### Consequences

- The MVP is less complete for architecture documentation.
- Mermaid can be added later as a dedicated technical-document feature.
- The initial architecture should avoid blocking Mermaid support later.

---

## Decision 005: MVP Excludes Version History and Diff

### Status

Accepted

### Context

Version history and diff would be valuable because Markdown is plain text.

However, this feature requires storage design, retention policies, diff UI, restore behavior, and conflict handling.

### Decision

Do not include version history or diff in the MVP.

### Reason

The first release should validate the core app experience before adding persistence-heavy features.

### Consequences

- Users must rely on normal saves, backups, or Git for history during MVP.
- The architecture should not make future local history difficult.
- The app should still protect unsaved changes.

---

## Decision 006: No Vault or Workspace Model in MVP

### Status

Accepted

### Context

Many note apps require users to create or open a vault/workspace.

This app should support ordinary files and folders without asking users to adopt a system.

### Decision

Opening a folder does not create a vault, workspace, or project.

The MVP should not write metadata into opened folders.

### Reason

This keeps the app lightweight and trustworthy.

Users should be able to open any documentation folder, browse it, edit files, and leave without changing the folder structure.

### Consequences

- App settings and recent folders must be stored in the app data directory.
- Folder-specific settings are not part of the MVP.
- Future folder metadata must be optional.

---

## Decision 007: Free With Optional Donation Support

### Status

Accepted

### Context

The app should avoid a fully paid product model.

The target audience may respond well to free, local-first software with optional support.

### Decision

The app will be free to use.

Optional donation/support links may be included in non-intrusive places such as the About page or Settings page.

### Reason

This improves adoption and aligns with the product philosophy.

### Consequences

- Revenue is not guaranteed.
- Donation prompts must not interfere with usage.
- Core functionality should not be locked behind payment.

---

## Decision 008: Start Windows-First, Design Cross-Platform

### Status

Accepted

### Context

The initial product angle is strongest on Windows, where lightweight Markdown document viewers/editors are not clearly dominant.

Tauri can support other desktop platforms later.

### Decision

Build and polish for Windows first, while avoiding unnecessary Windows-only assumptions.

### Reason

This reduces initial testing and packaging complexity while keeping future Linux/macOS support possible.

### Consequences

- Windows UX should be prioritized initially.
- Keyboard shortcuts and packaging will need platform-specific handling later.
- The codebase should keep platform abstractions clean.
