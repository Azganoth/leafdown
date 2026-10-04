# File and folder workflows

Leafdown keeps the open document and the folder context separate. The folder context pins the article navigator to one folder until you open or close another folder.

## Open and revisit

**File > Open** opens one `.md` or `.markdown` file. If no folder is open, Leafdown also opens its parent folder as context. If a folder is already pinned, opening a file elsewhere leaves that context in place. **File > Open folder** scans the folder for Markdown articles and opens a matching root-level `readme` or `index` file when present. Ignored directories do not appear in the navigator.

The welcome screen and **File > Open recent** show previously opened files and folders when **Record recent files and folders** is on. You can remove one recent item or clear both lists without deleting files. See [Settings reference](settings-reference.md) for the setting.

## Work in the article navigator

Choose a file row to open it. A row's context menu can create a file or folder, rename or delete an entry, reveal its location in the system file manager, or copy its absolute or folder-relative path. Empty navigator space offers actions for the folder root. New files open after creation. Deleting asks for confirmation and moves an entry to the system Recycle Bin or Trash; Leafdown does not permanently delete it on its own. Renaming an open file keeps its unsaved edits and updates its recent path. Links in other files are not rewritten.

## Drop a file or folder

Drop one supported Markdown file or folder onto the app to open it. A preview shows the configured action while dragging. In **Preferences > Files**, each drop type can instead insert a link into the active document. A saved document receives a relative link when the paths share a filesystem root; an untitled document receives an absolute link. Multiple or unsupported items are not opened.

## Links and images

Relative links and image paths start from the saved document's location. An untitled document cannot resolve them until it is saved. Local Markdown links open in Leafdown without replacing the pinned folder. A local non-Markdown link asks before opening with the system default app. Web links open in the system browser.

Local images render when available. A remote `https:` image remains a placeholder until you choose **Load image**; merely opening a document does not request it. Images outside the folder context may ask for approval before rendering. See [Markdown reference](markdown-reference.md) for link syntax.

## Export as HTML

**File > Export > Export as HTML...** writes the open document, including unsaved edits, as a single HTML page you can read in any browser without Leafdown or a network connection. Local images, math, diagrams, and highlighted code are embedded in the page. A remote image is included only if you loaded it in the document first, and an image outside the folder only if you loaded it there. Anything left out is listed when the export finishes. Exporting does not save or change your Markdown file.

## Save and external changes

**File > Save as** writes the document to a chosen path. Saving outside the current folder does not switch that folder. Leafdown watches the open file: a clean document reloads after another program changes it, while an edited document keeps its changes and warns. Saving over an externally changed file asks first. If the file has disappeared, Save offers Save as. These checks also apply to a file opened outside the pinned folder.
