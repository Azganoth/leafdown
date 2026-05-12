# Roadmap

## Development Strategy

Build the app in small phases.

The MVP should prove the core product:

> Open Markdown files and folders quickly, read them comfortably, edit them with a hybrid editor, and save them back as normal Markdown.

Do not add Mermaid, version history, diff, Git, cloud, plugins, or advanced exports until the core experience feels good.

## Phase 0: Research and Prototype

Goal: validate the technical foundation before building the full app.

### Tasks

- Create a minimal Tauri app.
- Test the preferred frontend framework.
- Test candidate hybrid editor.
- Test Markdown load/save.
- Test source mode with CodeMirror or alternative.
- Test file open/save commands from Rust.
- Test folder scanning from Rust.
- Verify app startup speed.

### Success Criteria

- A Markdown file can be opened from disk.
- Markdown can be displayed in an editable surface.
- Edited content can be serialized back to Markdown.
- The file can be saved successfully.
- Source mode is technically feasible.

## Phase 1: Single-File MVP

Goal: make opening and editing one Markdown file work well.

### Features

- Open `.md` file.
- Render Markdown in document view.
- Hybrid editing.
- Source mode fallback.
- Save.
- Save As.
- Unsaved changes indicator.
- Close confirmation for unsaved changes.
- Basic light/dark/system theme.
- Recent files.

### Success Criteria

- User can open a loose Markdown file.
- User can read it comfortably.
- User can edit and save it.
- User can reopen the file and see saved changes.
- User can use source mode if hybrid editing fails.

## Phase 2: Folder Browsing

Goal: support folders of Markdown documents without creating a vault or workspace.

### Features

- Open folder.
- Markdown file tree.
- Nested folder support.
- Default file selection.
- Recent folders.
- Navigate between files.
- Unsaved changes prompt before switching files.
- Open relative Markdown links inside the app.

### Success Criteria

- User can open a folder of Markdown files.
- User can browse files from a sidebar.
- User can move between documents safely.
- The app does not write metadata into the folder.

## Phase 3: Reading Polish

Goal: make the app feel like a polished document reader, not just an editor.

### Features

- Improved typography.
- Better document spacing.
- Styled tables.
- Styled code blocks.
- Styled blockquotes.
- Image display polish.
- Missing image placeholder.
- Optional heading outline.
- Current document search.

### Success Criteria

- Markdown documents feel comfortable to read.
- Technical documents are visually clear.
- Large documents remain usable.

## Phase 4: Editing Polish

Goal: improve the hybrid editing experience.

### Features

- Better cursor behavior.
- Better list editing.
- Better code block editing.
- Better link editing.
- Better table handling if feasible.
- Better paste handling.
- More reliable Markdown serialization.
- Keyboard shortcut refinement.

### Success Criteria

- Hybrid editing feels reliable enough for daily use.
- Source mode is still available but not required for common edits.
- Saving does not unexpectedly damage Markdown structure.

## Phase 5: MVP Release Preparation

Goal: prepare the first public version.

### Features

- App icon.
- Installer/build pipeline.
- Basic settings page.
- About page.
- Donation/support link.
- Error message polish.
- First-run experience.
- Manual QA checklist.
- GitHub Releases setup.
- Windows packaging.

### Success Criteria

- App can be installed and used by someone other than the developer.
- Core workflows work without explanation.
- The app has a clear identity and minimal polish.

## Phase 6: Post-MVP Candidates

These features are not part of the MVP.

### Candidate Features

- Mermaid support.
- Version history.
- Diff viewer.
- Folder-wide search.
- Tabs.
- Export to PDF/HTML.
- Math rendering.
- Frontmatter display.
- Git awareness.
- Portable mode.
- Linux build.
- macOS build.
- More themes.
- User-customizable CSS.

## Priority Table

### Must Have for MVP

- Open single Markdown file.
- Render Markdown.
- Hybrid edit Markdown.
- Source mode fallback.
- Save and Save As.
- Unsaved changes protection.
- Open folder.
- Markdown file tree.
- Navigate between folder documents.
- Relative Markdown links.
- Relative images.
- Light/dark/system theme.
- Recent files/folders.

### Should Have for MVP

- Heading outline.
- Current document search.
- Basic settings.
- File association on Windows.
- Clear missing image placeholder.
- Better code block styling.
- Basic keyboard shortcut customization.

### Could Have Later

- Folder-wide search.
- Tabs.
- Export.
- Custom CSS.
- Portable build.
- Linux/macOS builds.
- Frontmatter support.
- Math support.

### Not Now

- Mermaid support.
- Version history.
- Diff viewer.
- Git integration.
- Cloud sync.
- Accounts.
- Collaboration.
- Plugin marketplace.
- Graph view.
- Backlinks.
- Daily notes.
- AI features.
