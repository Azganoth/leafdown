# Changelog

All notable user-facing changes to Leafdown are documented in this file.

Leafdown uses lightweight [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) sections and version names that match the application package version.

## [Unreleased]

### Added

- Add a paragraph at the end of the document by clicking the empty space below it.
- Close folder contexts from the File menu.
- Add keyboard shortcuts for formatting task lists and toggling task items.

### Changed

- Sort article directories before articles in the article navigator.
- Ease the editor context popup between selection-driven positions while keeping scroll tracking immediate.
- Separate global application shortcuts, focused editor command shortcuts, and native text-input and clipboard gestures by ownership.
- Extend seamless in-document Markdown source projection to strikethrough, inline code, links, autolinks, and footnote references.
- Present active mixed-format link labels as one coordinated source range.
- Extend link label source projection to labels that contain an image, such as badge links.
- Keep a URL written on its own as it was written, bare or between angle brackets, instead of putting angle brackets around every bare URL in the file on the first save.
- Turn a typed link, URL, or angle-bracket URL into the link it describes once the caret leaves it, as pasting the same text already did.
- Show the backslash that keeps link or image text literal when the caret reaches it, so deleting the backslash turns the text into the link or image it describes.
- Turn typed image text into the image it describes once the caret leaves it, as typed link text already did.

### Fixed

- Leave a URL, email address, or `www` address held as ordinary text without a backslash before its `:`, `@`, or `.`, so a saved file no longer carries an escape such as `https\://example.com`, instead of writing one that other Markdown tools read as a stray backslash and that turned back into a link on the next open regardless.
- Copy text the editor keeps literal with the backslashes the file is saved with, so pasting it elsewhere keeps it literal instead of turning it into a heading, a link, or emphasis.
- Keep bold, italic, strikethrough, inline code, a link, or a footnote reference whole when a character is typed immediately after its open Markdown source, placing the character after the construct, instead of losing a letter from the text or turning the construct into literal text that saves with escapes.
- Write a typed `~~strikethrough~~` as the strikethrough it spells, instead of adding a stray tilde on each side that stayed in the text and saved with escapes. A tilde run that has not been closed yet now stays plain text, as it already did when the same source was opened from a file.
- Keep typing after a bold, italic, strikethrough, or inline-code construct you just finished outside it, instead of pulling the rest of the sentence into the formatting. Nesting one construct in another, such as `**~~text~~**`, now works as typed.
- Keep a bullet list written without blank lines between its items tight on save, as ordered lists already were, instead of spacing every item apart and changing how the list renders.
- Keep a line break written immediately before raw HTML, instead of merging the two lines into one on save and, where the break was a hard one, leaving a backslash behind in the text.
- Fit a table row holding more or fewer cells than its header to the header's columns, whether the table is opened from a file or pasted in, instead of writing every row at the widest row's width on the next save and, in a pasted table, moving cell content into other columns.
- Read a backslash typed into an open link or footnote-reference source as the escape it spells, so the run turns into the text it describes and saves with one backslash, instead of keeping the backslash as a character and saving three.
- Keep a link or footnote reference whole when a character is typed at the start of its open Markdown source, instead of turning the whole construct into literal text that saves with escapes.
- Write a backslash on save only where the character it precedes would otherwise be read as Markdown, so text such as `garden_sensor_name` keeps its underscores bare, instead of escaping every character that could be syntax somewhere else.
- Leave an angle bracket or a square bracket that cannot open the construct it looks like bare on save, so text such as `<foo.bar.baz>`, `<a:too-short>`, `[missing destination](`, or `[collapsed reference][` keeps its brackets as written, instead of carrying a backslash for a link, autolink, or HTML tag the text never spells.
- Leave a tilde that cannot form a strikethrough where it sits bare on save, so text such as `~ opening space~` or `Inline ~~~three tildes~~~` keeps its tildes as written, instead of putting a backslash before every tilde in the file.
- Apply that same precise escaping to text held inside bold, italic, strikethrough, or a link label, so literal text such as `**\[a](b)**` keeps the one backslash it needs and an underscore inside bold stays bare, instead of gaining the extra backslashes that ordinary text no longer collects.
- Keep a list item that starts with a code block, table, quote, nested list, heading, or thematic break nested in the saved file, instead of writing an empty item and leaving the block outside the list the next time the document is opened.
- Escape text the editor keeps literal even when a space follows it, instead of writing it as live Markdown that turns into something else the next time the document is opened.
- Open the Markdown source of a link whose label holds a footnote reference, instead of leaving it closed everywhere in the label except on the reference itself.
- Keep a link label that mixes formatted text with a footnote reference as one link, instead of saving it as two links.
- Open bold, italic, or strikethrough that wraps a link as one Markdown source with the link inside it, instead of one side of the link at a time with markers that do not match the file.
- Keep bold, italic, or strikethrough that wraps a link when the label repeats the same formatting inside it, instead of dropping the wrapper on save.
- Keep a strikethrough that wraps a link outside the link on save, as bold and italic already are, instead of rewriting it inside the label.
- Open a bold, italic, or struck-through span that continues after a line break as one Markdown source, instead of one line at a time with markers that do not match the file.
- Keep formatting when text spanning two lines is pasted into an open Markdown source, instead of splitting the markers and saving them as escaped characters.
- Paste an image or formatted text into an open link label as its Markdown source, so the link keeps it instead of the paste doing nothing.
- Paste content that carries no plain text into an open Markdown source, such as an image copied from a web page, instead of the paste doing nothing.
- Keep formatting when text is composed with an IME between the markers of an open Markdown source, instead of splitting the markers and saving them as escaped characters.
- Undo text composed with an IME inside an open Markdown source, instead of leaving undo enabled but inert until the source closes.
- Mark the document as changed when text is composed with an IME inside an open Markdown source, instead of reporting it as clean so the composed text is discarded on close without a prompt.
- Keep a link label that mixes formatted text with an image as one link, instead of saving it as two links.
- Copy part of an image's Markdown inside an open link label as literal text, instead of copying the whole image.
- Keep a line break inside a link label when the browser rewrites the text around it, instead of silently replacing the break with a space and saving the label on one line.
- Keep only the accepted candidate when typing with an IME while a Markdown source is open, instead of leaving every intermediate composition state behind.
- Keep a link intact when undoing an edit made while its Markdown source was open, instead of dropping the link and its destination to plain text.
- Keep an authored `<br>` in the document instead of deleting it on open and losing it on save.
- Stop writing `<br />` into saved files to mark a blank paragraph, which other Markdown readers render as a visible line break.
- Keep a footnote definition whose content begins with raw HTML, instead of dropping the definition.
- Traverse the article navigator with the arrow keys, `Home`, and `End`, and pass it with a single `Tab` instead of one per article.
- Jump to an article by typing the start of its name while the navigator has focus.
- Leave focus on the revealed row after `Reveal in sidebar`, instead of scrolling to it and leaving focus behind.
- Keep focus in the article navigator when a folder refresh removes the focused row, instead of dropping it to the start of the window.
- Announce the article navigator as a tree, with the nesting depth, sibling position, and expanded state of every row.
- Keep empty folders in the article navigator reachable instead of skipping them.
- Open the editor context popup with `Shift+F10` or the `Menu` key and operate every command in it from the keyboard.
- Open the editor context popup from a selection made with the keyboard, `Select all` included, instead of only from a pointer selection.
- Open the editor context popup from a selection dragged out of the editor and released over the article navigator, other application chrome, or outside the window.
- Keep the editor context popup beside the text it acts on while the document scrolls, and inside a selection too tall to sit beside.
- Move the editor context popup onto the selection as it changes, instead of leaving it where it opened.
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
