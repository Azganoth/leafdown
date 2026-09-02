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
- Show a character reference such as `&copy;`, `&#169;`, or `&#xA9;` as it was written when the caret reaches it, so it can be told apart from the character it names and removing any of its characters turns it into ordinary text.

### Fixed

- Keep the bullet a list was written with, so a file authored with `-` no longer comes back with its lists rewritten into a mixture of `*` and `-` that follows the order the lists appear in, and a `+` list stays a `+` list. An ordered list keeps its own delimiter and the numbers its items were written with, so `3.` followed by `8.` is no longer renumbered to `3.` and `4.`, and `4)` no longer becomes `4.`. The spaces between a marker and its content are kept too, along with an item whose content was written on the line after its marker. A list made in the editor is still written with `*`, or `.` when it is ordered, and two lists that meet with the same marker are still written apart, because Markdown reads them back as one list.
- Show a table written with a header row and no body rows as the table it is, instead of adding an empty row beneath it that holds no cells and takes no text.
- Keep the outer pipes a table's rows were written with, so a table authored without them stays that way instead of gaining one on both sides of every row on the first save. A table inserted from the editor is still written with both, and so is one whose own form would no longer be read back as the table it is.
- Keep the Markdown an image's description was written with, so `![Alt with *emphasis*](leaf.svg)` keeps its emphasis and `![Outer ![inner](inner.svg)](leaf.svg)` keeps the image inside it, instead of flattening the description to its text on open and losing the inner image's destination from the file on the first save. The image is still named by the text its description spells, and a description edited in the raw image Markdown is written as the text typed there.
- Read a typed `*` or `_` run the way Markdown reads the same characters in a file, so `***text*` gives two literal asterisks before italic text, `_**text**` a literal underscore before bold text, and `_**text**_` italic bold, instead of leaving every marker as text that saved with backslashes and reopened without the formatting. A run whose closing marker is shorter than its opening one is read once the caret leaves it, because another marker typed there would spell something else.
- Pair a `*`, `_`, or `~` typed against bold, italic, or strikethrough with the matching literal marker already on the other side of it, so closing `_**text**` with a `_` gives italic bold and saves `_**text**_`, instead of leaving both markers as text that saved as `\_**text**\_` and reopened without the italic. A marker a file keeps literal by escaping it stays literal.
- Leave a `*` or `_` bare on save where it sits directly against bold or italic text written with the same marker, so `***text**` and `**text***` are saved as written instead of gaining a backslash the next read does not need. The marker and the span's own markers spell one run of markers there, and Markdown already leaves the extra one as text. A marker Markdown could still read as a pair keeps its backslash.
- Leave a `*`, `_`, or `~` bare on save wherever nothing else on its line could pair with it, so text such as `[a](b)*` keeps its marker as written instead of collecting a backslash merely because a link, an image, or a bold span shares the line with it. A marker that could still pair keeps its backslash.
- Keep the address of a URL or email address written on its own when a `*`, `_`, or `~` follows it, so text such as `https://example.com*` keeps its link pointing where it did. The backslash the file writes to keep that marker literal was being read back as part of the address, which gained another backslash every time the document was opened and saved.
- Keep a URL or email address written on its own bare when a run shaped like a character reference but naming nothing, such as `&notarealentity;`, follows it, so text such as `https://example.com&notarealentity;` is saved as it was written instead of gaining angle brackets. Markdown leaves such a run outside the link whether or not the name exists.
- Keep a URL or email address written on its own bare when a literal `<` or `>` sits beside it, so text such as `\<test@example.com>` or `&lt;https://example.com&gt;` is saved as it was written, instead of putting angle brackets around it and saving `<<…>>`, which the next open reads as an angle-bracket URL between two literal brackets.
- Keep a horizontal rule written the way it was authored, so `---`, `_ _ _`, or any other accepted run stays as it is instead of being rewritten as `***` on the first save. A rule inserted from the editor is still written as `***`, and so is one whose own run would be read back as a heading underline or as part of its list item's bullet.
- Keep a reference link, a reference image, and the definitions they point at, instead of rewriting every reference as an inline link carrying its own copy of the destination and deleting the definition block on the first save. A definition now appears in the document as the line it is written as, and a reference shows that reference source when the caret reaches it.
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
- Keep a character reference such as `&copy;`, `&#169;`, or `&nbsp;` as it was written, in text and in link and image destinations alike, instead of saving the character it names and turning a file written to stay ASCII into one that is not. Text such as `&#42;not emphasis&#42;` no longer comes back with the marker moved onto a backslash, and a destination written as `&#106;avascript:` is no longer rewritten in the open.
- Leave an ampersand bare where it starts no character reference, so text such as `&copy` without its semicolon, or `&MadeUpEntity;`, no longer gains a backslash on save.
- Read the link that a backslash would prevent, rather than assuming one from the punctuation alone, so text such as `[double-quoted title](garden.md "unclosed)` or `[outer [inner](inner.md) text](outer.md)` keeps its brackets as written. A destination or title that never closes, and a bracket run wrapping a link that already formed, no longer count as links worth escaping.
- Decide that backslash from the whole line rather than from one run of text, so a bracket the line interrupts with a link, raw HTML, or formatting is judged on what the line actually spells. Text such as `<https://example.com path>` now keeps its brackets as written, instead of carrying a backslash whenever the construct it resembles was split apart.
- Leave an angle bracket or a square bracket that cannot open the construct it looks like bare on save, so text such as `<foo.bar.baz>`, `<a:too-short>`, `[missing destination](`, or `[collapsed reference][` keeps its brackets as written, instead of carrying a backslash for a link, autolink, or HTML tag the text never spells.
- Leave a tilde that cannot form a strikethrough where it sits bare on save, so text such as `~ opening space~` or `Inline ~~~three tildes~~~` keeps its tildes as written, instead of putting a backslash before every tilde in the file.
- Write one backslash where one is enough to keep a pair of markers literal, so text such as `\*not emphasis*` or `\~not single-tilde strikethrough~` keeps its closing marker bare, instead of escaping both ends of a pair the first backslash had already broken.
- Apply that same precise escaping to text held inside bold, italic, strikethrough, or a link label, so literal text such as `**\[a](b)**` keeps the one backslash it needs and an underscore inside bold stays bare, instead of gaining the extra backslashes that ordinary text no longer collects.
- Leave a link or image destination that balances its own parentheses bare on save, so a path such as `garden(section(one)).md` keeps its parentheses as written, instead of saving `garden\(section\(one\)\).md`. A parenthesis that would close the destination early still keeps its backslash.
- Leave a block marker bare where the line it opens cannot form the construct, so text such as `#no separator`, `####### seven hashes`, `1234567890. ten digits`, a list starting at two that follows a paragraph line, or a pipe row that no matching delimiter row follows keeps its markers as written, instead of carrying a backslash for a heading, list, or table the line never spells. Hashes followed by a space, a list starting at one that interrupts a paragraph, and a pipe row a matching delimiter row follows all still keep their backslash.
- Leave an ampersand in a link or image destination bare where it starts no character reference, so a destination such as `a.md?x=1&y=2` keeps its query as written, instead of saving `a.md?x=1\&y=2`. A destination ampersand that does begin a reference still keeps its backslash, and a link label holding a literal `&copy;` now keeps its own backslash even where the destination drops one.
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
- Open bold, italic, strikethrough, or a link whose text holds a character reference such as `&copy;` as one Markdown source with the reference in place, instead of opening only the part of the run before the reference beside the rendered rest of it, or nothing at all in a link label.
- Show the backslashes that keep text literal when the Markdown source of bold, italic, or strikethrough is opened, as a link label already did, so text such as `**a \[b](c) d**` no longer reads as though it held a live link and an escaped `&copy;` can be told apart from one the file preserves.
- Keep character references written next to each other as they were written, so text such as `&copy;&copy;` no longer saves as the characters it names. Each one still opens as its own Markdown source, so breaking one leaves the others preserved.
- Keep a link or image title in the quotation marks or parentheses it was written with, so a file holding `[Garden](garden.md 'Garden')` no longer comes back rewritten to double quotes. Editing an image no longer rewrites its title either.
- Leave whitespace that ends a line out of the saved file, so a space typed at the end of a paragraph, heading, list item, quote, or table cell no longer writes a character that the next open discards and a second save then removes. Markdown drops such whitespace on read, so the space was already lost; the file now says so from the first save. Whitespace elsewhere on a line, a hard break, and whitespace inside fenced code are unchanged, and a space written as `&#x20;` at one of those trimmed positions is now dropped on save for the same reason.
- Leave whitespace that starts a line out of the saved file, so a space or tab typed at the start of a paragraph, heading, list item, quote, or table cell no longer writes a character reference that survives one open and is gone after the one following it. Markdown drops such whitespace on read, so the character was already lost; the file now says so from the first save. Whitespace elsewhere on a line and inside fenced code is unchanged, as is a character reference naming something Markdown does not trim, such as `&nbsp;`. A space an author wrote as `&#x20;` at the start of a line is now dropped on save, for the reason one written at the end already is.
- Keep a character Markdown does not trim where it ends a line, so a no-break space, an em space, or an ideographic space closing a paragraph, heading, list item, quote, or table cell is written back as it was read instead of being deleted on the first save. Such a character renders and reloads wherever it is written, so removing it lost text rather than settling the file. A space or tab at the same position is still left out, and one written as `&nbsp;` was never affected.

## [0.1.0-alpha.1] - 2026-07-10

### Added

- Initial internal alpha release.
