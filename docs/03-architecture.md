# Architecture

## Overview

The app will be built with Tauri.

The architecture is split into:

- Rust backend for native desktop capabilities.
- Web frontend for the user interface, Markdown rendering, and hybrid editing.
- Local file system as the source of truth.

The app should avoid backend complexity until required.

## High-Level Structure

```text
App
├─ Tauri Shell
├─ Rust Backend
│  ├─ File operations
│  ├─ Folder scanning
│  ├─ Recent files/folders
│  ├─ Settings persistence
│  └─ Native dialogs
└─ Frontend
   ├─ Document view
   ├─ Hybrid editor
   ├─ Source editor
   ├─ File tree
   ├─ Markdown rendering
   └─ App state
```

## Technology Choices

### Desktop Framework

Use Tauri.

Reasons:

- Small desktop app footprint compared with Electron.
- Rust backend.
- Good fit for local file-system utilities.
- Cross-platform potential.
- Web frontend flexibility.

### Frontend Framework

Recommended options:

- React
- Svelte
- Solid

Pick one based on developer comfort.

The MVP does not require a complex frontend architecture. The priority is reliable editor behavior and clean UI.

### Hybrid Editor

Recommended direction:

- ProseMirror-based editor.
- Milkdown is a candidate because it is Markdown-oriented and Typora-like.

The editor must support:

- Rendering Markdown as editable document blocks.
- Serializing edited content back to Markdown.
- Source mode fallback.

### Source Editor

Recommended direction:

- CodeMirror 6.

Used for:

- Raw Markdown source mode.
- Possibly code block editing inside the hybrid editor.

### Markdown Processing

The app should use a Markdown pipeline that supports:

- CommonMark-style Markdown.
- GitHub-Flavored Markdown features if feasible.
- Tables.
- Task lists.
- Code blocks.
- Links.
- Images.

The selected editor library may influence the final Markdown parser/serializer.

Important requirement:

Markdown serialization should preserve user intent and avoid destructive formatting changes where practical.

## Rust Backend Responsibilities

The Rust backend should handle:

### File Operations

- Open file.
- Read file.
- Save file.
- Save file as.
- Check file existence.
- Check basic file metadata.
- Detect permission errors.

### Folder Operations

- Open folder.
- Scan for Markdown files.
- Build file tree data.
- Handle nested directories.
- Ignore heavy or irrelevant directories where appropriate.

Potential ignored directories:

```text
.git/
node_modules/
target/
dist/
build/
.cache/
```

This ignore list can be configurable later.

### Native Dialogs

- Open file dialog.
- Open folder dialog.
- Save as dialog.

### Settings Persistence

Store app settings in the platform-appropriate app data directory.

Settings may include:

- Theme.
- Font size.
- Recent files.
- Recent folders.
- Window size and position.

### Recent Files and Folders

Maintain a small recent list.

Suggested limits:

- 10 recent files.
- 10 recent folders.

## Frontend Responsibilities

The frontend should handle:

### UI Layout

- Welcome screen.
- Single file layout.
- Folder layout.
- Document area.
- File tree sidebar.
- Optional outline sidebar.
- Settings UI.

### Document Rendering

- Render Markdown in a polished reading style.
- Support images and links.
- Support code block styling.
- Support table styling.

### Hybrid Editing

- Provide rendered-document editing.
- Track unsaved changes.
- Serialize changes back to Markdown.
- Handle editor focus and keyboard shortcuts.

### Source Mode

- Display raw Markdown.
- Allow direct editing.
- Save content.
- Switch back to hybrid mode.

### App State

Track:

- Current file path.
- Current folder path.
- Current Markdown content.
- Current editor mode.
- Unsaved changes.
- File tree.
- Recent files/folders.
- Theme.

## Data Flow

### Open File Flow

```text
User selects file
→ frontend calls backend open/read command
→ backend returns file content and metadata
→ frontend stores current file path
→ frontend parses/renders Markdown
→ app marks document as clean
→ recent files updated
```

### Save File Flow

```text
User saves
→ frontend serializes editor state to Markdown
→ frontend calls backend save command
→ backend writes content to disk
→ frontend marks document as clean
```

### Open Folder Flow

```text
User selects folder
→ frontend calls backend folder scan command
→ backend returns Markdown file tree
→ frontend displays sidebar
→ frontend selects default file
→ selected file is opened
→ recent folders updated
```

### Switch to Source Mode Flow

```text
Hybrid editor state
→ serialize to Markdown
→ load Markdown into source editor
→ user edits source
→ on switch back, parse Markdown into hybrid editor
```

## File Tree Model

A file tree item should contain:

```ts
type FileTreeItem = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeItem[];
};
```

Only Markdown files are required for the MVP.

## Settings Model

Initial settings:

```ts
type AppSettings = {
  theme: "system" | "light" | "dark";
  fontSize: number;
  recentFiles: string[];
  recentFolders: string[];
  window?: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
};
```

## Security and Privacy

The MVP should be local-first.

Default behavior:

- No account.
- No telemetry.
- No cloud sync.
- No remote content fetching unless the Markdown references remote resources and the user allows loading them.
- No execution of arbitrary scripts from Markdown content.

Raw HTML inside Markdown should be sanitized or disabled in rendered mode.

External links should open in the system browser.

Local file links should be handled carefully and should not grant broad file access beyond what the user opened or selected.

## File Watching

File watching is useful but not required for the earliest MVP.

If implemented, behavior should be:

- Detect when the current file changes externally.
- If there are no unsaved edits, reload or ask the user.
- If there are unsaved edits, warn about conflict.
- Do not silently overwrite user changes.

File watching can be postponed if it slows initial development.

## Persistence

The MVP should persist only:

- Settings.
- Recent files.
- Recent folders.
- Window state, optional.

The MVP should not write metadata into user folders.

## Testing Priorities

The architecture should be tested around the most failure-prone areas:

### Markdown Round Trip

Markdown input should survive:

```text
Markdown → editor state → Markdown
```

without unexpected data loss.

### File Operations

Test:

- Open existing file.
- Save file.
- Save as new file.
- Permission error.
- Deleted file.
- Invalid path.

### Folder Scanning

Test:

- Empty folder.
- Folder with nested Markdown files.
- Folder with many files.
- Folder with ignored directories.
- Folder with no Markdown files.

### Relative Assets

Test:

- Relative Markdown links.
- Relative images.
- Missing images.
- Broken links.

## MVP Architecture Non-Goals

The MVP architecture should not include:

- Version history storage.
- Diff engine.
- Git integration.
- Mermaid rendering pipeline.
- Plugin system.
- Sync engine.
- Collaboration backend.
- User accounts.
- Remote database.
