# MVP Specification

## Scope

The MVP focuses on the smallest useful version of the app:

- Open a single Markdown file.
- Open a folder containing Markdown files.
- Render Markdown in a polished reading view.
- Edit Markdown using a hybrid rendered-document editor.
- Provide raw source mode as a fallback.
- Save changes back to ordinary Markdown files.
- Support relative links and relative images.
- Provide light and dark themes.
- Remember recent files and folders.

The MVP explicitly excludes Mermaid support and version history/diff.

## Supported File Types

The MVP should support:

- `.md`
- `.markdown`

Optional later:

- `.mdown`
- `.mkd`

## Main Screens

### Welcome Screen

Shown when no file or folder is open.

Should provide:

- Open File
- Open Folder
- Recent files
- Recent folders
- Settings access

Should not require account creation or onboarding.

### Single File View

Used when the user opens one Markdown file.

Layout:

- Main document area.
- Optional heading outline.
- Minimal top bar with file name and basic actions.

Required actions:

- Save
- Save As
- Toggle edit/read mode if implemented as distinct states
- Toggle source mode
- Open containing folder
- Close file

### Folder View

Used when the user opens a folder.

Layout:

- Left sidebar with Markdown file tree.
- Main document area.
- Optional heading outline.
- Minimal top bar with current file name and basic actions.

Required behavior:

- Show Markdown files in a tree.
- Allow nested folders.
- Ignore non-Markdown files by default.
- Provide a way to reveal or hide non-Markdown files later, but not required in MVP.
- Select a Markdown file to open it.
- Preserve the folder as a normal folder.
- Do not write app metadata into the folder during the MVP.

## Reading Mode

Reading mode is the default conceptual experience.

The rendered document should support:

- Headings
- Paragraphs
- Bold
- Italic
- Strikethrough if using GitHub-Flavored Markdown
- Inline code
- Code blocks
- Blockquotes
- Ordered lists
- Unordered lists
- Task lists
- Tables
- Horizontal rules
- Links
- Images
- Escaped characters

The reading experience should provide:

- Comfortable line width.
- Clean typography.
- Proper heading hierarchy.
- Good spacing.
- Styled code blocks.
- Styled tables.
- Light and dark themes.
- Smooth scrolling.
- Anchor navigation for headings.

## Hybrid Editing

The MVP should avoid a permanent two-panel editor/preview layout.

The user should edit directly in the rendered document surface.

Expected behavior:

- Text appears rendered most of the time.
- Markdown syntax appears only when helpful or when editing a block.
- Headings remain visually distinct while editable.
- Lists remain visually structured while editable.
- Code blocks expose their raw content for editing.
- Links should be editable without making the interaction painful.
- Tables may have basic support in MVP, but complex table editing can be limited.
- Source mode must be available for precise edits.

## Source Mode

Source mode shows the raw Markdown text for the current document.

Purpose:

- Recovery from hybrid editor edge cases.
- Precise Markdown edits.
- Easier editing of complex tables, links, or unusual Markdown.
- Debugging serialization problems during development.

Source mode should support:

- Plain text Markdown editing.
- Syntax highlighting if feasible.
- Save.
- Unsaved changes tracking.
- Switching back to hybrid mode.

## Saving

The app must save files as ordinary Markdown.

Required behavior:

- `Ctrl+S` saves the current file.
- Save button saves the current file.
- Unsaved changes are indicated in the UI.
- Closing a file with unsaved changes prompts the user.
- Opening another file with unsaved changes prompts the user.
- Exiting the app with unsaved changes prompts the user.

The MVP does not need autosave.

## File Opening

### Open File

When a Markdown file is opened:

1. Read the file from disk.
2. Parse/render the Markdown.
3. Display it in the document area.
4. Track the file path.
5. Add the file to recent files.

If the file cannot be opened, show a clear error message.

### Open Folder

When a folder is opened:

1. Scan the folder for Markdown files.
2. Build a Markdown file tree.
3. Select a default file if possible.
4. Add the folder to recent folders.

Default file selection priority:

1. `README.md`
2. `readme.md`
3. `index.md`
4. First Markdown file alphabetically

## Relative Links

Relative Markdown links should resolve based on the current file location.

Example:

```markdown
[Setup](./setup.md)
```

Expected behavior:

- If the target is another Markdown file, open it inside the app.
- If the target is not a Markdown file, use the system default behavior or ask for confirmation.
- If the target does not exist, show a non-disruptive broken link message.

## Relative Images

Relative images should resolve based on the current file location.

Example:

```markdown
![Diagram](./images/architecture.png)
```

Required image formats:

- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.svg`
- `.webp`

If an image is missing, show a clear missing image placeholder.

## Heading Outline

The MVP should include an optional heading outline if it is not too costly.

The outline should:

- Show headings from the current document.
- Preserve heading hierarchy.
- Scroll to the selected heading.
- Update after editing.

If this delays the MVP, it can be moved to the next version.

## Search

MVP search should be limited.

Required:

- Search within the current document.

Not required in MVP:

- Search across folder.
- Search history.
- Search indexing.

## Settings

MVP settings should include:

- Theme: system, light, dark.
- Default open behavior if needed.
- Font size.
- Recent files/folders clearing.

Avoid complex settings in the MVP.

## Keyboard Shortcuts

Required shortcuts:

| Shortcut     | Action                                    |
| ------------ | ----------------------------------------- |
| Ctrl+O       | Open file                                 |
| Ctrl+Shift+O | Open folder                               |
| Ctrl+S       | Save                                      |
| Ctrl+Shift+S | Save As                                   |
| Ctrl+F       | Search current document                   |
| Ctrl+E       | Toggle edit/read behavior or focus editor |
| Ctrl+`       | Toggle source mode                        |
| Ctrl+,       | Open settings                             |

Platform-specific shortcuts may need adjustment on macOS later.

## Error Handling

The app should provide clear errors for:

- File not found.
- File cannot be read.
- File cannot be saved.
- Permission denied.
- File changed externally.
- Invalid encoding.
- Unsupported file type.
- Broken relative link.
- Missing relative image.

Errors should be understandable and should not expose unnecessary internal implementation details.

## MVP Acceptance Criteria

The MVP is acceptable when a user can:

1. Open a `.md` file.
2. Read it in a polished rendered view.
3. Edit it through the hybrid editor.
4. Save it back to disk.
5. Reopen the file and see the saved changes.
6. Switch to source mode and edit raw Markdown.
7. Open a folder of Markdown files.
8. Navigate between Markdown files in the folder.
9. Open relative Markdown links between files.
10. View relative images.
11. Use the app without an account, internet connection, or project setup.

## Explicitly Excluded From MVP

The MVP will not include:

- Mermaid rendering.
- Version history.
- Diff viewer.
- Git integration.
- Folder-wide search.
- Tabs.
- Plugin system.
- Cloud sync.
- Collaboration.
- Export to PDF/HTML.
- Math rendering.
- Frontmatter editing UI.
- Custom theme marketplace.
