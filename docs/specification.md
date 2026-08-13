# Specification

Leafdown is a local-first Markdown editor for files and folders, designed as a focused document editor rather than a notes vault, IDE, cloud workspace, or split-pane preview tool.

Items marked `Deferred` describe approved future behavior. They are not implemented, but should inform future design and implementation.

## Product Principles

- Markdown files remain the source of truth.
- Normal files and folders are first-class; Leafdown does not require a vault, workspace, import process, database, or app metadata inside opened folders.
- Leafdown is folder-aware without treating the active file's parent as the navigation root after every document change. Opening a file creates a folder context from its parent only when no folder context is active; otherwise the current folder context remains pinned until an explicit folder action changes it.
- The document surface is one hybrid WYSIWYG Markdown editor.
- Leafdown does not use a permanent source/preview split or separate read/edit modes.

## Supported Content

Supported files are `.md` and `.markdown` formats.

Leafdown supports the following CommonMark and GitHub Flavored Markdown (GFM) features, plus footnotes:

- Headings
- Paragraphs
- Emphasis
- Strong
- Inline code
- Code blocks
- Blockquotes
- Ordered lists
- Unordered lists
- Links
- Images
- Horizontal rules
- Tables
- Task lists
- Strikethrough
- Autolinks
- Footnotes

Unsupported Markdown is outside Leafdown's supported editing surface. Leafdown treats it as literal text where possible, but does not guarantee recognition, editable semantics, or byte-for-byte round-tripping after a save.

## Interface Model

Primary user interface surfaces:

- **App shell:** wraps the custom titlebar, menu bar, article navigator, document surface, and modal layer.
- **Welcome screen:** appears when no document or folder context is open. It offers open file, open folder, recent files, and recent folders.
- **Menu bar:** provides top-level app commands grouped by File, Edit, Insert, Format, View, and Help.
- **Document surface:** contains the active hybrid Markdown editor. In a folder-only session, it displays a centered placeholder illustration and text prompting the user to select an article or create a new file.
- **Article navigator:** shows articles (supported Markdown files) from the current folder context in a nested tree. Non-Markdown files and ignored directories are hidden. Non-ignored directories may appear even when they have no supported Markdown files. Directories are listed before articles within each folder, then the selected article sort order is applied within each group. Folder scans skip symlinked entries rather than following them. When the active saved document is outside the current folder context, the article navigator keeps showing the current folder context and displays a compact detached-document message instead of selecting an article. The article navigator is currently read-only; file creation, renaming, and deletion must be managed through the OS file explorer or via document saving workflows.
- **Context popup:** provides quick document actions from selection or right-click.
- **Modal layer:** presents secondary screens and blocking dialogs outside the main editor surface.

### Article Navigator Traversal

The article navigator is a tree and takes a single tab stop. Focus enters on the open document, or on the first row when no document is open. When a folder refresh removes the focused row, focus moves to the row that inherits the tab stop.

- `ArrowDown` and `ArrowUp`: Move to the next or previous visible row, stopping at either end.
- `ArrowRight`: Expand the focused directory, or move into it when it is already expanded.
- `ArrowLeft`: Collapse the focused directory, or move to the parent directory when it is already collapsed.
- `Home` and `End`: Move to the first or last visible row.
- Printable characters: Move to the next visible row whose name starts with what was typed, wrapping around. The search clears after a short pause, and one character repeated cycles through the rows that start with it.
- `Enter` and `Space`: Open the focused article, or expand and collapse the focused directory. Clicking a row does the same. `Space` extends a running search instead, since a space can appear in a file name.

Moving focus never opens a document, so the focused row and the open document are routinely different rows. An empty directory is an ordinary row that can be focused and read, with nothing to expand. Collapsing a directory that contains the focused row moves focus to the nearest row that survives.

`Reveal in sidebar` expands the ancestors of the active document, scrolls its row into view, and leaves focus on that row.

## State Model

These state axes compose. A document session, for example, can have a folder context and be saved and clean or dirty.

### App State

- **Welcome:** no document or folder context is open.
- **Folder-only session:** a folder context is open, but no document is active.
- **Document session:** a document is active. A folder context may also be active.

### Folder Context State

- **No folder context:** no local folder is available for article navigation.
- **Folder context available:** a local folder is available for article navigation and folder workflows.
- **Empty folder context:** a folder context is available, but no supported Markdown files were found.

### Document State

- **No active document:** no document is open in the document surface.
- **Saved document:** the active document has a file path.
- **Untitled document:** the active document has no file path yet and requires Save as.
- **Clean:** the document has no user edits since it was opened or saved. Loading and serialization normalization do not make it dirty.
- **Dirty:** the document has unsaved user edits.
- **Line ending:** the line ending used when saving the active document. Opened files start with their detected line ending; untitled documents start with `Default line ending for new documents`. If the opened file contains mixed line endings (both LF and CRLF), the detected line ending is determined by majority vote (whichever occurs more frequently in the file).

### Session Lifecycle

- `Close document` closes only the active document. When a folder context exists, it remains active.
- `Close folder` closes the active folder context and active document after dirty-state handling, returning to the welcome screen.
- `Close window` closes the current app window after dirty-state handling.
- Closing, switching files, or exiting with a dirty document prompts the user.

### Marker Visibility State

- **Editable marker:** raw Markdown syntax is exposed as editable text for the active object.
- **Subtle marker:** a muted marker or affordance is shown near the active object, but the marker itself is not the editing surface.
- **Persistent marker:** a muted marker remains visible even when the caret is not inside the object.
- **Visual object:** the object remains a rendered editor object and exposes focused controls or object affordances instead of raw delimiters.
- **Selection:** making a selection that includes marked text does not reveal syntax markers by itself.

### Context Popup State

- **Closed:** no popup is visible.
- **Open from selection:** commands act on the selected text or blocks.
- **Open from right-click:** commands act on the editor selection established by the right-click.
- **Open from keyboard:** commands act on the caret or selection the request was made from, and the popup holds focus.

## Editor Model

The editor is a unified hybrid Markdown surface. Behavior is governed by rendering rules, contextual marker visibility, command transformations, and serialization.

### Rendering

- Markdown renders as rich text. Marker presentation is selected per Markdown object rather than applied uniformly to all syntax.
- Prose blocks wrap to the editor viewport width; horizontal scrolling is restricted to code blocks or tables.
- Soft wrap is visual only and never modifies saved Markdown.
- Raw HTML is displayed as literal, code-like text and is never rendered as live DOM, preventing script execution and layout disruption.

### Marker Visibility and Presentation

- Content that shows the syntax marker decoration when the caret is inside the block: Headings.
- Content that remains structurally rendered without marker-driven editing controls or raw delimiter exposure: Blockquotes, Lists, Horizontal rules, Code blocks, Tables.
- Content that shows the editable raw markdown syntax: Strong, Emphasis, Strikethrough, Inline code, Links, Images, Footnote references, Autolinks, Raw HTML.
- Content that shows the permanent syntax markers: Footnote definitions.

### Blocks

- Headings render structurally. When the caret is inside a heading, show a subtle heading marker.
- Lists render structurally with visual list markers.
- Blockquotes render structurally.
- Horizontal rules render as separators without exposing the raw marker used to create them.
- List items and blockquotes may contain other block-level elements.
- Ordered lists render with visual continuation.
- Clicking a task-list checkbox toggles it checked or unchecked.
- Tables render as editable table blocks. Basic table editing uses visual table interaction; pipe-delimited Markdown is not exposed in the editor surface.
- Code blocks render as styled monospace blocks with syntax highlighting when available. Focused code blocks edit code content directly. Language metadata controls are deferred.
- Footnote definitions render as editable definition blocks with a persistent subtle definition marker.

### Inline Content

- Strong, emphasis, inline code, and strikethrough render visually and expose editable local markers near the caret.
- Seamless source projection for strong, emphasis, strikethrough, inline code, links, autolinks, and footnote references is local to the active inline object. For mark-based content, a caret or text selection activates projection when it is contained within one exact, contiguous combination of supported inline marks. Editing a projected marker can change that object's inline style, but it does not automatically merge adjacent marked runs; broader reshaping is done with an explicit selection or formatting command.
- Inline-code projection uses a valid canonical backtick delimiter run rather than preserving the exact source delimiter length.
- Link and autolink projection exposes their source directly in the document; links preserve their label, target, optional title, and compatible uniform outer inline formatting. A link remains one semantic projection owner. A caret or contained text selection anywhere in a supported label projects the complete link source, including labels with nested strong, emphasis, strikethrough, inline-code formatting, semantic soft line endings, or an image. An image in a projected label becomes its own Markdown source and returns as an image when the label commits. Soft line endings remain one logical label; indentation follows Leafdown's canonical serialization. Valid edits rehydrate one link over the complete rich label; invalid or incomplete edits become exact literal text. Mixed-format and multiline labels do not fall back to fragmented projections for their nested content.
- A footnote reference within one exact, contiguous supported mark combination belongs to that marked fragment. Entering through its text, either reference boundary, or the atomic reference projects one outer wrapper such as `**archive note[^archive]**`; the complete compatible mark set applies to both text and reference nodes. Logical links retain higher semantic ownership, while standalone or otherwise ineligible references use the reference-only adapter.
- Standalone footnote references project their complete `[^label]` source as editable document text. A caret entering from the left starts at the beginning of the source, a caret entering from the right starts at the end, and selecting an atomic reference selects its label after projection. Valid edits in either projection rehydrate canonical Milkdown footnote-reference nodes. If a marked wrapper remains valid, incomplete reference-like content remains exact text inside its outer marks; if the outer wrapper becomes invalid, the complete projected source becomes exact unmarked literal text. Editing a reference label does not create, rename, delete, or modify any footnote definition.
- A selection crossing plain text, another exact mark combination, another inline object, or a text-block boundary does not activate projection. When a selection crosses into or out of an active source projection, the projection finalizes and preserves the user's selection range and direction.
- `Enter` and `Shift+Enter` internally finalize active projected source before continuing through the editor's normal line-break behavior in the same keypress. When formatted content moves with the caret, its new inline target immediately enters projection. `Escape` leaves projection active while the caret remains on its target.
- Normal click places the caret in a link; `Mod+click` opens it.
- Local relative images render automatically. Clicking an image focuses it. When focused, show the raw image Markdown above the image for editing.

### Keyboard Editing

- Lists support `Enter`, `Tab`, and `Shift+Tab` for continuation and indentation.
- `Shift+Enter` inserts a hard line break where supported.
- Double-clicking text selects the active word without immediately following horizontal whitespace.
- Auto-pair brackets and quotes inserts matching `()`, `[]`, `{}`, `"..."`, and `'...'` pairs, wraps selected text in the active text block, and removes an empty pair when `Backspace` is pressed between the delimiters. Quote auto-pairing does not trigger immediately after word characters.
- Tables support keyboard navigation between cells and basic text editing:
  - `Tab`: Moves focus to the cell to the right. If pressed in the last cell of the last row, inserts a new row below and moves focus to its first cell.
  - `Shift+Tab`: Moves focus to the cell to the left.
  - `Enter`: Moves focus to the cell directly below. If pressed in the bottom row, inserts a new row below and focuses it.
  - `ArrowDown` (in the bottom row of a table): Exits the table downwards and moves the caret to the block below (creating a new empty paragraph block if none exists).
- Making a selection opens the context popup, whether it was made with the pointer, extended with `Shift+Arrow` or `Mod+Shift+Arrow`, or made whole by `Select all`. A pointer selection opens it on release, wherever the release lands, and a keyboard one as the selection changes; extending further keeps the open popup rather than reopening it. A pointer gesture that begins outside the editor leaves the popup as it is, whatever the editor's selection.
- `Escape` dismisses a popup that does not hold focus, leaving the selection standing, and it stays dismissed until the selection collapses.
- `Shift+F10` and the `Menu` key open the context popup around the caret or selection and move focus into it. A popup opened by right-click or by a selection leaves focus in the editor.
- The popup is one command toolbar, and focus enters it on its first available command:
  - `ArrowLeft` and `ArrowRight`: Move between commands in order, wrapping at either end.
  - `ArrowUp` and `ArrowDown`: Move between rows at the nearest available column, wrapping at either end and skipping a row whose commands are all unavailable. On a submenu, `ArrowDown` opens it instead.
  - `Home` and `End`: Move to the first or last available command.
  - `Enter` and `Space`: Run the focused command, or open the focused submenu.
  - `Escape`: Closes the popup, or an open submenu first, returning focus to the command that opened it.
  - `Tab`: Closes the popup as well, rather than moving to another control.
- Closing a popup that holds focus returns focus to the editor with its selection intact, whichever path closed it.
- The popup anchors to the part of its selection that is visible in the document surface and follows that text as the selection changes and as the document scrolls. Scrolling does not close the popup.
- A selection taller than the visible area, or one that fills it, has no room beside it, so the popup sits inside the selection at its first visible line.
- While no part of the selection is visible the popup is hidden rather than closed, and it returns when the selection scrolls back into view.
- A popup opened from the keyboard, or holding focus for any other reason, stays visible and stays where it is.
- Structural editing and native text gestures retain their normal editor behavior. Leafdown commands provide the same semantic operations across menus, keyboard shortcuts, and the context popup.
- The app intercepts and disables default webview reload and navigation shortcuts, including `Mod+R` and `Mod+Shift+R`, to prevent accidental state resets.

For editor input and clipboard ownership, see [Architecture](./architecture.md#editor-architecture).

### Editing Commands

- `Undo` and `Redo` use Milkdown's native editor history through Leafdown's projection-aware commands. Their keyboard shortcuts use projection-local history while projected source is dirty, or finalize clean projection before native history runs.
- `Cut`, `Copy`, and `Copy as` operate on the current selection. Default `Cut` and `Copy` use one Leafdown clipboard resolver whether invoked by native editor events, the Edit menu, or the context popup. Native editor events write synchronously through the event clipboard data; command surfaces use the asynchronous system Clipboard API with equivalent payload semantics.
- For regular editor selections, default `Cut` and `Copy` place Milkdown's serialized Markdown selection in `text/plain` and semantically equivalent editor content in `text/html`.
- Default `Cut` and `Copy` from a selection contained within active source projection place the exact selected projected characters in `text/plain` and semantically equivalent editor content in `text/html`. Selections that have no faithful semantic equivalent, including delimiter-only, destination-only, title-only, partial image, and partial atomic-reference selections, remain literal in both representations. Invalid projected source also remains literal.
- `Copy as Plain text` and `Copy as Markdown` preserve the exact selected projected characters. Copying does not finalize or modify projection; Cut writes the same clipboard representations before applying its deletion as a projection-local edit.
- Cut deletes the selected editor content only after the clipboard payload is written successfully. An asynchronous command Cut does not delete if the document, selection, or projection mode changes while the clipboard write is pending.
- `Paste` and `Paste as` insert at the caret or replace the current selection. Active source projection inserts the plain-text payload literally, and where the payload carries no plain text it inserts the Markdown source of content that is a single run of inline content the projected object can hold, consuming anything else. Paste preserves qualifying editor content, selected whitespace, and structural slice context; other HTML remains unchanged.
- `Delete` removes the current selection when one exists; otherwise it uses the normal editor delete behavior.
- `Delete word backward` deletes the word behind the caret.
- `Delete word forward` deletes the word in front of the caret.
- `Delete block` deletes the active block. (Deferred)
- `Delete sentence` deletes the sentence at or adjacent to the caret. (Deferred)

### Inline Formatting Commands

- With a selection, inline formatting commands apply to the selection.
- If a selection crosses multiple blocks, inline formatting applies within each selected block separately.
- Without a selection, inline formatting commands apply to the nearest word when one is available; otherwise they insert an empty marker pair.
- Toggling the same inline formatting command removes the marker when applicable.
- If the caret is between non-alphanumeric boundaries, insert an empty marker pair and place the caret in the middle.
- If the caret touches or is adjacent to a word boundary, apply the marker to that word.
- `Link` wraps selected text in `[text]()` and places the caret between the parentheses. Without a selection, it inserts `[]()` and places the caret between the brackets.
- `Clear inline formatting` removes supported inline formatting from the selection, or from the active marked inline element when there is no selection.
- Inline-formatting keyboard shortcuts run the same Leafdown commands as menu and context-popup controls. When source projection is active, the command finalizes the projected source before changing formatting and reactivates an eligible resulting projection.

### Block Formatting Commands

- With a selection, block commands apply to the selected blocks.
- Without a selection, block commands apply to the current block.
- Toggling the same block command removes the marker when applicable.
- `Increase heading level` moves `Heading 1` toward `Heading 6`; `Decrease heading level` moves `Heading 6` toward `Heading 1`.
- `Clear block formatting` converts the selected blocks, or the current block, to paragraphs when applicable.
- Insert commands add new content after the current block, or after the last selected block when the selection spans multiple blocks.
- The `Image` insert command inserts `![]()` and places the caret inside the parentheses.
- The `Table` insert command creates a default 2-by-2 table.
- The `Paragraph` insert command creates a new empty paragraph.
- Block-formatting keyboard shortcuts run the same Leafdown commands as menu and context-popup controls, including heading toggles, list conversion and lifting, blockquote toggles, code-block toggles, and multi-block behavior.

### Table Commands

- Table commands target the table containing the caret or selection.
- Row commands use the current row. When multiple rows are selected, they use the selected row range.
- Column commands use the current column. When multiple columns are selected, they use the selected column range.
- `Add row above` and `Add row below` insert one row before the first selected row or after the last selected row.
- GFM tables keep the header row as a protected structural row for table editing. Row commands that would insert above, move, or delete the header row are unavailable. `Add row below` remains available from the header row and inserts the first body row.
- `Add column before` and `Add column after` insert one column before the first selected column or after the last selected column.
- `Move row up`, `Move row down`, `Move column left`, and `Move column right` move the current or selected rows or columns one position when a destination exists.
- `Delete row` and `Delete column` remove the current or selected rows or columns. If deleting them would leave no valid table, remove the table.
- `Delete table` removes the current table.

### Serialization And Output

- Leafdown preserves Markdown semantics over exact source formatting.
- Output uses the default output style.
- Raw HTML is written back exactly as authored, including line-break tags.
- A blank paragraph between blocks survives save and reopen.
- Save output trims trailing blank lines and writes at most one final line ending, controlled by `Insert final newline on save`. Trailing blank paragraphs go with them.

## Commands And Settings

See [Reference](./reference.md) for current and Deferred settings, command surfaces, contextual availability, and checked or radio state.

## File And Folder Workflows

Workflows execute upon successful completion of dirty-state checks. If a dirty check is cancelled, the workflow is aborted.

### Open File

- Opening a file may be initiated from Open, recent files, or article navigator selection.
- Read the selected Markdown file.
- If no folder context is active, set the current folder context to the file's parent folder and scan that folder for supported Markdown files, skipping ignored directories.
- If a folder context is already active, keep it unchanged.
- Open the selected file in the document surface.
- Select the opened file in the article navigator only when it exists in the current article navigator.
- Add the file to recents when `Record recent files and folders` is enabled. Add the file's parent folder to recent folders only when the file open bootstraps a folder context.

### Open Folder

- Set the current folder context to the selected folder.
- Scan the folder for supported Markdown files, skipping ignored directories.
- Open a root-level configured index file when one exists.
- Match index file names case-insensitively in configured order.
- Prefer `.md` before `.markdown` for the same configured index name.
- Otherwise leave no document open.
- Show an empty-folder state only when no supported Markdown files exist.
- Add the folder to recents when `Record recent files and folders` is enabled.

### New Document

- Create an untitled Markdown document.
- If a folder context exists, associate the untitled document with it.
- Show the untitled document in the document surface.
- Do not create a file until `Save as`.

### Save As

- Write the document to the chosen path.
- Update the active document path.
- If no folder context is active, set the current folder context to the saved file's parent folder.
- If the saved file is inside the current folder context, refresh the article navigator for the current folder context.
- If the saved file is outside the current folder context, keep the current folder context unchanged.
- Select the saved file in the article navigator only when it exists in the current article navigator.

### Filesystem Watching

- Leafdown watches the active folder context for filesystem changes.
- When Markdown files are created, renamed, or deleted externally, the article navigator automatically updates to reflect the changes.
- If the active document changes externally, prompt before replacing its editor content. (Deferred)

## Link And Image Handling

Relative link and image paths resolve from the active file path. Relative paths in untitled documents remain unresolved until the document is saved (unresolved images display a placeholder, and relative links trigger a non-disruptive warning on click).

Confirmations, warnings, and security blocks affect editor rendering only; source Markdown remains unmodified on write.

### Links

- Markdown targets open inside Leafdown.
- Local Markdown links that resolve outside the current folder context open inside Leafdown without switching the current folder context.
- Local non-Markdown targets ask for confirmation, then open with the system default behavior, without switching the current folder context.
- External web links open in the system browser.
- Broken link targets show a non-disruptive message.
- A single link activation shows at most one confirmation for the same non-Markdown target.

### Images

- Local relative images render automatically when supported.
- Supported local image formats are `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, and `.webp`.
- Missing local images show a clear placeholder.
- Remote image Markdown is preserved, but network images are currently blocked completely; loading them is deferred.
- Local images that resolve outside the current folder context require explicit confirmation before rendering. Instead of a blocking modal, the editor displays an inline placeholder in place of the image, prompting the user to click to load/render it.
- Selecting a rendered or placeholder image exposes the raw image Markdown for editing the alt text and target path.

For local-path resolution and asset-protocol handling, see [Architecture](./architecture.md#frontend-responsibilities).

## Saving, Limits, And Errors

File operations govern how Leafdown writes to disk and resolves conflicts or errors.

### Saving

- `Mod+S` saves the active document.
- `Mod+Shift+S` opens `Save as`.
- If the active document is untitled, `Mod+S` opens `Save as`.
- Save actions write the active document as ordinary Markdown.
- A save either fully replaces the file contents or leaves the previous contents in place. An interrupted or failed save never leaves a partially written document or a stray file beside it.
- Saving a document that is a symlink writes through to the link target and leaves the link in place.
- `Insert final newline on save` controls whether Leafdown writes a final newline when saving.
- `Line ending` actions affect the active document's save output, not the rendered editor surface.
- If the active saved file no longer exists when saving, Leafdown shows a missing-file error and offers `Save as` or `Cancel`.
- Before saving, compare current file metadata with metadata from open/last save. If the file changed externally, warn before overwriting.
- External-change options are `Overwrite anyway` and `Cancel save`.

### Loading Limits

- Empty files open as empty editable documents.
- Files larger than 5 MB do not load.
- Files that are not valid UTF-8 show an invalid encoding error and do not open.
- Opening files or folders at a partition/drive root (e.g., `C:\` or `/`) restricts folder scanning and watching to a non-recursive depth of 1 level to avoid filesystem performance issues and permission locks.

### Error Handling

- Invalid or unusual Markdown should not crash the editor.
- Unsupported file type, missing file, permission, read, save, invalid encoding, external change, oversized file, broken link, and missing image errors should be clear and user-facing.
