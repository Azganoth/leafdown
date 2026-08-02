# Reference

This reference defines Leafdown's settings, command surfaces, and command state. For command transformations and editor interaction behavior, see the [Specification](./specification.md#editor-model).

Items marked `Deferred` are approved future behavior. They are not implemented, but should inform future command, menu, and settings design.

## Settings

Global settings persist across application launches unless specified otherwise.

### General

- **Record recent files and folders:** On or Off. Default: On.
  - The setting controls whether session history records opened paths; the recent lists themselves are persisted session history rather than preferences.
  - Recent files and recent folders are separate lists.
  - Recent lists are deduplicated by path, sorted by most recent first, and limited to 10 items each.
  - `Clear recent items` clears both recent lists.
- **Sidebar visibility:** Visible or hidden. Default: Visible.
- **Article sort order:** Name, modified date, or type. Default: Name.

### Files

- **Default extension for new documents:** `.md` or `.markdown`. Default: `.md`.
- **Default line ending for new documents:** LF or CRLF. Default: system dependent.
  - Windows defaults to CRLF. macOS and Linux default to LF.
- **Insert final newline on save:** On or Off. Default: On.
- **Index file names for automatic folder open:** ordered list of file base names. Default: `readme`, `index`.
- **Ignored directories for folder scans:** directory name list. Default: `.git`, `.hg`, `.svn`, `node_modules`, `target`, `dist`, `build`, `.cache`.
  - Directory name matching is case-sensitive on Unix-like systems and case-insensitive on Windows. Matching directories and their contents are recursively skipped.
- **Auto save:** On or Off. Default: Off. (Deferred)
- **When dropping a folder:** Open or Insert folder link. Default: Open. (Deferred)
- **When dropping a Markdown file:** Open or Insert file link. Default: Open. (Deferred)

### Editor

- **Auto pair brackets and quotes:** On or Off. Default: On.
- **Indent size on save:** 2 spaces, 4 spaces, or tab. Default: 2 spaces. (Deferred)
- **Display line numbers for code blocks:** On or Off. Default: Off. (Deferred)
- **Soft wrap for code blocks:** On or Off. Default: Off.

### Output

- **Unordered list marker:** `-`, `*`, or `+`. Default: `-`. (Deferred)
- **Ordered list marker:** `.` or `)`. Default: `.`. (Deferred)
- **Ordered list numbering:** Sequential or Repeated. Default: Sequential. (Deferred)
- **Strong marker:** `**` or `__`. Default: `**`. (Deferred)
- **Emphasis marker:** `*` or `_`. Default: `*`. (Deferred)
- **Code block fence:** Triple backticks or Triple tildes. Default: Triple backticks. (Deferred)
- **Horizontal rule marker:** `---`, `***`, or `___`. Default: `---`. (Deferred)

### Appearance

- **Appearance theme:** System, Light, or Dark. Default: System.
- **Render/editor theme:** document typography, font, typography size, code highlight theme, and related editor rendering preferences. Default: Leafdown default theme. (Deferred)

## Command Surfaces

App commands are unified across menus, keyboard shortcuts, and the context popup. Availability and checked states are defined in [Command State](#command-state).

### Menu Commands

Shortcuts use `Mod` as the primary platform modifier (`Ctrl` on Windows/Linux, `Command` on macOS).

#### File Menu

- **New** (`Mod+N`)
- **New window** (`Mod+Shift+N`, Deferred)
- **Open...** (`Mod+O`)
- **Open folder...** (`Mod+Shift+O`)
- **Open recent**
  - **Open last closed** (Deferred)
  - **Recent files**
  - **Recent folders**
  - **Clear recent items**
- **Save** (`Mod+S`)
- **Save as...** (`Mod+Shift+S`)
- **Open file location**
- **Reveal in sidebar**
- **Export** (Deferred)
  - **Export as PDF...** (Deferred)
  - **Export as HTML...** (Deferred)
- **Print...** (`Mod+P`, Deferred)
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
  - **HTML** (Deferred)
  - **Rich text** (Deferred)
- **Paste as**
  - **Plain text** (`Mod+Shift+V`)
  - **Markdown**
  - **Rich text / formatted text**
- **Delete**
  - **Delete** (`Delete`)
  - **Delete block** (Deferred)
  - **Delete sentence** (Deferred)
  - **Delete word backward** (`Mod+Backspace`)
  - **Delete word forward** (`Mod+Delete`)
- **Select**
  - **Select all** (`Mod+A`)
  - **Select block** (Deferred)
  - **Select sentence** (Deferred)
  - **Select word**
- **Jump**
  - **Jump to top** (`Mod+Home`)
  - **Jump to bottom** (`Mod+End`)
  - **Jump to selection**
  - **Jump to line start** (`Home`)
  - **Jump to line end** (`End`)
- **Move block up** (`Alt+Up`, Deferred)
- **Move block down** (`Alt+Down`, Deferred)
- **Line ending**
  - **Windows line ending (CRLF)**
  - **Unix line ending (LF)**
  - **Insert final newline on save**
- **Find and replace** (Deferred)
  - **Find...** (`Mod+F`, Deferred)
  - **Find next** (`F3`, Deferred)
  - **Find previous** (`Shift+F3`, Deferred)
  - **Replace...** (`Mod+H`, Deferred)

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
- **Clear inline formatting** (`Mod+\\`)
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
- **Task list** (`Mod+Alt+9`)
- **Increase list indent** (`Tab`)
- **Decrease list indent** (`Shift+Tab`)
- **Toggle task checked** (`Mod+Enter`)
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
  - **Copy table** (Deferred)
- **Clear block formatting**

#### View Menu

- **Toggle sidebar** (`Mod+Shift+E`)
- **Toggle status bar** (Deferred)
- **Outline** (Deferred)
- **Zoom in** (`Mod+=`)
- **Zoom out** (`Mod+-`)
- **Reset zoom** (`Mod+0`)
- **Always on top** (Deferred)
- **Full screen** (`F11`)
- **Appearance**
  - **System**
  - **Light**
  - **Dark**
- **Theme** (Deferred)
- **Sort articles by**
  - **Name**
  - **Modified date**
  - **Type**
- **Collapse all folders**
- **Expand all folders**

#### Help Menu

- **What's new...** (Deferred)
- **Keyboard shortcuts** (`Mod+/`, Deferred)
- **Markdown reference** (Deferred)
- **Getting started** (Deferred)
- **File and folder workflows** (Deferred)
- **Settings reference** (Deferred)
- **Report issue** (Deferred)
- **Request feature** (Deferred)
- **Changelog** (Deferred)
- **Check for updates** (Deferred)
- **Support / Donate** (Deferred)
- **Open DevTools**
- **Diagnostics...**
- **About**

`Diagnostics...` opens a dialog that shows app version, platform, log location, retention settings, and local-only privacy notes. Its copied summary includes app, platform, and current diagnostic-run metadata only. The dialog can open Leafdown's app-owned local diagnostic log directory. Local logs may include user content when captured error messages or stack traces include it.

For diagnostic log format and ownership, see [Architecture](./architecture.md#backend-responsibilities).

### Context Popup

The context popup is a contextual menu triggered by selection, right-click, or `Shift+F10` and the `Menu` key within the editor.

- Right-click inside an existing selection keeps the selection.
- Right-click outside a selection uses the editor's normal pointer handling to place the caret at the clicked location; the popup does not perform a second coordinate-based caret move.
- `Escape`, typing, or clicking outside closes it, as does `Tab` while focus is inside it. Scrolling does not close it.

#### Popup Command Groups

1. Quick actions: Cut, Copy, Paste, Delete.
2. Inline formatting: Strong, Emphasis, Inline code, Link.
3. Block formatting: Blockquote, Ordered list, Unordered list, Task list.
4. Block type: Paragraph, Heading 1, Heading 2, Heading 3, Heading 4, Heading 5, Heading 6.
5. Insert: Paragraph, Heading 1, Heading 2, Heading 3, Heading 4, Heading 5, Heading 6, Blockquote, Ordered list, Unordered list, Task list, Code block, Table, Horizontal rule.

## Command State

Availability rules apply to implemented commands across menus, keyboard shortcuts, and the context popup. Implemented commands are active by default unless disabled by context or build constraints; inactive commands are disabled rather than hidden.

A submenu trigger carries the same state as the commands behind it: it is disabled when every one of them is disabled, and enabled while at least one remains available. A submenu that would open with nothing to act on does not open.

### Contextual Availability

#### Document State

- `Save as`, `Close document`, and all `Edit`, `Insert`, and `Format` commands are disabled when no document is open.
  - Exception: `Insert final newline on save` remains enabled because it controls a global save setting rather than active editor content.
- `Export`, `Print`, and `Outline` are disabled when no document is open.
- `Save` is disabled when no document is open, or when the document is clean and already saved.

#### Selection And Editor State

- `Cut`, `Copy`, and `Copy as` require a selection.
- `Undo` and `Redo` require available editor history.
- `Jump to selection` requires a selection.
- `Delete block` requires an active block.
- `Delete word backward`, `Delete word forward`, and `Select word` require a word at or adjacent to the caret.
- `Delete sentence` and `Select sentence` require a sentence at or adjacent to the caret.
- `Increase list indent` and `Decrease list indent` require a list item and a valid indentation change.
- `Toggle task checked` requires a task list item.
- `Clear inline formatting` requires supported inline formatting in the selection or an active marked inline element.
- `Clear block formatting` requires removable block formatting in the current or selected blocks.
- `Increase heading level` and `Decrease heading level` require a heading that can move in the requested direction.

#### Table State

- Table commands require the caret or selection inside a table.

#### File And Folder State

- `Open file location` requires an active saved document path. If the native file reveal fails because the path is missing or inaccessible, Leafdown shows an error.
- `Reveal in sidebar` requires a folder context and an active saved article in the article navigator.
- `Close folder` requires a folder context.
- `Open last closed` requires a last-closed item.
- `Clear recent items` requires at least one recent file or folder.
- `Sort articles by`, `Collapse all folders`, and `Expand all folders` require a folder context and an available article navigator.

#### Search And Updates

- `Find next`, `Find previous`, and `Replace` require an active search query.
- `Check for updates` requires an available update mechanism in the current build.

### Checked And Radio State

Use checkmarks for boolean command state and radio groups for mutually exclusive choices.

#### Boolean State

- `Insert final newline on save` reflects the global save setting. It remains available without an active document.
- `Toggle sidebar` reflects global sidebar visibility.
- `Toggle status bar` reflects global status bar visibility.
- `Always on top` reflects current window state.
- `Full screen` reflects current window state.

#### Radio State

- `Line ending` is a radio group for the active document with CRLF and LF choices.
- `Appearance` is a radio group for the global appearance theme: `System`, `Light`, or `Dark`.
- `Theme` is a radio group for the global render/editor theme when implemented.
- `Sort articles by` is a radio group for the global article sort order.

#### Formatting State

- Formatting commands do not expose live checked state until that behavior is intentionally designed.
