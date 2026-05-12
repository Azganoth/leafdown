# Vision

## Product Summary

The app is a fast, local-first Markdown reader/editor for opening loose Markdown files and folders of Markdown documents.

It is designed for users who want to quickly read and edit Markdown documents without adopting a full notes system, IDE, vault, workspace, cloud service, or project structure.

The app should feel closer to a lightweight document viewer than a complex writing environment.

## Core Idea

A clean desktop app for opening Markdown files and folders, reading them comfortably, and editing them directly through a hybrid rendered-document editing experience.

## Target Users

- Developers who read and edit `README.md`, documentation, notes, and project files.
- Technical writers who maintain local Markdown documentation.
- Students or learners who store notes as Markdown files.
- Users who dislike heavy knowledge-base tools but still want a polished Markdown experience.
- Users who want free, local-first software for ordinary Markdown files.

## Primary Use Cases

### Open a Single Markdown File

The user double-clicks or opens a `.md` file and immediately sees a clean rendered document.

The app should support quick reading first, with editing available when needed.

### Open a Folder of Markdown Documents

The user opens a folder containing Markdown files and browses them through a simple file tree.

The folder must remain a normal folder. The app should not require a vault, workspace, import process, database, or account.

### Edit a Markdown Document

The user edits the rendered document using a hybrid editor.

Markdown syntax should appear only when useful. The editing experience should be more comfortable than a plain source editor and less cluttered than a split editor/preview layout.

### Use Source Mode as a Fallback

The user can switch to raw Markdown source mode when precise control is needed.

## Product Principles

### 1. Reader First

The default experience should prioritize reading clarity, typography, spacing, and navigation.

Editing is important, but the app should not feel like a code editor by default.

### 2. Local First

Files stay on the user's machine.

The app should not require accounts, sync, cloud storage, telemetry, or proprietary file formats.

### 3. Loose Files Are First-Class

The app should work well with individual Markdown files, not only folders.

Opening a single file should feel natural and complete.

### 4. Folders Are Just Folders

Opening a folder should not create a vault or project unless the user explicitly enables optional app metadata in the future.

For the MVP, no project metadata should be written into opened folders.

### 5. Markdown Remains the Source of Truth

The app may use an internal document model while editing, but saved files must remain ordinary Markdown files.

### 6. Minimal But Not Barebones

The app should avoid feature bloat, but it should feel polished.

The goal is not to build another minimal text editor. The goal is to build a focused Markdown document app.

## Differentiation

### Compared to Typora

Typora is close to the desired editing model, but this app should focus more strongly on quick file/folder opening, document browsing, Windows-first polish, and free access.

### Compared to Obsidian

Obsidian is powerful but oriented around vaults, knowledge management, plugins, backlinks, and personal knowledge systems.

This app should stay simpler and more document-oriented.

### Compared to VS Code

VS Code is excellent for developers, but it is an IDE.

This app should be lighter, more readable, and more suitable for opening Markdown documents as documents.

### Compared to Zettlr

Zettlr is powerful for academic writing and structured writing workflows.

This app should be simpler, faster, and more focused on general Markdown reading/editing.

## MVP Positioning

A free, local-first Markdown reader/editor for opening loose files and folders, with a polished reader-first interface and hybrid editing.

## MVP Non-Goals

The MVP will not include:

- Mermaid or diagram rendering.
- Version history or diff.
- Git integration.
- Cloud sync.
- User accounts.
- Plugin system.
- Backlinks.
- Graph view.
- Daily notes.
- Databases.
- Kanban boards.
- AI features.
- Collaboration.
- Mobile apps.
- Full publishing system.
- Advanced export system.
- Complex theme marketplace.
