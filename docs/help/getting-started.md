# Getting started

Leafdown edits ordinary Markdown files on your computer. Your work stays in the document you choose; opening Help does not change it.

## Start a document

Choose **File > New** to write an untitled document. Nothing is created on disk until you save it. Choose **File > Open** to edit an existing `.md` or `.markdown` file, or **File > Open folder** to browse a folder of Markdown files. Opening a folder also opens its first matching root-level index file, if one exists; otherwise choose an article in the navigator.

You can open an individual file while a folder is already open. The folder remains pinned in the navigator, even if that file is elsewhere.

## Find and edit articles

The article navigator lists the files in the open folder. Choose a Markdown article to open it; other files, such as images, are dimmed because Leafdown cannot open them. Expand folders to reach nested articles, and use **View > Collapse all folders** or **Expand all folders** to change the tree at once. The sidebar toggle hides the navigator without closing its folder.

Click in the document and type. Leafdown shows Markdown as formatted text while keeping its source in the file. Formatting and insertion commands are in **Insert** and **Format**; **Edit** contains Undo, Redo, and Find and replace. See [Markdown reference](markdown-reference.md) for supported source forms.

## Save and close

Choose **File > Save** to write changes. Saving an untitled document opens **Save as**, where you choose its filename and location. **File > Save as** also writes an existing document to a new path. A file saved outside the open folder does not replace that pinned folder context.

Opening a document never closes another: each opens in its own tab. When you close a tab, the folder, or the window with unsaved changes, Leafdown asks before discarding them, and canceling keeps everything open. If another program has changed or removed the file, Leafdown warns before a save can overwrite it or offers Save as for a missing file.

Continue with [File and folder workflows](file-and-folder-workflows.md) or [Settings reference](settings-reference.md).
