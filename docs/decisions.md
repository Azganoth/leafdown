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

- Leafdown normalizes generated Markdown to the default application style.
- Output-formatting customization remains deferred.
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

**Decision:** Opening a folder uses it as the current folder context. Opening a file uses its parent folder as the current folder context only when no folder context is active. Once a folder context exists, it remains pinned until changed by an explicit folder action.

**Rationale:** Keeps folder-aware workflows available while preventing the article navigator from unexpectedly collapsing to nested or unrelated document parent folders.

**Consequences:**

- The sidebar matches the pinned folder context, not necessarily the active document's parent folder.
- Opening a single file scans its parent folder context only as a bootstrap path when no folder context is active.
- Opening Markdown documents outside the current folder context does not switch or prompt for a folder-context change.
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

**Decision:** Leafdown chooses editable markers, subtle markers, persistent markers, or visual object affordances per Markdown object instead of applying one syntax-reveal rule to every object.

**Rationale:** Milkdown already provides structural editing for many block objects, while inline and source-oriented objects still benefit from local raw Markdown editing.

**Consequences:**

- The specification's marker visibility and presentation rules own the per-object behavior.
- Tables, code blocks, and horizontal rules remain visual objects rather than raw delimiter editing surfaces.
- Blockquotes and lists rely on structural presentation rather than caret marker decorations.
- Visual objects do not add marker-driven borders, code-language inputs, or other layout-changing affordances unless separately specified.
- Selection alone does not change marker visibility.

### Local-first

**Status:** Accepted

**Decision:** Leafdown has no accounts, telemetry, cloud sync, or proprietary remote storage.

**Rationale:** The application is built around direct user ownership of local files.

**Consequences:**

- Core workflows function offline.
- Configuration and recent lists persist locally.
- Network access is not required for standard operations.

### User-accessible debugging

**Status:** Accepted

**Decision:** Leafdown intentionally exposes webview DevTools to users for local debugging and support, and writes bounded diagnostic logs to an app-owned local logs directory.

**Rationale:** Leafdown is a local-first desktop app. When a user encounters a rendering, editor, filesystem, or platform-specific problem, local inspection is the fastest way to collect useful debugging context without adding telemetry or requiring a special debug build.

**Consequences:**

- The Help menu includes an `Open DevTools` action in user builds.
- The Help menu includes a `Diagnostics...` dialog with actions to open the local logs folder and copy a concise diagnostics summary.
- DevTools availability is a support feature, not a telemetry mechanism.
- Leafdown does not upload console output, logs, document contents, or diagnostic data automatically.
- Diagnostic logs may include operation labels, error kinds, lifecycle events, timing metadata, error messages, stack traces, and local file paths needed to debug filesystem workflows.
- Diagnostic log files use JSON Lines: each line is one JSON object with backend-owned envelope fields such as UTC timestamp, diagnostic run ID, target, and level, plus event-specific diagnostic fields.
- Leafdown must not explicitly add Markdown document text to diagnostic logs or copied summaries.
- Captured browser, editor, or library error messages and stack traces may still contain user content if that content is part of the thrown error.
- Frontend diagnostic payload normalization may truncate long strings and omit unsupported diagnostic values, but it is not privacy redaction.
- Diagnostic logs live in Tauri's app log directory: `%LOCALAPPDATA%\com.azganoth.leafdown\logs` on Windows, `~/Library/Logs/com.azganoth.leafdown` on macOS, and `$XDG_DATA_HOME/com.azganoth.leafdown/logs` or `~/.local/share/com.azganoth.leafdown/logs` on Linux.
- Local log storage is bounded by a 1 MiB active log file and five retained log files.
- Documentation and release hardening must treat DevTools as intentionally available rather than development-only.

## Editor Decisions

### Use Milkdown Kit

**Status:** Accepted

**Decision:** Use Milkdown Kit as the hybrid WYSIWYG Markdown editor foundation.

**Rationale:** Milkdown offers an extensible Markdown-first editor foundation with ProseMirror integration, reducing custom core development.

**Consequences:**

- Leverage Milkdown presets and official plugins before writing custom ProseMirror modules.
- Evaluate default plugin behaviors before applying overrides.
- Build the editor through a Leafdown-owned React wrapper around Milkdown Kit rather than depending on framework adapters that introduce unwanted editor UI packages.

### Accept Milkdown GFM preset behavior

**Status:** Accepted

**Decision:** Use Milkdown's GFM preset for parsing, rendering, and round-trip serialization, including footnotes.

**Rationale:** Maintains feature parity with the underlying editor engine.

**Consequences:**

- Defer to GFM preset defaults unless explicitly overridden by the specification.
- Bare GFM URL literals and angle-bracket autolinks share Milkdown's canonical link representation. Milkdown serializes eligible bare URLs as `<https://…>`, so source projection exposes that canonical serialized form. Leafdown does not preserve bare-versus-angle source provenance or bypass projection for bare URLs.
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

### Use temporary source projection

**Status:** Accepted

**Decision:** Use temporary source projection for supported Markdown objects: expose the active object's Markdown as editable document text, then rehydrate valid source as canonical Milkdown content or preserve invalid source as literal text.

**Rationale:** Temporary projection lets marker characters occupy ordinary ProseMirror text positions without replacing Milkdown. Decorations and widgets cannot make synthetic markers natively editable without recreating selection, deletion, clipboard, IME, and keyboard behavior. A permanent Markdown-token schema would conflict with Milkdown's CommonMark/GFM model, parser, serializer, clipboard behavior, and node and mark assumptions. The approach was selected in [issue #44](https://github.com/Azganoth/leafdown/issues/44) and [pull request #46](https://github.com/Azganoth/leafdown/pull/46), then generalized through [issue #63](https://github.com/Azganoth/leafdown/issues/63) and [pull request #64](https://github.com/Azganoth/leafdown/pull/64).

**Consequences:**

- Milkdown's canonical model remains the default; projected source is transient and never becomes saved semantic content.
- Active marker characters are ordinary unmarked document text rather than widget content.
- A clean session restores its original target exactly. Projection entry and exit are housekeeping, while user edits remain ordinary editor changes managed through an explicit projection-session history bridge.
- Projection finalizes before serialization. Valid source rehydrates semantic content; invalid source becomes literal text so no projected character is lost.
- Marker presentation remains separate from projection lifecycle.
- Architecture owns projection lifecycle and adapter boundaries; Specification owns supported objects and observable editing behavior.

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

### Gate on defect classes automation can reach

**Status:** Accepted

**Decision:** An automated gate is adopted when it catches a defect class this project actually produces, and rejected when it mainly produces work. Coverage floors ratchet below the measured numbers instead of setting targets.

**Rationale:** A review of the substantive `fix:` commits found that none would have been caught by the linter or the type checker. The failures were boundary-semantics defects: a Tauri capability scope that denied every path, an asset grant that stored without matching, OS clipboard formats, Windows path grammar reaching a network host, persisted state trusted at its type, and a theme subscription that was simply absent. Tests are the gate that protects this codebase, so tooling that cannot reach those classes spends attention without reducing risk.

**Consequences:**

- Per-file coverage thresholds are rejected. They would catch the "this file's happy path is untested" shape, but fail immediately against several command actions and would require an exemption list that becomes its own maintenance surface.
- SHA-pinned GitHub Actions are rejected. Every publisher in use is well known, and without automated bumps a pinned digest rots into a dependency that stops receiving security patches, which is worse than a major tag.
- A blocking `pnpm audit` step is rejected. It fails builds on transitive tooling advisories with no available fix, in a desktop application with no server surface. GitHub's Dependabot alerts already deliver the same signal without blocking.
- Dependabot version updates are deferred rather than adopted. Alerts are already enabled, and past advisories were resolved through routine dependency updates without automation.
- `cargo audit` gates on vulnerability advisories only. The lockfile carries unmaintained and unsound warnings that are almost entirely GTK3 crates present for Linux targets and never compiled into the Windows bundle, so a green audit is not evidence that every dependency is maintained.
- A save that truncates before writing is reachable only by a test that forces the write to fail. Coverage does not help: the happy path is tested, so any coverage measure reports the line as covered while the defect sits in the window between two syscalls.
- A full `tauri build` is deferred off the pull request path. Installer bundling is genuinely unchecked until a release tag, but a Tauri build on every pull request costs minutes against a failure that arrives rarely. It belongs on a manual dispatch or a pre-release run.
- Version consistency across the manifests is a release checklist line rather than a script. The four values are read once per release by one person, and a script would carry a permanent special case for the WiX four-part numeric form.
- The pre-commit hook does not apply lint fixes. Formatting is semantically inert and stays; an autofix can change code between the diff the author read and the commit that lands, and the hook was observed rewriting nothing across the changes that introduced these gates.

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
