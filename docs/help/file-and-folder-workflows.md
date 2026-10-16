# File and folder workflows

Leafdown keeps your open documents and the folder context separate. The folder context pins the article navigator to one folder until you open or close another folder.

## Open and revisit

**File > Open** opens one Markdown file: `.md`, `.markdown`, `.mdown`, or `.mkd`. If no folder is open, Leafdown also opens its parent folder as context. If a folder is already pinned, opening a file elsewhere leaves that context in place. **File > Open folder** scans the folder for Markdown articles and opens a matching root-level `readme` or `index` file when present, keeping the documents you already have open. Ignored directories do not appear in the navigator.

## Work with tabs

Every document you open gets a tab above the document, after the one you are on, and **File > New** adds an untitled tab. Opening a file that is already open switches to its tab, so opening never closes or replaces a document. Each tab keeps its own unsaved edits, undo history, place in the document, and search.

Choose a tab to switch to it. `Mod+Tab` and `Mod+Shift+Tab`, or `Mod+PageDown` and `Mod+PageUp`, move to the next and previous tab, and `Mod+1` to `Mod+8` jump to a tab by position, `Mod+9` to the last one. A dot on a tab marks unsaved changes. **File > Close document** (`Mod+W`), a tab's close button, or a middle click closes it, asking first if it has unsaved changes. Closing the window or the folder asks once about every tab with unsaved changes.

A newly opened document starts at the top. Following a heading link or choosing a search result instead brings its target into view.

## Work in more than one window

**File > New window** (`Mod+Shift+N`) opens another Leafdown window, to keep two documents side by side or two folders open at once. Each window has its own tabs, folder, navigator, folder search, and zoom, while settings and recent items are shared and change in every window at once. A file is open in only one window at a time: opening a file that another window already has switches to its tab there and brings that window forward.

Renaming a file or folder in the navigator moves its tabs in every window, keeping their unsaved edits. Deleting one closes its tabs in the window you deleted it from; other windows keep its tabs open with their text and show the file as missing. **Replace in folder** leaves alone a file that another window has with unsaved edits, and says so.

**File > Close window** (`Alt+F4`) or the window's close button asks only about that window's unsaved edits, and closing the last window quits Leafdown. **File > Quit** (`Mod+Q`) closes every window in turn. A window with unsaved edits comes to the front to ask about them, and canceling there stops quitting with that window and those not yet asked still open. The first window reopens where you left it; other windows open offset from the one you opened them from.

On Windows, installing Leafdown adds it to File Explorer's **Open with** menu for these files and to **Settings > Apps > Default apps**, without changing which app opens them by default. Choose Leafdown there to open Markdown files from File Explorer. Files associated with Leafdown show a folded-page icon with the green leaf and Markdown symbol. If Leafdown is not running, it starts with the file, using the file's folder as context. If it is, the file opens as a new tab in the Leafdown window you used last, which comes to the front; a file that is already open switches to its tab and window instead. Starting Leafdown again without a file opens a new window. **File > Open** works either way.

The welcome screen and **File > Open recent** show previously opened files and folders when **Record recent files and folders** is on. You can remove one recent item or clear both lists without deleting files. See [Settings reference](settings-reference.md) for the setting.

## Work in the article navigator

Choose a Markdown file row to open it. A row's context menu can create a file or folder, rename or delete an entry, reveal its location in the system file manager, or copy its absolute or folder-relative path. Empty navigator space offers actions for the folder root. New files open in a new tab. Deleting asks for confirmation and moves an entry to the system Recycle Bin or Trash; Leafdown does not permanently delete it on its own. Deleting an open file closes its tab. Renaming an open file keeps its unsaved edits and updates its recent path. Both reach tabs in other windows too, as [Work in more than one window](#work-in-more-than-one-window) describes. Links in other files are not rewritten.

The navigator lists Markdown articles and the folders that hold them, along with empty folders so a folder you just made stays in view. Turn on **View > Show all files** to list the folder's other files too, such as images and PDFs, dimmed. Leafdown can only open Markdown files, so choosing one of them does nothing, and its context menu does not rename or delete it. With that setting on, a folder holding only such files can be expanded, while an empty folder has no arrow either way.

## Search the folder

**Edit > Find and replace > Find in folder** (`Mod+Shift+F`) turns the sidebar into a search of the open folder's Markdown files, the same files the navigator opens. Type to search; matching works as **Find** does inside a document, with **Match case** and **Whole word**, and every open document is searched as you have it, unsaved edits included. Matches are grouped by file, with the text around each one. Choose a match, or move to it with the arrow keys and press `Enter`, to open its file in a tab and highlight the match while you stay in the results. Files that are too large or not valid UTF-8 or UTF-16 are skipped and listed. `Escape` returns to the navigator and to the document, with the match selected.

## Replace across the folder

**Edit > Find and replace > Replace in folder** (`Mod+Shift+H`), or the arrow before the search field, shows a **Replace with** field. While it shows, the view previews every change instead of searching: each match is shown struck through with its replacement beside it, across every file, however many there are. Nothing is written until you choose **Replace all**, which appears once the preview is complete; changing the search, the replacement, or an option first changes nothing.

**Replace all** writes each file in turn and then reports what it did. Only the lines holding a replacement change; a file marked with a warning sign is written as **Save** would write it, which can also change other lines, such as the padding of a table. If open documents with unsaved changes are part of the preview, you are asked to save or discard each of them first, and the preview updates before anything is written. A file that changed since the preview is left alone and listed, as is any file that cannot be written, and the other files are still replaced.

A replacement cannot be undone across files. In an open document, **Undo** undoes it for that document only; other files keep their new text, so commit or back up your notes first if you may want them back.

## Drop a file or folder

Drop one supported Markdown file or folder onto the app to open it. A preview shows the configured action while dragging. In **Preferences > Files**, each drop type can instead insert a link into the active document. A saved document receives a relative link when the paths share a filesystem root; an untitled document receives an absolute link. Multiple or unsupported items are not opened.

## Links and images

Relative links and image paths start from the saved document's location. An untitled document cannot resolve them until it is saved. Local Markdown links open in Leafdown without replacing the pinned folder. Rest the pointer on one, or press `Mod+Alt+P` with the caret in it, to preview the start of the linked file, or the section its heading fragment names, without opening it. A local non-Markdown link asks before opening with the system default app. Web links open in the system browser.

Local images render when available. A remote `https:` image remains a placeholder until you choose **Load image**; merely opening a document does not request it. Images outside the folder context may ask for approval before rendering. See [Markdown reference](markdown-reference.md) for link syntax.

## Export as HTML

**File > Export > Export as HTML...** writes the open document, including unsaved edits, as a single HTML page you can read in any browser without Leafdown or a network connection. Local images, math, diagrams, and highlighted code are embedded in the page. A remote image is included only if you loaded it in the document first, and an image outside the folder only if you loaded it there. Anything left out is listed when the export finishes. Exporting does not save or change your Markdown file.

## Save and external changes

Saving keeps the blank lines a file ends with, though the document shows no empty lines for them. They stay at the end as you edit, and selecting everything and then typing or deleting removes them with the rest of the text.

**File > Save as** writes the document to a chosen path. Saving outside the current folder does not switch that folder, and a file open in another tab cannot be saved over. Leafdown watches every open file: a clean document reloads after another program changes it, while an edited document keeps its changes and warns. Saving over an externally changed file asks first. If the file has disappeared, Save offers Save as. These checks also apply to a file opened outside the pinned folder.
