# MVP

The MVP defines and implements the core workflow: local Markdown file and folder access, WYSIWYG editing, and saving clean Markdown back to disk.

## Scope Rule

Scope is defined by the required behavior in [`./specification.md`](./specification.md), excluding features marked `Post-MVP` or `Development-only`, or listed in [`./backlog.md`](./backlog.md).

## Acceptance Criteria

1. Opening a Markdown file or folder establishes the correct folder context and sidebar state.
2. Document workflows (New, Save, Save As) manage untitled and saved states without pre-allocating files on disk.
3. Supported Markdown renders and saves through a single hybrid editor, avoiding separate source/preview panes or read/edit modes.
4. Save operations preserve Markdown semantics and serialize to the default application style.
5. Modified documents and external filesystem changes trigger the specified prompt actions.
6. Empty files open as empty documents; invalid, oversized, missing, or invalid-encoding files resolve to specified error states.
7. Relative Markdown links and local images resolve relative to the active document path.
8. Caret-based marker visibility, context popup actions, keyboard editing, history (undo/redo), and clipboard operations comply with the specification.
9. Recent lists and global settings persist across application launches.
10. The application functions offline without user accounts, telemetry, cloud sync, proprietary storage, or initialization steps.
11. The sidebar directory tree synchronizes automatically using native filesystem watching.

## Execution

Implementation is tracked via the MVP milestone using GitHub Issues and the Project board.
