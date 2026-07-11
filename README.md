# Leafdown

Leafdown is an open-source, local-first Markdown desktop app for ordinary files
and folders. It is built for quickly opening, reading, and editing Markdown
without adopting a vault, workspace, cloud service, or IDE.

The app is in internal alpha development. The MVP editing workflow is implemented,
but the project is not packaged for broad redistribution yet.

## What It Does

- Opens individual Markdown files and ordinary folders.
- Shows supported Markdown files in a folder-aware article navigator.
- Provides one hybrid WYSIWYG Markdown editor instead of split source/preview
  panes.
- Saves clean Markdown back to disk while preserving Markdown semantics.
- Handles dirty documents, recent files and folders, local links, local images,
  and filesystem watcher refreshes.
- Runs offline without accounts, telemetry, cloud sync, or project metadata in
  opened folders.

## Current Scope

Leafdown currently targets CommonMark and GitHub Flavored Markdown content:
headings, paragraphs, emphasis, strong text, inline code, code blocks,
blockquotes, lists, links, images, horizontal rules, tables, task lists,
strikethrough, autolinks, and footnotes.

The first alpha is focused on local dogfooding and release hardening. Larger
post-MVP features such as find and replace, file tabs, sidebar file operations,
export, printing, updater support, additional platforms, and internationalized
UI are tracked separately in the backlog.

## Screenshots

![Leafdown welcome screen](./docs/assets/readme/welcome-screen.png)

![Leafdown editing a Markdown document](./docs/assets/readme/document-editor.png)

## Documentation

See [docs/README.md](./docs/README.md) for product and architecture
documentation.

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the project workflow and
contribution conventions.

## License

This project is licensed under the [GNU General Public License v3.0 or later](./LICENSE).
