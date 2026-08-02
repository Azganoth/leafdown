# Changelog

All notable user-facing changes to Leafdown are documented in this file.

Leafdown uses lightweight [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) sections and version names that match the application package version.

## [Unreleased]

### Added

- Close folder contexts from the File menu.
- Add keyboard shortcuts for formatting task lists and toggling task items.

### Changed

- Sort article directories before articles in the article navigator.
- Separate global application shortcuts, focused editor command shortcuts, and native text-input and clipboard gestures by ownership.
- Extend seamless in-document Markdown source projection to strikethrough, inline code, links, autolinks, and footnote references.
- Present active mixed-format link labels as one coordinated source range.

### Fixed

- Traverse the article navigator with the arrow keys, `Home`, and `End`, and pass it with a single `Tab` instead of one per article.
- Jump to an article by typing the start of its name while the navigator has focus.
- Leave focus on the revealed row after `Reveal in sidebar`, instead of scrolling to it and leaving focus behind.
- Announce the article navigator as a tree, with the nesting depth, sibling position, and expanded state of every row.
- Keep empty folders in the article navigator reachable instead of skipping them.
- Open the editor context popup with `Shift+F10` or the `Menu` key and operate every command in it from the keyboard.
- Keep the editor context popup beside the text it acts on while the document scrolls, and inside the editor for a selection taller than the visible area.
- Hide the editor context popup while its selection is scrolled out of view instead of closing it, and bring it back with the selection.
- Announce the editor context popup as a named toolbar instead of an unnamed dialog.
- Announce recent files and recent folders under their own headings in the `Open recent` menu.
- Disable a submenu instead of opening it empty when every command inside it is unavailable.
- Keep the window controls out of the keyboard tab order, matching native title bar buttons.
- Show a visible focus indicator on menu bar menus and article navigator entries.
- Show the window even when startup initialization fails instead of leaving an invisible process running.
- Close the window on the next close request when the app stops answering, instead of leaving a process that only Task Manager can end.
- Replace saved documents in one step so an interrupted or failed save cannot destroy the previous contents.
- Fall back to default preferences and repair persisted settings or recent items that hold invalid values.
- Follow operating system appearance changes while the system theme is selected.
- Restore monospace glyphs that were missing from bundled builds.
- Keep middle-click and right-click on rendered links from navigating the window away from Leafdown.
- Open confirmed local non-Markdown links with the system default app instead of reporting a failure.
- Block Markdown image and link targets that name network shares or device paths, however they are spelled.
- Prevent Windows CF_HTML transport whitespace from becoming editor content around ProseMirror clipboard fragments.
- Preserve Markdown, rich-text, plain-text, and source-projection semantics when pasting through native keyboard clipboard events.
- Standardize default Copy and Cut payloads and deletion behavior across native keyboard, menu, and context-popup surfaces.
- Copy and Cut commands preserve exact projected Markdown as plain text and semantic rich HTML; projected command cuts stay in projection-local history.
- Project uniformly marked text and contained footnote references as one editable Markdown source range while preserving canonical references, selection, and history.
- Synchronize hover styling across mixed-format rendered link fragments.
- Project multiline link labels as one editable source object while preserving nested formatting, semantic line endings, selection mapping, and history.
- Preserve inline-code boundary backticks while editing projected Markdown source.
- Show a size-aware error when opening a Markdown file that exceeds the loading limit.
- Route Undo and Redo shortcuts through projection-aware editor commands and preserve native history when formatting text inside projected links.
- Route paragraph, heading, list, blockquote, and code-block shortcuts through the same Leafdown commands as menus and popup controls.
- Route inline-formatting keyboard shortcuts through Leafdown commands so they behave consistently with menus and popup controls during source projection.
- Activate source projection for contained text selections and limit each projection to one exact inline mark combination.
- Preserve text and spacing when removing formatting from part of an inline span.
- Exclude trailing whitespace when selecting words by double-clicking text.
- Disable browser and editor writing suggestions in the editor.
- Keep open dialogs visible while dragging the titlebar.
- Stop the context popup from forcing an extra caret move from right-click coordinates.
- Position context popups around the active selection.
- Keep foreign Markdown markers outside active source projections.
- Preserve empty link destinations and GFM link titles while editing projected link source.
- Project mixed-format link labels as one editable source object and preserve one logical outer link wrapper when saving Markdown.
- Let `Enter` and `Shift+Enter` continue through normal editor behavior after committing projected source, immediately project formatted content that moves with the caret, and avoid using `Escape` to close projection.

## [0.1.0-alpha.1] - 2026-07-10

### Added

- Initial internal alpha release.
