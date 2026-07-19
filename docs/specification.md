# Specification

Leafdown is a local-first Markdown editor for files and folders, designed as a focused document editor rather than a notes vault, IDE, cloud workspace, or split-pane preview tool.

## Product Principles

- Markdown files remain the source of truth.
- Normal files and folders are first-class; Leafdown does not require a vault,
  workspace, import process, database, or app metadata inside opened folders.
- Leafdown is folder-aware without treating the active file's parent as the
  navigation root after every document change. Opening a file creates a folder
  context from its parent only when no folder context is active; otherwise the
  current folder context remains pinned until an explicit folder action changes it.
- The document surface is one hybrid WYSIWYG Markdown editor.
- Leafdown does not use a permanent source/preview split or separate read/edit
  modes.

## Supported Content

Supported files are `.md` and `.markdown` formats.

Markdown compatibility includes CommonMark and GitHub Flavored Markdown (GFM) elements:

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

Unsupported syntax is preserved where possible and treated as text.

## Interface Model

Primary user interface surfaces:

- **App shell:** wraps the custom titlebar, menu bar, article navigator, document
  surface, and modal layer.
- **Welcome screen:** appears when no document or folder context is open. It offers
  open file, open folder, recent files, and recent folders.
- **Menu bar:** provides top-level app commands grouped by File, Edit, Insert,
  Format, View, and Help.
- **Document surface:** contains the active hybrid Markdown editor. In a folder-only session, it displays a centered placeholder illustration/text prompting the user to select a file from the sidebar or create a new file.
- **Article navigator:** shows articles (supported Markdown files) from the current folder
  context in a nested tree. Non-Markdown files and ignored directories are hidden.
  Non-ignored directories may appear even when they have no supported Markdown
  files. Directories are listed before articles within each folder, then the
  selected article sort order is applied within each group. Folder scans skip
  symlinked entries rather than following them.
  When the active saved document is outside the current folder context, the
  article navigator keeps showing the current folder context and displays a
  compact detached-document message instead of selecting an article.
  The sidebar is read-only for folder navigation in the MVP; file creation, renaming,
  and deletion must be managed through the OS file explorer or via document saving workflows.
- **Context popup:** provides quick document actions from selection or
  right-click.
- **Modal layer:** presents secondary screens and blocking dialogs outside the
  main editor surface.

## State Model

Application state model:

### App State

- **Welcome:** no document or folder context is open.
- **Folder-only session:** a folder context is open, but no document is active.
- **Document session:** a document is active. A folder context may also be active.

### Folder Context State

- **No folder context:** no local folder is available for sidebar navigation.
- **Folder context available:** a local folder is available for sidebar navigation
  and folder workflows.
- **Empty folder context:** a folder context is available, but no supported
  Markdown files were found.

### Document State

- **No active document:** no document is open in the document surface.
- **Saved document:** the active document has a file path.
- **Untitled document:** the active document has no file path yet and requires
  Save as.
- **Clean:** editor content matches the last opened or saved disk content. Opening a file does not trigger a dirty state, even if Leafdown's default serialization formatting differs from the original disk file.
- **Dirty:** editor content has unsaved changes. The dirty state is triggered only by actual user transaction events in the editor history.
- **Line ending:** the line ending used when saving the active document. Opened
  files start with their detected line ending; untitled documents start with
  `Default line ending for new documents`. If the opened file contains mixed line endings (both LF and CRLF), the detected line ending is determined by majority vote (whichever occurs more frequently in the file).

### Session Lifecycle

- `Close document` closes only the active document. When a folder context exists,
  it remains active.
- `Close folder` closes the active folder context and active document after
  dirty-state handling, returning to the welcome screen.
- `Close window` closes the current app window after dirty-state handling.
- Closing, switching files, or exiting with a dirty document prompts the user.

### Marker Visibility State

- **Editable marker:** raw Markdown syntax is exposed as editable text for the
  active object.
- **Subtle marker:** a muted marker or affordance is shown near the active object,
  but the marker itself is not the editing surface.
- **Persistent marker:** a muted marker remains visible even when the caret is
  not inside the object.
- **Visual object:** the object remains a rendered editor object and exposes
  focused controls or object affordances instead of raw delimiters.
- **Selection:** making a selection that includes marked text does not reveal
  syntax markers by itself.

### Context Popup State

- **Closed:** no popup is visible.
- **Open from selection:** commands act on the selected text or blocks.
- **Open from right-click:** commands act on the editor selection established by
  the right-click.

## Editor Model

The editor is a unified hybrid Markdown surface. Behavior is governed by rendering rules, contextual marker visibility, command transformations, and serialization.

### Rendering

- Markdown renders as rich text. Marker presentation is selected per Markdown
  object rather than applied uniformly to all syntax.
- Prose blocks wrap to the editor viewport width; horizontal scrolling is restricted to code blocks or tables.
- Soft wrap is visual only and never modifies saved Markdown.
- Raw HTML tags and inline elements are sanitized and escaped, rendering them as code-like text strings rather than parsing them as DOM nodes, preventing cross-site scripting (XSS) and layout disruption.

### Marker Visibility and Presentation

- Content that shows the syntax marker decoration when the caret is inside the
  block: Headings.
- Content that remains structurally rendered without marker-driven MVP controls
  or raw delimiter exposure: Blockquotes, Lists, Horizontal rules, Code blocks,
  Tables.
- Content that shows the editable raw markdown syntax: Strong, Emphasis,
  Strikethrough, Inline code, Links, Images, Footnote references, Autolinks, Raw HTML.
- Content that shows the permanent syntax markers: Footnote definitions.

### Blocks

- Headings render structurally. When the caret is inside a heading, show a
  subtle heading marker.
- Lists render structurally with visual list markers.
- Blockquotes render structurally.
- Horizontal rules render as separators without exposing the raw marker used to
  create them.
- List items and blockquotes may contain other block-level elements.
- Ordered lists render with visual continuation.
- Clicking a task-list checkbox toggles it checked or unchecked.
- Tables render as editable table blocks. Basic table editing uses visual table
  interaction; pipe-delimited Markdown is not exposed in the editor surface.
- Code blocks render as styled monospace blocks with syntax highlighting when
  available. Focused code blocks edit code content directly. Language metadata
  controls are deferred to Post-MVP.
- Footnote definitions render as editable definition blocks with a persistent
  subtle definition marker.

### Inline Content

- Strong, emphasis, inline code, and strikethrough render visually and expose
  editable local markers near the caret.
- Seamless source projection for strong, emphasis, strikethrough, inline code,
  links, autolinks, and footnote references is local to the active inline
  object. For mark-based content, a caret or text selection activates projection
  when it is contained within one exact, contiguous combination of supported
  inline marks. Editing a projected marker can change that object's inline
  style, but it does not automatically merge adjacent marked runs; broader
  reshaping is done with an explicit selection or formatting command.
- Inline-code projection uses a valid canonical backtick delimiter run rather
  than preserving the exact source delimiter length.
- Link and autolink projection exposes their source directly in the document;
  links preserve their label, target, optional title, and compatible uniform
  outer inline formatting. A link remains one semantic projection owner. A
  caret or contained text selection anywhere in a supported label projects the
  complete link source, including labels with nested strong, emphasis,
  strikethrough, inline-code formatting, or semantic soft line endings. Soft
  line endings remain one logical label even though Milkdown represents them as
  inline break nodes; indentation follows Milkdown's canonical serialization.
  Valid edits rehydrate one link over the complete rich label; invalid or
  incomplete edits become exact literal text. Mixed-format and multiline labels
  do not fall back to fragmented projections for their nested content.
- A footnote reference within one exact, contiguous supported mark combination
  belongs to that marked fragment. Entering through its text, either reference
  boundary, or the atomic reference projects one outer wrapper such as
  `**archive note[^archive]**`; the complete compatible mark set applies to both
  text and reference nodes. Logical links retain higher semantic ownership, while
  standalone or otherwise ineligible references use the reference-only adapter.
- Standalone footnote references project their complete `[^label]` source as
  editable document text. A caret entering from the left starts at the beginning
  of the source, a caret entering from the right starts at the end, and selecting
  an atomic reference selects its label after projection. Valid edits in either
  projection rehydrate canonical Milkdown footnote-reference nodes. If a marked
  wrapper remains valid, incomplete reference-like content remains exact text
  inside its outer marks; if the outer wrapper becomes invalid, the complete
  projected source becomes exact unmarked literal text. Editing a reference label
  does not create, rename, delete, or modify any footnote definition.
- A selection crossing plain text, another exact mark combination, another
  inline object, or a text-block boundary does not activate projection. When a
  selection crosses into or out of an active source projection, the projection
  finalizes and preserves the user's selection range and direction.
- `Enter` and `Shift+Enter` internally finalize active projected source before
  continuing through the editor's normal line-break behavior in the same
  keypress. When formatted content moves with the caret, its new inline target
  immediately enters projection. `Escape` leaves projection active while the
  caret remains on its target.
- Normal click places the caret in a link; `Mod+click` opens it.
- Local relative images render automatically. Clicking an image focuses it. When
  focused, show the raw image Markdown above the image for editing.

### Keyboard Editing

- Lists support `Enter`, `Tab`, and `Shift+Tab` for continuation and indentation.
- `Shift+Enter` inserts a hard line break where supported.
- Double-clicking text selects the active word without immediately following
  horizontal whitespace.
- Auto-pair brackets and quotes inserts matching `()`, `[]`, `{}`, `"..."`, and
  `'...'` pairs, wraps selected text in the active text block, and removes an
  empty pair when `Backspace` is pressed between the delimiters. Quote
  auto-pairing does not trigger immediately after word characters.
- Tables support keyboard navigation between cells and basic text editing:
  - `Tab`: Moves focus to the cell to the right. If pressed in the last cell of the last row, inserts a new row below and moves focus to its first cell.
  - `Shift+Tab`: Moves focus to the cell to the left.
  - `Enter`: Moves focus to the cell directly below. If pressed in the bottom row, inserts a new row below and focuses it.
  - `ArrowDown` (in the bottom row of a table): Exits the table downwards and moves the caret to the block below (creating a new empty paragraph block if none exists).
- Milkdown owns structural, context-sensitive editing shortcuts such as text
  insertion, deletion, list and table navigation, and heading downgrade.
  Leafdown owns shortcuts for semantic commands exposed through application
  command surfaces and projection-aware history so their availability and
  behavior match menus and context popups.
- The window-level shortcut listener executes only application commands. Editor
  shortcuts execute through the focused editor keymap, while standard clipboard
  gestures and other native text-input keys remain with the browser and
  ProseMirror. This boundary also applies to focused raw Markdown inputs embedded
  in the editor.
- The app intercepts and disables default webview reload and navigation shortcuts, including `Mod+R` and `Mod+Shift+R`, to prevent accidental state resets.

### Editing Commands

- `Undo` and `Redo` use Milkdown's native editor history through Leafdown's
  projection-aware commands. Their keyboard shortcuts use projection-local
  history while projected source is dirty, or finalize clean projection before
  native history runs.
- `Cut`, `Copy`, and `Copy as` commands use editor clipboard behavior and operate
  on the current selection. Standard keyboard Cut and Copy remain native
  clipboard gestures rather than window-level command dispatches.
- `Paste` and `Paste as` commands use editor clipboard behavior and insert at the
  caret or replace the current selection. Standard keyboard Paste and Paste as
  plain text remain native clipboard gestures so Milkdown can parse the supplied
  plain-text or HTML payload. An active source projection intercepts native Paste
  first and inserts its plain-text payload literally.
- `Delete` removes the current selection when one exists; otherwise it uses the
  normal editor delete behavior.
- `Delete word backward` deletes the word behind the caret.
- `Delete word forward` deletes the word in front of the caret.
- `Delete block` deletes the active block. (Post-MVP)
- `Delete sentence` deletes the sentence at or adjacent to the caret. (Post-MVP)

### Inline Formatting Commands

- With a selection, inline formatting commands apply to the selection.
- If a selection crosses multiple blocks, inline formatting applies within each
  selected block separately.
- Without a selection, inline formatting commands apply to the nearest word when
  one is available; otherwise they insert an empty marker pair.
- Toggling the same inline formatting command removes the marker when applicable.
- If the caret is between non-alphanumeric boundaries, insert an empty marker
  pair and place the caret in the middle.
- If the caret touches or is adjacent to a word boundary, apply the marker to
  that word.
- `Link` wraps selected text in `[text]()` and places the caret between the
  parentheses. Without a selection, it inserts `[]()` and places the caret
  between the brackets.
- `Clear inline formatting` removes supported inline formatting from the
  selection, or from the active marked inline element when there is no selection.
- Inline-formatting keyboard shortcuts run the same Leafdown commands as menu
  and context-popup controls. When source projection is active, the command
  finalizes the projected source before changing formatting and reactivates an
  eligible resulting projection.

### Block Formatting Commands

- With a selection, block commands apply to the selected blocks.
- Without a selection, block commands apply to the current block.
- Toggling the same block command removes the marker when applicable.
- `Increase heading level` moves `Heading 1` toward `Heading 6`;
  `Decrease heading level` moves `Heading 6` toward `Heading 1`.
- `Clear block formatting` converts the selected blocks, or the current block,
  to paragraphs when applicable.
- Insert commands add new content after the current block, or after the last
  selected block when the selection spans multiple blocks.
- The `Image` insert command inserts `![]()` and places the caret inside the
  parentheses.
- The `Table` insert command creates a default 2-by-2 table.
- The `Paragraph` insert command creates a new empty paragraph.
- Block-formatting keyboard shortcuts run the same Leafdown commands as menu and
  context-popup controls, including heading toggles, list conversion and
  lifting, blockquote toggles, code-block toggles, and multi-block behavior.

### Table Commands

- Table commands target the table containing the caret or selection.
- Row commands use the current row. When multiple rows are selected, they use the
  selected row range.
- Column commands use the current column. When multiple columns are selected,
  they use the selected column range.
- `Add row above` and `Add row below` insert one row before the first selected
  row or after the last selected row.
- GFM tables keep the header row as a protected structural row for MVP table
  editing. Row commands that would insert above, move, or delete the header row
  are unavailable. `Add row below` remains available from the header row and
  inserts the first body row.
- `Add column before` and `Add column after` insert one column before the first
  selected column or after the last selected column.
- `Move row up`, `Move row down`, `Move column left`, and `Move column right`
  move the current or selected rows or columns one position when a destination
  exists.
- `Delete row` and `Delete column` remove the current or selected rows or
  columns. If deleting them would leave no valid table, remove the table.
- `Delete table` removes the current table.

### Serialization And Output

- Leafdown preserves Markdown semantics over exact source formatting.
- Output uses the default output style.
- Save output trims trailing blank lines and writes at most one final line
  ending, controlled by `Insert final newline on save`.

## Settings

Global settings persist across application launches unless specified otherwise:

### General

- **Record recent files and folders:** On or Off. Default: On.
  - The setting controls whether session history records opened paths; the recent lists themselves are persisted session history rather than preferences.
  - Recent files and recent folders are separate lists.
  - Recent lists are deduplicated by path, sorted by most recent first, and
    limited to 10 items each.
  - `Clear recent items` clears both recent lists.
- **Sidebar visibility:** Visible or hidden. Default: Visible.
- **Article sort order:** Name, modified date, or type. Default: Name.

### Files

- **Default extension for new documents:** `.md` or `.markdown`. Default: `.md`.
- **Default line ending for new documents:** LF or CRLF. Default: system
  dependent.
  - Windows defaults to CRLF. macOS and Linux default to LF.
- **Insert final newline on save:** On or Off. Default: On.
- **Index file names for automatic folder open:** ordered list of file base names.
  Default: `readme`, `index`.
- **Ignored directories for folder scans:** directory name list. Default: `.git`,
  `.hg`, `.svn`, `node_modules`, `target`, `dist`, `build`, `.cache`.
  - Directory name matching is case-sensitive on Unix-like systems and case-insensitive on Windows, matching exact directory names (matching directories and their contents are recursively skipped).
- **Auto save:** On or Off. Default: Off. (Post-MVP)
- **When dropping a folder:** Open or Insert folder link. Default: Open. (Post-MVP)
- **When dropping a Markdown file:** Open or Insert file link. Default: Open. (Post-MVP)

### Editor

- **Auto pair brackets and quotes:** On or Off. Default: On.
- **Indent size on save:** 2 spaces, 4 spaces, or tab. Default: 2 spaces. (Post-MVP)
- **Display line numbers for code blocks:** On or Off. Default: Off. (Post-MVP)
- **Soft wrap for code blocks:** On or Off. Default: Off.

### Output

- **Unordered list marker:** `-`, `*`, or `+`. Default: `-`. (Post-MVP)
- **Ordered list marker:** `.` or `)`. Default: `.`. (Post-MVP)
- **Ordered list numbering:** Sequential or Repeated. Default: Sequential. (Post-MVP)
- **Strong marker:** `**` or `__`. Default: `**`. (Post-MVP)
- **Emphasis marker:** `*` or `_`. Default: `*`. (Post-MVP)
- **Code block fence:** Triple backticks or Triple tildes. Default: Triple
  backticks. (Post-MVP)
- **Horizontal rule marker:** `---`, `***`, or `___`. Default: `---`. (Post-MVP)

### Appearance

- **Appearance theme:** System, Light, or Dark. Default: System.
- **Render/editor theme:** document typography, font, typography size, code
  highlight theme, and related editor rendering preferences. Default: Leafdown
  default theme. (Post-MVP)

## Command Surfaces

App commands are unified across menus, keyboard shortcuts, and the context popup. Availability and checked states are defined in the Command State section.

### Menu Commands

Shortcuts use `Mod` as the primary platform modifier (`Ctrl` on Windows/Linux, `Command` on macOS).

#### File Menu

- **New** (`Mod+N`)
- **New window** (`Mod+Shift+N`, Post-MVP)
- **Open...** (`Mod+O`)
- **Open folder...** (`Mod+Shift+O`)
- **Open recent**
  - **Open last closed** (Post-MVP)
  - **Recent files**
    - [recent file items]
  - **Recent folders**
    - [recent folder items]
  - **Clear recent items**
- **Save** (`Mod+S`)
- **Save as...** (`Mod+Shift+S`)
- **Open file location**
- **Reveal in sidebar**
- **Export** (Post-MVP)
  - **Export as PDF...** (Post-MVP)
  - **Export as HTML...** (Post-MVP)
- **Print...** (`Mod+P`, Post-MVP)
- **Preferences...** (`Mod+,`)
- **Close document** (`Mod+W`)
- **Close folder**
- **Close window** (`Alt+F4` / `Mod+Q`)

#### Edit Menu

- **Undo** (`Mod+Z`)
- **Redo** (`Mod+Y`, `Mod+Shift+Z`)
- **Cut** (`Mod+X`)
- **Copy** (`Mod+C`)
- **Paste** (`Mod+V`)
- **Copy as**
  - **Plain text**
  - **Markdown**
  - **HTML** (Post-MVP)
  - **Rich text** (Post-MVP)
- **Paste as**
  - **Plain text** (`Mod+Shift+V`)
  - **Markdown**
  - **Rich text / formatted text**
- **Delete**
  - **Delete** (`Delete`)
  - **Delete block** (Post-MVP)
  - **Delete sentence** (Post-MVP)
  - **Delete word backward** (`Mod+Backspace`)
  - **Delete word forward** (`Mod+Delete`)
- **Select**
  - **Select all** (`Mod+A`)
  - **Select block** (Post-MVP)
  - **Select sentence** (Post-MVP)
  - **Select word**
- **Jump**
  - **Jump to top** (`Mod+Home`)
  - **Jump to bottom** (`Mod+End`)
  - **Jump to selection**
  - **Jump to line start** (`Home`)
  - **Jump to line end** (`End`)
- **Move block up** (`Alt+Up`, Post-MVP)
- **Move block down** (`Alt+Down`, Post-MVP)
- **Line ending**
  - **Windows line ending (CRLF)**
  - **Unix line ending (LF)**
  - **Insert final newline on save**
- **Find and replace** (Post-MVP)
  - **Find...** (`Mod+F`, Post-MVP)
  - **Find next** (`F3`, Post-MVP)
  - **Find previous** (`Shift+F3`, Post-MVP)
  - **Replace...** (`Mod+H`, Post-MVP)

#### Insert Menu

- **Paragraph**
- **Heading**
  - **Heading 1**
  - **Heading 2**
  - **Heading 3**
  - **Heading 4**
  - **Heading 5**
  - **Heading 6**
- **Link** (`Mod+K`)
- **Image**
- **Ordered list**
- **Unordered list**
- **Task list**
- **Blockquote**
- **Code block**
- **Table**
- **Horizontal rule**

#### Format Menu

- **Strong** (`Mod+B`)
- **Emphasis** (`Mod+I`)
- **Strikethrough** (`Mod+Alt+X`)
- **Inline code** (`Mod+E`)
- **Clear inline formatting** (`Mod+\`)
- **Paragraph** (`Mod+Alt+0`)
- **Heading**
  - **Heading 1** (`Mod+Alt+1`)
  - **Heading 2** (`Mod+Alt+2`)
  - **Heading 3** (`Mod+Alt+3`)
  - **Heading 4** (`Mod+Alt+4`)
  - **Heading 5** (`Mod+Alt+5`)
  - **Heading 6** (`Mod+Alt+6`)
- **Increase heading level**
- **Decrease heading level**
- **Ordered list** (`Mod+Alt+7`)
- **Unordered list** (`Mod+Alt+8`)
- **Task list**
- **Increase list indent** (`Tab`)
- **Decrease list indent** (`Shift+Tab`)
- **Toggle task checked**
- **Blockquote** (`Mod+Shift+B`)
- **Code block** (`Mod+Alt+C`)
- **Table**
  - **Delete table**
  - **Add row above**
  - **Add row below**
  - **Add column before**
  - **Add column after**
  - **Move row up**
  - **Move row down**
  - **Move column left**
  - **Move column right**
  - **Delete row**
  - **Delete column**
  - **Copy table** (Post-MVP)
- **Clear block formatting**

#### View Menu

- **Toggle sidebar** (`Mod+Shift+E`)
- **Toggle status bar** (Post-MVP)
- **Outline** (Post-MVP)
- **Zoom in** (`Mod+=`)
- **Zoom out** (`Mod+-`)
- **Reset zoom** (`Mod+0`)
- **Always on top** (Post-MVP)
- **Full screen** (`F11`)
- **Appearance**
  - **System**
  - **Light**
  - **Dark**
- **Theme** (Post-MVP)
  - [theme items] (Post-MVP)
- **Sort articles by**
  - **Name**
  - **Modified date**
  - **Type**
- **Collapse all folders**
- **Expand all folders**

#### Help Menu

- **What's new...** (Post-MVP)
- **Keyboard shortcuts** (`Mod+/`, Post-MVP)
- **Markdown reference** (Post-MVP)
- **Getting started** (Post-MVP)
- **File and folder workflows** (Post-MVP)
- **Settings reference** (Post-MVP)
- **Report issue** (Post-MVP)
- **Request feature** (Post-MVP)
- **Changelog** (Post-MVP)
- **Check for updates** (Post-MVP)
- **Support / Donate** (Post-MVP)
- **Open DevTools**
- **Diagnostics...**
- **About**

`Diagnostics...` opens a dialog that shows app version, platform, log location,
retention settings, and local-only privacy notes. The copied diagnostics summary
includes app, platform, and current diagnostic run metadata only; log paths,
retention settings, and privacy text remain visible in the dialog rather than
copied. The dialog also provides an action to open Leafdown's app-owned local
diagnostic log directory. Local logs may include user content when captured error
messages or stack traces include it.

Diagnostic log files are JSON Lines. Each log line is a single JSON object with
UTC timestamp, diagnostic run ID, target, and level fields owned by the backend
log formatter. Structured frontend diagnostics add event-specific fields such as
`event`, `feature`, `operation`, `errorKind`, `warningKind`, `phase`,
`durationMs`, and local paths relevant to the failed or slow workflow.
Application code must not explicitly add active Markdown document text to
diagnostic payloads. Payload normalization may truncate long strings and omit
unsupported diagnostic values; it is not redaction.

### Context Popup

The context popup is a contextual menu triggered by selection or right-click within the editor.

- Right-click inside an existing selection keeps the selection.
- Right-click outside a selection uses the editor's normal pointer handling to
  place the caret at the clicked location; the popup does not perform a second
  coordinate-based caret move.
- `Escape`, typing, clicking outside, or scrolling the popup out of view closes
  it.

#### Popup Command Groups

1. Quick actions: Cut, Copy, Paste, Delete.
2. Inline formatting: Strong, Emphasis, Inline code, Link.
3. Block formatting: Blockquote, Ordered list, Unordered list, Task list.
4. Block type: Paragraph, Heading 1, Heading 2, Heading 3, Heading 4, Heading 5,
   Heading 6.
5. Insert: Paragraph, Heading 1, Heading 2, Heading 3, Heading 4, Heading 5,
   Heading 6, Blockquote, Ordered list, Unordered list, Task list, Code block,
   Table, Horizontal rule.

## Command State

Command availability rules govern menus, keyboard shortcuts, and the context popup. Commands are active by default unless disabled by context or build constraints.

### Contextual Availability

Inactive commands are disabled rather than hidden.

#### Document State

- `Save as`, `Close document`, and all `Edit`, `Insert`, and `Format` commands
  are disabled when no document is open.
  - Exception: `Insert final newline on save` remains enabled because it controls
    a global save setting rather than active editor content.
- `Export`, `Print`, and `Outline` are disabled when no document is open.
- `Save` is disabled when no document is open, or when the document is clean and
  already saved.

#### Selection And Editor State

- `Cut`, `Copy`, and `Copy as` require a selection.
- `Undo` and `Redo` require available editor history.
- `Jump to selection` requires a selection.
- `Delete block` requires an active block.
- `Delete word backward`, `Delete word forward`, and `Select word` require a word at or adjacent to the caret.
- `Delete sentence` and `Select sentence` require a sentence at or adjacent to
  the caret.
- `Increase list indent` and `Decrease list indent` require a list item and a
  valid indentation change.
- `Toggle task checked` requires a task list item.
- `Clear inline formatting` requires supported inline formatting in the
  selection or an active marked inline element.
- `Clear block formatting` requires removable block formatting in the current or
  selected blocks.
- `Increase heading level` and `Decrease heading level` require a heading that
  can move in the requested direction.

#### Table State

- Table commands require the caret or selection inside a table.

#### File And Folder State

- `Open file location` requires an active saved document path. If the native
  file reveal fails because the path is missing or inaccessible, Leafdown shows
  an error.
- `Reveal in sidebar` requires a folder context and an active saved article in the
  article navigator.
- `Close folder` requires a folder context.
- `Open last closed` requires a last-closed item.
- `Clear recent items` requires at least one recent file or folder.
- `Sort articles by`, `Collapse all folders`, and `Expand all folders` require
  a folder context and an available article navigator.

#### Search And Updates

- `Find next`, `Find previous`, and `Replace` require an active search query.
- `Check for updates` requires an available update mechanism in the current
  build.

### Checked And Radio State

Use checkmarks for boolean command state and radio groups for mutually exclusive
choices.

#### Boolean State

- `Insert final newline on save` reflects the global save setting.
  It remains available without an active document.
- `Toggle sidebar` reflects global sidebar visibility.
- `Toggle status bar` reflects global status bar visibility.
- `Always on top` reflects current window state.
- `Full screen` reflects current window state.

#### Radio State

- `Line ending` is a radio group for the active document with CRLF and LF
  choices.
- `Appearance` is a radio group for the global appearance theme: `System`,
  `Light`, or `Dark`.
- `Theme` is a radio group for the global render/editor theme when implemented.
- `Sort articles by` is a radio group for the global article sort order.

#### Formatting State

- Formatting commands do not expose live checked state until that behavior is
  intentionally designed.

## File And Folder Workflows

Workflows execute upon successful completion of dirty-state checks. If a dirty check is cancelled, the workflow is aborted.

### Open File

- Opening a file may be initiated from Open, recent files, or sidebar selection.
- Read the selected Markdown file.
- If no folder context is active, set the current folder context to the file's
  parent folder and scan that folder for supported Markdown files, skipping
  ignored directories.
- If a folder context is already active, keep it unchanged.
- Open the selected file in the document surface.
- Select the opened file in the sidebar only when it exists in the current
  article navigator.
- Add the file to recents when `Record recent files and folders` is enabled.
  Add the file's parent folder to recent folders only when the file open
  bootstraps a folder context.

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
- If no folder context is active, set the current folder context to the saved
  file's parent folder.
- If the saved file is inside the current folder context, refresh the article
  navigator for the current folder context.
- If the saved file is outside the current folder context, keep the current
  folder context unchanged.
- Select the saved file in the sidebar only when it exists in the current
  article navigator.

### Filesystem Watching

- The app establishes a native filesystem watcher on the active folder context.
- When Markdown files are created, renamed, or deleted externally, the article navigator automatically updates to reflect the changes. Filesystem watching events are debounced and throttled before updating the app state to prevent performance degradation during rapid batch operations.

## Link And Image Handling

Relative link and image paths resolve from the active file path. Relative paths in untitled documents remain unresolved until the document is saved (unresolved images display a placeholder, and relative links trigger a non-disruptive warning on click).

Confirmations, warnings, and security blocks affect editor rendering only; source Markdown remains unmodified on write.

### Links

- Markdown targets open inside Leafdown.
- Local Markdown links that resolve outside the current folder context open
  inside Leafdown without switching the current folder context.
- Local non-Markdown targets ask for confirmation, then open with the system
  default behavior, without switching the current folder context.
- External web links open in the system browser.
- Broken link targets show a non-disruptive message.
- A single link activation shows at most one confirmation for the same
  non-Markdown target.

### Images

- Local relative images render automatically when supported.
  - Local image paths must be resolved to absolute paths on the backend, then converted to Tauri's custom asset protocol URLs (e.g. standard Tauri v2 asset scheme) on the frontend for rendering. The path component of the asset URL must be properly URL-encoded to handle spaces and special characters.
  - Windows backslashes `\` in absolute paths must be normalized to forward slashes `/` for webview rendering compatibility.
- Supported local image formats are `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, and
  `.webp`.
- Missing local images show a clear placeholder.
- Remote image Markdown is preserved, but network images are blocked completely in the MVP (loading them is deferred to Post-MVP).
- Local images that resolve outside the current folder context require
  explicit confirmation before rendering. Instead of a blocking modal, the editor displays an inline placeholder in place of the image, prompting the user to click to load/render it.
- Selecting a rendered or placeholder image exposes the raw image Markdown for
  editing the alt text and target path.

## Saving, Limits, And Errors

File operations govern how Leafdown writes to disk and resolves conflicts or errors.

### Saving

- `Mod+S` saves the active document.
- `Mod+Shift+S` opens `Save as`.
- If the active document is untitled, `Mod+S` opens `Save as`.
- Save actions write the active document as ordinary Markdown.
- `Insert final newline on save` controls whether Leafdown writes a final newline
  when saving.
- `Line ending` actions affect the active document's save output, not the
  rendered editor surface.
- If the active saved file no longer exists when saving, Leafdown shows a
  missing-file error and offers `Save as` or `Cancel`.
- Before saving, compare current file metadata with metadata from open/last save.
  If the file changed externally, warn before overwriting.
- External-change options are `Overwrite anyway` and `Cancel save`.

### Loading Limits

- Empty files open as empty editable documents.
- Files larger than 5 MB do not load.
- Files that are not valid UTF-8 show an invalid encoding error and do not open.
- Opening files or folders at a partition/drive root (e.g., `C:\` or `/`) restricts folder scanning and watching to a non-recursive depth of 1 level to avoid filesystem performance issues and permission locks.

### Error Handling

- Invalid or unusual Markdown should not crash the editor.
- Unsupported file type, missing file, permission, read, save, invalid encoding,
  external change, oversized file, broken link, and missing image errors should
  be clear and user-facing.
