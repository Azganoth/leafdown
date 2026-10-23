# Reference

This reference defines Leafdown's settings, command surfaces, and command state. For command transformations and editor interaction behavior, see the [Specification](./specification.md#editor-model).

Items marked `Deferred` are approved future behavior. They are not implemented, but should inform future command, menu, and settings design.

## Settings

Global settings persist across application launches unless specified otherwise.

### General

- **Language:** System or one of the languages Leafdown ships, each listed by its own name. Default: System.
  - See [Language](./specification.md#language).
- **Record recent files and folders:** On or Off. Default: On.
  - The setting controls whether session history records opened paths; the recent lists themselves are persisted session history rather than preferences.
  - Recent files and recent folders are separate lists.
  - Recent lists are deduplicated by path, sorted by most recent first, and limited to 10 items each.
  - Each recent item records when it was last opened, and the welcome screen shows that time beside it. Reopening an item updates its time. Items recorded before times were kept show no time.
  - A single recent file or folder can be removed from its list on the welcome screen; every other entry in both lists stays where it was.
  - `Clear recent items` clears both recent lists.
- **Sidebar visibility:** Visible or hidden. Default: Visible.
  - The setting applies while a folder context is open. Without one the article navigator is not shown, and the setting is preserved rather than changed.
- **Outline levels:** H1 only through H1–H6. Default: H1–H3.
  - Set from the H1 to H6 control in the document outline's header. See the document outline in the [Interface Model](./specification.md#interface-model).
- **Status bar visibility:** Visible or hidden. Default: Visible.
  - The setting applies while a document is open. Without one the status bar is not shown, and the setting is preserved rather than changed.
- **Article sort order:** Name, modified date, or type. Default: Name.
- **Show all files:** On or Off. Default: Off.
  - Off lists articles, the directories holding them, and directories holding no file. On also lists the files Leafdown cannot open, muted, and the directories holding only them. See the article navigator in the [Interface Model](./specification.md#interface-model).
  - Also set from View > Show all files.
- **Always on top:** On or Off. Default: Off.
  - Set from View > Always on top. See [Always On Top](./specification.md#always-on-top).

### Files

- **Default extension for new documents:** `.md` or `.markdown`. Default: `.md`.
  - Leafdown also opens and saves `.mdown` and `.mkd` files; see [Supported Content](./specification.md#supported-content).
- **Default line ending for new documents:** LF or CRLF. Default: system dependent.
  - Windows defaults to CRLF. macOS and Linux default to LF.
- **Insert final newline on save:** On or Off. Default: On.
  - Decides the line ending after the document's last line of content. Blank lines a document ends with are saved under either choice; see [Serialization And Output](./specification.md#serialization-and-output).
- **Index file names for automatic folder open:** ordered list of file base names. Default: `readme`, `index`.
- **Ignored directories for folder scans:** directory name list. Default: `.git`, `.hg`, `.svn`, `node_modules`, `target`, `dist`, `build`, `.cache`.
  - Directory name matching is case-sensitive on Unix-like systems and case-insensitive on Windows. Matching directories and their contents are recursively skipped.
- **Restore session:** On or Off. Default: On.
  - Automatically reopens windows left at quit or crash, including their assigned named contexts. Turning it off clears automatic restart state and unnamed sessions; named folders and their unsaved drafts remain available. See [Kept Session](./specification.md#kept-session).
- **When dropping a folder:** Open or Insert folder link. Default: Open.
- **When dropping a Markdown file:** Open or Insert file link. Default: Open.

### Editor

- **Auto pair brackets and quotes:** On or Off. Default: On.
- **Display line numbers for code blocks:** On or Off. Default: Off.
  - Every code block numbers its lines from 1 in a gutter beside the code. An empty line has its own number, and an empty block shows 1.
  - A soft-wrapped line keeps one number, on its first row. The gutter stays in place while long lines scroll horizontally.
  - The numbers are presentation only. They cannot be selected, and they are left out of copied text, saved Markdown, word and character counts, and what assistive technology reads. Changing the setting updates open documents without modifying them.
- **Soft wrap for code blocks:** On or Off. Default: Off.
- Both code block settings can also be toggled from the controls on any code block, which change the setting itself. [Blocks](./specification.md#blocks) describes the controls.

### Appearance

- **Accent color:** Neutral, Red, Orange, Amber, Emerald, Cyan, Blue, Violet, or Fuchsia. Default: Neutral.
- **Appearance theme:** System, Light, or Dark. Default: System.
- **File icons:** Neutral or Colored. Default: Neutral.
  - Sets the article navigator's file and folder icons. Colored draws folders in amber and gives articles and each other file type a color of their own, independent of the accent color. See [Interface Model](./specification.md#interface-model).
- **Document font:** Inter, IBM Plex Sans, Atkinson Hyperlegible Next, Literata, or System. Default: Inter.
  - Every font but System ships with Leafdown, so it looks the same on every platform. System uses the platform's ordinary sans-serif text font. Code and Markdown source keep their monospace font.
  - Each option in the list is shown in its own font.
- **Text size:** 14 px, 16 px, 18 px, or 20 px. Default: 16 px.
  - Sets the base size of document text. Headings, code, tables, footnotes, and other document text keep their size relative to it.
- **Line spacing:** Compact (1.5), Default (1.75), or Relaxed (2). Default: Default.
  - Applies to paragraphs, lists, and blockquotes. Headings and code blocks keep their own line height.
- Document font, text size, and line spacing apply to document content only. A preview beneath them shows a short sample set with the current choices. See [Document Typography](./specification.md#document-typography).
- **Render/editor theme:** code highlight theme and related editor rendering preferences beyond document typography. Default: Leafdown default theme. (Deferred)

## Command Surfaces

Menus, keyboard shortcuts, the context popup, and the command palette share command IDs and state. Execution follows the interaction ownership in [Architecture](./architecture.md#editor-architecture). Availability and checked states are defined in [Command State](#command-state).

### Menu Commands

Shortcuts use `Mod` as the primary platform modifier (`Ctrl` on Windows/Linux, `Command` on macOS).

#### File Menu

- **New** (`Mod+N`)
- **New window** (`Mod+Shift+N`)
- **Open...** (`Mod+O`)
- **Open folder...** (`Mod+Shift+O`)
- **Named folders…**: select, keep, rename, park, locate, or remove a named folder, or open it in a new window. Also available above the navigator and on welcome; individual named folders appear in the command palette. No default shortcut.
- **Open recent**
  - **Open last closed** (Deferred)
  - **Recent files**
  - **Recent folders**
  - **Clear recent items**
- **Save** (`Mod+S`)
- **Save as...** (`Mod+Shift+S`)
- **Open file location**
- **Reveal in sidebar**
- **Export**
  - **Export as PDF...** (Deferred)
  - **Export as HTML...**
- **Print...** (`Mod+P`, Deferred)
- **Preferences...** (`Mod+,`)
- **Close document** (`Mod+W`)
- **Close folder**
- **Close window** (`Alt+F4`)
- **Quit** (`Mod+Q`)

#### Edit Menu

- **Undo** (`Mod+Z`)
- **Redo** (`Mod+Y`, `Mod+Shift+Z`)
- **Cut** (`Mod+X`)
- **Copy** (`Mod+C`)
- **Paste** (`Mod+V`)
- **Copy as**
  - **Plain text**
  - **Markdown**
  - **HTML**
  - **Rich text**
- **Paste as**
  - **Plain text** (`Mod+Shift+V`)
  - **Markdown**
  - **Rich text / formatted text**
- **Delete**
  - **Delete** (`Delete`): Removes a structural block selection as one range. `Backspace` does the same while that selection is active.
  - **Delete block** (Deferred)
  - **Delete sentence**
  - **Delete word backward** (`Mod+Backspace`)
  - **Delete word forward** (`Mod+Delete`)
- **Select**
  - **Select all** (`Mod+A`): Selects the whole document immediately from the Edit menu. In a focused ordinary editor, `Mod+A` progressively selects the nearest block, its siblings, containing scopes, and then the document.
  - **Select block** (Deferred)
  - **Select sentence**
  - **Select word**
- **Jump**
  - **Jump to top** (`Mod+Home`)
  - **Jump to bottom** (`Mod+End`)
  - **Jump to selection**
  - **Jump to line start** (`Home`)
  - **Jump to line end** (`End`)
  - **Jump to footnote definition**
- **Link**
  - **Copy destination**: Copies the destination of the link in context.
  - **Remove link**: Leaves the link in context as its label's text.
  - **Choose file...**: Picks a local file and points the inline link in context at it.
- **Rename footnote**: Selects the complete label of the footnote definition in context for replacement, moving to the definition first when invoked from a reference.
- **Replace image...**: Picks a local image file and points the standalone image in context at it.
- **Move block up** (`Alt+Up`): Moves a selected sibling range within its parent.
- **Move block down** (`Alt+Down`): Moves a selected sibling range within its parent.
- **Preview footnote or linked document** (`Mod+Alt+P` in the focused editor): Previews the footnote definition or the linked Markdown document the caret is reading, without moving focus. See [Links](./specification.md#links).
- **Insert block at current boundary** (`Mod+Alt+I` in the focused editor): Opens the local insertion menu after the current eligible block. Its items depend on the parent schema; inside a list, it offers a sibling list item.
- **Line ending**
  - **Windows line ending (CRLF)**
  - **Unix line ending (LF)**
  - **Insert final newline on save**
- **Encoding**
  - **Save with encoding**
    - **The encoding the file was read in**: Named after that encoding, such as `Windows-1252`, and shown only when it is neither form of UTF-8.
    - **UTF-8**
    - **UTF-8 with BOM**
  - **Reopen with encoding**: A submenu of the encodings a file can be reopened in, starting with UTF-8, and marking the one it was read in. Available for a saved document whose file has no byte order mark.
- **Find and replace**
  - **Find...** (`Mod+F`): Opens the search surface with its query field focused.
  - **Find next** (`F3`)
  - **Find previous** (`Shift+F3`)
  - **Replace...** (`Mod+H`): Opens the search surface with its replace row showing.
  - **Find in folder...** (`Mod+Shift+F`): Opens the folder search view in the sidebar with its query field focused.
  - **Replace in folder...** (`Mod+Shift+H`): Opens the folder search view with its replace field showing.

The search surface's own keys are `Enter` and `Shift+Enter` in the query field for the next and previous match, `Enter` in the replacement field for `Replace`, `Mod+Alt+Enter` there for `Replace all`, and `Escape` to close it. [Find And Replace](./specification.md#find-and-replace) describes the behavior.

In the folder search view, `Enter` in the query field searches at once and `ArrowDown` moves into the results. The results take one tab stop: `ArrowUp`, `ArrowDown`, `Home`, and `End` move between rows, `ArrowRight` and `ArrowLeft` expand and collapse a file or move between a match and its file, `Enter` or `Space` toggles a file or opens a match, and `Escape` closes the view. With the replace field showing, `Enter` in the replacement field plans again at once and `Mod+Alt+Enter` there runs `Replace all`. [Find In Folder](./specification.md#find-in-folder) and [Replace In Folder](./specification.md#replace-in-folder) describe the behavior.

#### Insert Menu

- **Paragraph**
- **Heading**
  - **Heading 1**
  - **Heading 2**
  - **Heading 3**
  - **Heading 4**
  - **Heading 5**
  - **Heading 6**
- **Frontmatter**
  - **YAML**
  - **TOML**
  - **JSON**
- **Link** (`Mod+K`)
- **Footnote**: Inserts a reference with a new generated label at the caret or after the selected text, appends its empty definition to the document, and moves the caret into the definition.
- **Image**
- **Ordered list**
- **Unordered list**
- **Task list**
- **Blockquote**
- **Callout**: Lists the types of the dialect the document's callouts share, or GitHub alert types when there are none or more than one dialect. After a separator, submenus labeled **GitHub alert**, **MkDocs**, **Docusaurus**, and **VitePress** offer the other dialects' types; the dialect listed first has no submenu of its own. Choosing a type inserts an empty callout in that dialect after the document block holding the selection, with no title, `!!!` for MkDocs, and a three-colon fence for Docusaurus and VitePress.
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
- **Code block language...**: Opens the language picker for the fenced code block in context, as clicking its language badge does.
- **Callout**
  - **The callout's types**: Lists the types of the callout in context's dialect and marks the one it has. Choosing one changes the callout to it.
  - **Callout opens expanded**: Switches the MkDocs admonition in context between `???` and `???+`.
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
  - **Column alignment**: Lists Default, Left, Center, and Right and marks the alignment every column in context shares. Choosing one aligns those whole columns; Default removes the alignment marker.
  - **Copy table** (Deferred)
- **Clear block formatting**

#### View Menu

- **Command palette...** (`Mod+Shift+P`)
- **Toggle sidebar** (`Mod+Shift+E`)
- **Toggle status bar**
- **Next tab** (`Mod+Tab` / `Mod+PageDown`)
- **Previous tab** (`Mod+Shift+Tab` / `Mod+PageUp`)
- **Keep tab** (`Mod+Shift+K`)
- **Outline** (Deferred)
- **Zoom in** (`Mod+=`)
- **Zoom out** (`Mod+-`)
- **Reset zoom** (`Mod+0`)
- **Always on top**
- **Full screen** (`F11`)
- **Fold or unfold section** (`Mod+.`)
- **Appearance**
  - **System**
  - **Light**
  - **Dark**
- **Theme** (Deferred)
- **Sort articles by**
  - **Name**
  - **Modified date**
  - **Type**
- **Show all files**
- **Collapse all folders**
- **Expand all folders**

`Go to tab 1` through `Go to tab 8` (`Mod+1` through `Mod+8`) and `Go to last tab` (`Mod+9`) are not in a menu; they are run from their shortcuts or the command palette.

`Callout...` and `Callout type...` are not in a menu either. Run from the command palette, they open the searchable callout type list for a new callout or for the callout in context.

#### Help Menu

- **What's new...**
- **Keyboard shortcuts** (`Mod+/`): Opens the [keyboard shortcuts reference](./specification.md#keyboard-shortcuts-reference).
- **Getting started**
- **Markdown reference**
- **File and folder workflows**
- **Settings reference**
- **Report issue**
- **Request feature**
- **Changelog**
- **Check for updates**: Reports whether a newer release exists and offers to open its page; see [Update check](./specification.md#update-check).
- **Support / Donate** (Deferred)
- **Open DevTools**
- **Diagnostics...**
- **About**

`What's new...` opens on the running version's bundled release notes, led by that release's highlights when it names any, or a no-notes state when none are available, and pages to any earlier release's notes. `Changelog` shows the complete bundled changelog. Both are read-only dialogs and work without a network connection.

`Diagnostics...` opens a dialog that shows app version, platform, log location, retention settings, and local-only privacy notes. Its copied summary includes app, platform, and current diagnostic-run metadata only. The dialog can open Leafdown's app-owned local diagnostic log directory. Local logs may include user content when captured error messages or stack traces include it.

The four documentation commands have no default shortcut. Each opens its bundled page in the read-only Help dialog. See [Help](./specification.md#help) for navigation and focus behavior.

For diagnostic log format and ownership, see [Architecture](./architecture.md#backend-responsibilities).

### Command Palette

`View > Command palette...` and `Mod+Shift+P` open a searchable list of registered application and editor commands. Results show the command label, its menu path, and its registered shortcut when present. Unavailable commands remain visible; contextual reasons appear when they add useful detail.

The palette searches command labels and menu paths. Its keyboard and focus behavior is specified in [Specification](./specification.md#command-palette).

### Context Popup

The context popup is a contextual menu triggered by a pointer or keyboard selection, right-click, or `Shift+F10` and the `Menu` key within the editor.

- Right-click inside an existing selection keeps the selection.
- Right-click outside a selection uses the editor's normal pointer handling to place the caret at the clicked location; the popup does not perform a second coordinate-based caret move.
- `Escape`, typing, or clicking outside closes it, as does `Tab` while focus is inside it. Scrolling does not close it.

#### Popup Contexts

The popup offers the actions of the context it opens in, one row or submenu per group, in this order. A command unavailable within its context stays visible but disabled.

Outside tables, rows with one or two actions show text: `Up` and `Down` for block movement, `Rename` and `Go to` for footnotes, `Language...` for a code block's language, and `Opens expanded` for a callout's authored disclosure. Paste, Replace image, and a link's actions keep their command labels, and each link action takes a row of its own. The full command name remains the accessible name.

- **Caret:** Paste; Blockquote, Ordered list, Unordered list, Task list; Block type; Insert.
- **Text selection:** Cut, Copy, Paste, Delete; Strong, Emphasis, Inline code, Link; Block type.
- **Structural block selection:** Cut, Copy, Paste, Delete; Move block up, Move block down; Blockquote, Ordered list, Unordered list, Task list; Block type; Insert.

`Block type` holds Paragraph and Heading 1 through Heading 6. `Insert` holds Paragraph, Heading 1 through Heading 6, Blockquote, Callout, Ordered list, Unordered list, Task list, Code block, Table, and Horizontal rule. Its `Callout` has the same structure as the menu bar's `Insert > Callout`: the inferred dialect's types, a separator, and submenus for the other dialects, each type with the icon a callout of that type shows.

The construct holding the whole caret or selection narrows its context:

- **Code block or frontmatter:** Leaves out Strong, Emphasis, Inline code, and Link.
- **Table:** Leaves out Blockquote, Ordered list, Unordered list, Task list, and Block type. Adds a two-row table bar before Insert, or last where Insert is left out. The first row holds row and column scope selectors and Delete table. The second holds Add row above, Add row below, Move row up, Move row down, and Delete row in row scope, or Add column before, Add column after, Move column left, Move column right, Align left, Align center, Align right, and Delete column in column scope. These actions use icon buttons with accessible names and tooltips. An alignment button is pressed while every column in context has that alignment, and choosing a pressed one returns the columns to the default.

An object's actions follow the first row, each shown only while it is available:

- **Footnote:** Rename footnote, Jump to footnote definition.
- **Image:** Replace image...
- **Link:** Copy destination, Remove link, Choose file... In a table, they share one row of icon buttons.
- **Fenced code block:** Code block language...
- **Callout:** Callout opens expanded, which shows as pressed while the admonition is written `???+`.

A callout in context also adds a `Callout type` submenu before Block type. It lists the types `Format > Callout` lists, each with its icon, and marks the callout's type.

### Article Navigator Context Menu

The article navigator's context menu opens on right-click, or with `Shift+F10` or the `Menu` key on the focused row. Its actions are not application commands and have no shortcuts; [Specification](./specification.md#article-navigator-actions) defines their behavior.

- **Markdown file row:** Open; New file, New folder; Rename, Delete; Open file location, Copy path, Copy relative path.
- **Directory row:** New file, New folder; Rename, Delete; Open folder location, Copy path, Copy relative path.
- **Unsupported file row**, listed while `Show all files` is on: New file, New folder; Open file location, Copy path, Copy relative path.
- **Empty navigator space (folder context root):** New file, New folder; Open folder location, Copy path, Copy relative path.

## Command State

Availability rules apply to implemented commands across menus, keyboard shortcuts, the context popup, and the command palette. Implemented commands are active by default unless disabled by context or build constraints; inactive commands are disabled rather than hidden.

A submenu trigger carries the same state as the commands behind it: it is disabled when every one of them is disabled, and enabled while at least one remains available. A submenu that would open with nothing to act on does not open.

### Contextual Availability

#### Document State

- `Save as`, `Close document`, and all `Edit`, `Insert`, and `Format` commands are disabled when no document is open.
  - Exception: `Insert final newline on save` remains enabled because it controls a global save setting rather than active editor content.
- `Export`, `Print`, and `Outline` are disabled when no document is open.
- `Save` is disabled when no document is open, or when the document is clean, already saved, and not in the preview tab.
- `Next tab` and `Previous tab` require a second open document; they move in tab order and wrap at either end. `Go to tab 1` through `Go to tab 8` require a tab at that position, and `Go to last tab` requires an open document. `Keep tab` requires the active tab to be the preview tab.

#### Selection And Editor State

- `Cut`, `Copy`, and `Copy as` require a selection.
- `Undo` and `Redo` require available editor history.
- `Jump to selection` requires a selection.
- `Jump to footnote definition` requires a footnote reference at the caret whose label a definition in the document answers to.
- `Footnote` in the Insert menu requires a caret or text selection whose end can hold an inline footnote reference, so it is unavailable in code blocks, footnote definition labels, and structural block or node selections.
- `Insert > Frontmatter` is available only when an active document has no frontmatter block. It has no default shortcut.
- `Rename footnote` requires the caret or selection within a footnote definition label, or a footnote reference at the caret whose label exactly one definition in the document answers to.
- `Replace image...` requires a standalone inline image whose source is projected, a selection of exactly that image, or a structural block selection of one paragraph holding only that image. An image inside a link label and a reference image do not offer it.
- `Copy destination`, `Remove link`, and `Choose file...` require one link holding the caret or the whole selection, including a link whose projected source still spells one complete link. `Copy destination` requires a destination, `Remove link` is not offered for an autolink, and `Choose file...` requires an inline Markdown link rather than a reference link, autolink, or wiki link.
- `Delete block` requires an active block.
- `Move block up` and `Move block down` require a structural block selection with an adjacent valid sibling in that direction.
- `Delete word backward`, `Delete word forward`, and `Select word` require a word at or adjacent to the caret.
- `Delete sentence` requires a text caret or selection within one run of text, which a textblock edge, hard break, inline object, or active source projection's edge ends, and that run must hold text. `Select sentence` also requires that the selection does not already cover whole sentences. Both are unavailable in code blocks, frontmatter, footnote definition labels, reference definition fields, and structural block, node, or table cell selections, and have no default shortcut.
- `Increase list indent` and `Decrease list indent` require a list item and a valid indentation change.
- `Toggle task checked` requires a task list item.
- `Code block language...` requires the caret or selection within one fenced code block, or a structural block selection of exactly one; indented code does not offer it.
- `Callout type...`, and the submenus that change a callout's type, require the caret or selection within one callout, or a structural block selection of exactly one; they act on the innermost callout holding the selection. `Callout opens expanded` also requires that callout to be an MkDocs admonition written with `???` or `???+`.
- `Clear inline formatting` requires supported inline formatting in the selection or an active marked inline element.
- `Clear block formatting` requires removable block formatting in the current or selected blocks.
- `Increase heading level` and `Decrease heading level` require a heading that can move in the requested direction.
- `Fold or unfold section` requires the caret or selection within one code block long enough to collapse, in a heading with a section to fold, or inside a heading's section; it collapses or expands that code block, or else acts on that heading, or on the innermost heading whose section holds the caret. It is unavailable while the whole document is selected.

#### Table State

- Table commands require the caret or selection inside a table.

#### File And Folder State

- `Open file location` requires an active saved document path. If the native file reveal fails because the path is missing or inaccessible, Leafdown shows an error.
- `Reveal in sidebar` requires a folder context and an active saved article in the article navigator.
- `Close folder` requires a folder context. In a named context it parks that context, retaining its tabs and drafts.
- `Open last closed` requires a last-closed item.
- `Clear recent items` requires at least one recent file or folder.
- `Toggle sidebar`, `Sort articles by`, `Show all files`, `Collapse all folders`, and `Expand all folders` require a folder context and an available article navigator.
- `Find in folder` and `Replace in folder` require a folder context, with or without an open document.

#### Search

- `Find next` and `Find previous` require a query entered for the active document. The query outlasts closing the search surface.

### Checked And Radio State

Use checkmarks for boolean command state and radio groups for mutually exclusive choices.

#### Boolean State

- `Insert final newline on save` reflects the global save setting. It remains available without an active document.
- `Toggle sidebar` reflects global sidebar visibility while it is available.
- `Toggle status bar` reflects global status bar visibility.
- `Show all files` reflects the global show-all-files setting while it is available.
- `Always on top` reflects the global always-on-top setting, which Leafdown records only after the window accepts the change.
- `Full screen` reflects current window state.
- `Callout opens expanded` reflects whether the MkDocs admonition in context is written `???+`, in the menu bar, the command palette, and the context popup.

#### Radio State

- `Line ending` is a radio group for the active document with CRLF and LF choices.
- `Save with encoding` is a radio group for the active document with, when it is neither form of UTF-8, the encoding the file was read in, then UTF-8 and UTF-8 with BOM.
- `Reopen with encoding` is a radio group marking the encoding the active file was read in.
- The types in `Format > Callout` and the context popup's `Callout type` are a radio group marking the type of the callout in context.
- `Appearance` is a radio group for the global appearance theme: `System`, `Light`, or `Dark`.
- `Theme` is a radio group for the global render/editor theme when implemented.
- `Sort articles by` is a radio group for the global article sort order.

#### Formatting State

- Other formatting commands do not expose live checked state until that behavior is intentionally designed.
