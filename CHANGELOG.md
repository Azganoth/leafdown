# Changelog

All notable user-facing changes to Leafdown are documented in this file.

Leafdown uses lightweight [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
sections and version names that match the application package version.

## [Unreleased]

### Added

- Close folder contexts from the File menu.
- Add keyboard shortcuts for formatting task lists and toggling task items.

### Changed

- Sort article directories before articles in the article navigator.
- Extend seamless in-document Markdown source projection to strikethrough,
  inline code, links, and autolinks.

### Fixed

- Preserve text and spacing when removing formatting from part of an inline span.
- Exclude trailing whitespace when selecting words by double-clicking text.
- Disable browser and editor writing suggestions in the editor.
- Keep open dialogs visible while dragging the titlebar.
- Stop the context popup from forcing an extra caret move from right-click
  coordinates.
- Position context popups around the active selection.
- Keep foreign Markdown markers outside active source projections.
- Preserve empty link destinations and GFM link titles while editing projected
  link source.
- Let `Enter` and `Shift+Enter` continue through normal editor behavior after
  committing projected source, immediately project formatted content that moves
  with the caret, and avoid using `Escape` to close projection.

## [0.1.0-alpha.1] - 2026-07-10

### Added

- Initial internal alpha release.
