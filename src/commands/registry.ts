import type { AppCommandId, CommandDefinition, CommandMenuId, CommandShortcut } from "./types";

export const commandDefinitions: Record<AppCommandId, CommandDefinition> = {
  "file.new": { id: "file.new", label: "New", shortcut: { key: "n", mod: true } },
  "file.open": { id: "file.open", label: "Open...", shortcut: { key: "o", mod: true } },
  "file.openFolder": {
    id: "file.openFolder",
    label: "Open folder...",
    shortcut: { key: "o", mod: true, shift: true },
  },
  "file.clearRecentItems": { id: "file.clearRecentItems", label: "Clear recent items" },
  "file.save": { id: "file.save", label: "Save", shortcut: { key: "s", mod: true } },
  "file.saveAs": {
    id: "file.saveAs",
    label: "Save as...",
    shortcut: { key: "s", mod: true, shift: true },
  },
  "file.openLocation": { id: "file.openLocation", label: "Open file location" },
  "file.revealInSidebar": { id: "file.revealInSidebar", label: "Reveal in sidebar" },
  "file.preferences": {
    id: "file.preferences",
    label: "Preferences...",
    shortcut: { key: ",", mod: true },
  },
  "file.closeDocument": {
    id: "file.closeDocument",
    label: "Close document",
    shortcut: { key: "w", mod: true },
  },
  "file.closeWindow": {
    id: "file.closeWindow",
    label: "Close window",
    shortcut: { key: "q", mod: true },
  },
  "edit.undo": { id: "edit.undo", label: "Undo", shortcut: { key: "z", mod: true } },
  "edit.redo": {
    id: "edit.redo",
    label: "Redo",
    shortcuts: [
      { key: "y", mod: true },
      { key: "z", mod: true, shift: true },
    ],
  },
  "edit.cut": { id: "edit.cut", label: "Cut", shortcut: { key: "x", mod: true } },
  "edit.copy": { id: "edit.copy", label: "Copy", shortcut: { key: "c", mod: true } },
  "edit.copyAsPlainText": { id: "edit.copyAsPlainText", label: "Plain text" },
  "edit.copyAsMarkdown": { id: "edit.copyAsMarkdown", label: "Markdown" },
  "edit.paste": { id: "edit.paste", label: "Paste", shortcut: { key: "v", mod: true } },
  "edit.pasteAsPlainText": {
    id: "edit.pasteAsPlainText",
    label: "Plain text",
    shortcut: { key: "v", mod: true, shift: true },
  },
  "edit.pasteAsMarkdown": { id: "edit.pasteAsMarkdown", label: "Markdown" },
  "edit.pasteAsRichText": { id: "edit.pasteAsRichText", label: "Rich text / formatted text" },
  "edit.delete": { id: "edit.delete", label: "Delete", shortcut: { key: "Delete" } },
  "edit.deleteWordBackward": {
    id: "edit.deleteWordBackward",
    label: "Delete word backward",
    shortcut: { key: "Backspace", mod: true },
  },
  "edit.deleteWordForward": {
    id: "edit.deleteWordForward",
    label: "Delete word forward",
    shortcut: { key: "Delete", mod: true },
  },
  "edit.selectAll": {
    id: "edit.selectAll",
    label: "Select all",
    shortcut: { key: "a", mod: true },
  },
  "edit.selectWord": { id: "edit.selectWord", label: "Select word" },
  "edit.jumpToTop": {
    id: "edit.jumpToTop",
    label: "Jump to top",
    shortcut: { key: "Home", mod: true },
  },
  "edit.jumpToBottom": {
    id: "edit.jumpToBottom",
    label: "Jump to bottom",
    shortcut: { key: "End", mod: true },
  },
  "edit.jumpToSelection": { id: "edit.jumpToSelection", label: "Jump to selection" },
  "edit.jumpToLineStart": {
    id: "edit.jumpToLineStart",
    label: "Jump to line start",
    shortcut: { key: "Home" },
  },
  "edit.jumpToLineEnd": {
    id: "edit.jumpToLineEnd",
    label: "Jump to line end",
    shortcut: { key: "End" },
  },
  "edit.lineEnding.crlf": { id: "edit.lineEnding.crlf", label: "Windows line ending (CRLF)" },
  "edit.lineEnding.lf": { id: "edit.lineEnding.lf", label: "Unix line ending (LF)" },
  "edit.insertFinalNewline": {
    id: "edit.insertFinalNewline",
    label: "Insert final newline on save",
  },
  "insert.paragraph": { id: "insert.paragraph", label: "Paragraph" },
  "insert.heading1": { id: "insert.heading1", label: "Heading 1" },
  "insert.heading2": { id: "insert.heading2", label: "Heading 2" },
  "insert.heading3": { id: "insert.heading3", label: "Heading 3" },
  "insert.heading4": { id: "insert.heading4", label: "Heading 4" },
  "insert.heading5": { id: "insert.heading5", label: "Heading 5" },
  "insert.heading6": { id: "insert.heading6", label: "Heading 6" },
  "insert.link": { id: "insert.link", label: "Link", shortcut: { key: "k", mod: true } },
  "insert.image": { id: "insert.image", label: "Image" },
  "insert.orderedList": { id: "insert.orderedList", label: "Ordered list" },
  "insert.unorderedList": { id: "insert.unorderedList", label: "Unordered list" },
  "insert.taskList": { id: "insert.taskList", label: "Task list" },
  "insert.blockquote": { id: "insert.blockquote", label: "Blockquote" },
  "insert.codeBlock": { id: "insert.codeBlock", label: "Code block" },
  "insert.table": { id: "insert.table", label: "Table" },
  "insert.horizontalRule": { id: "insert.horizontalRule", label: "Horizontal rule" },
  "format.strong": { id: "format.strong", label: "Strong", shortcut: { key: "b", mod: true } },
  "format.emphasis": {
    id: "format.emphasis",
    label: "Emphasis",
    shortcut: { key: "i", mod: true },
  },
  "format.strikethrough": {
    id: "format.strikethrough",
    label: "Strikethrough",
    shortcut: { key: "x", mod: true, alt: true },
  },
  "format.inlineCode": {
    id: "format.inlineCode",
    label: "Inline code",
    shortcut: { key: "e", mod: true },
  },
  "format.clearInline": {
    id: "format.clearInline",
    label: "Clear inline formatting",
    shortcut: { key: "\\", mod: true },
  },
  "format.paragraph": {
    id: "format.paragraph",
    label: "Paragraph",
    shortcut: { key: "0", mod: true, alt: true },
  },
  "format.heading1": {
    id: "format.heading1",
    label: "Heading 1",
    shortcut: { key: "1", mod: true, alt: true },
  },
  "format.heading2": {
    id: "format.heading2",
    label: "Heading 2",
    shortcut: { key: "2", mod: true, alt: true },
  },
  "format.heading3": {
    id: "format.heading3",
    label: "Heading 3",
    shortcut: { key: "3", mod: true, alt: true },
  },
  "format.heading4": {
    id: "format.heading4",
    label: "Heading 4",
    shortcut: { key: "4", mod: true, alt: true },
  },
  "format.heading5": {
    id: "format.heading5",
    label: "Heading 5",
    shortcut: { key: "5", mod: true, alt: true },
  },
  "format.heading6": {
    id: "format.heading6",
    label: "Heading 6",
    shortcut: { key: "6", mod: true, alt: true },
  },
  "format.increaseHeading": { id: "format.increaseHeading", label: "Increase heading level" },
  "format.decreaseHeading": { id: "format.decreaseHeading", label: "Decrease heading level" },
  "format.orderedList": {
    id: "format.orderedList",
    label: "Ordered list",
    shortcut: { key: "7", mod: true, alt: true },
  },
  "format.unorderedList": {
    id: "format.unorderedList",
    label: "Unordered list",
    shortcut: { key: "8", mod: true, alt: true },
  },
  "format.taskList": { id: "format.taskList", label: "Task list" },
  "format.increaseListIndent": {
    id: "format.increaseListIndent",
    label: "Increase list indent",
    shortcut: { key: "Tab" },
  },
  "format.decreaseListIndent": {
    id: "format.decreaseListIndent",
    label: "Decrease list indent",
    shortcut: { key: "Tab", shift: true },
  },
  "format.toggleTaskChecked": { id: "format.toggleTaskChecked", label: "Toggle task checked" },
  "format.blockquote": {
    id: "format.blockquote",
    label: "Blockquote",
    shortcut: { key: "b", mod: true, shift: true },
  },
  "format.codeBlock": {
    id: "format.codeBlock",
    label: "Code block",
    shortcut: { key: "c", mod: true, alt: true },
  },
  "format.table.delete": { id: "format.table.delete", label: "Delete table" },
  "format.table.addRowAbove": { id: "format.table.addRowAbove", label: "Add row above" },
  "format.table.addRowBelow": { id: "format.table.addRowBelow", label: "Add row below" },
  "format.table.addColumnBefore": {
    id: "format.table.addColumnBefore",
    label: "Add column before",
  },
  "format.table.addColumnAfter": { id: "format.table.addColumnAfter", label: "Add column after" },
  "format.table.moveRowUp": { id: "format.table.moveRowUp", label: "Move row up" },
  "format.table.moveRowDown": { id: "format.table.moveRowDown", label: "Move row down" },
  "format.table.moveColumnLeft": { id: "format.table.moveColumnLeft", label: "Move column left" },
  "format.table.moveColumnRight": {
    id: "format.table.moveColumnRight",
    label: "Move column right",
  },
  "format.table.deleteRow": { id: "format.table.deleteRow", label: "Delete row" },
  "format.table.deleteColumn": { id: "format.table.deleteColumn", label: "Delete column" },
  "format.clearBlock": { id: "format.clearBlock", label: "Clear block formatting" },
  "view.toggleSidebar": {
    id: "view.toggleSidebar",
    label: "Toggle sidebar",
    shortcut: { key: "e", mod: true, shift: true },
  },
  "view.zoomIn": { id: "view.zoomIn", label: "Zoom in", shortcut: { key: "=", mod: true } },
  "view.zoomOut": { id: "view.zoomOut", label: "Zoom out", shortcut: { key: "-", mod: true } },
  "view.resetZoom": {
    id: "view.resetZoom",
    label: "Reset zoom",
    shortcut: { key: "0", mod: true },
  },
  "view.fullscreen": { id: "view.fullscreen", label: "Full screen", shortcut: { key: "F11" } },
  "view.appearance.system": { id: "view.appearance.system", label: "System" },
  "view.appearance.light": { id: "view.appearance.light", label: "Light" },
  "view.appearance.dark": { id: "view.appearance.dark", label: "Dark" },
  "view.sort.name": { id: "view.sort.name", label: "Name" },
  "view.sort.modifiedDate": { id: "view.sort.modifiedDate", label: "Modified date" },
  "view.sort.type": { id: "view.sort.type", label: "Type" },
  "view.collapseAllFolders": { id: "view.collapseAllFolders", label: "Collapse all folders" },
  "view.expandAllFolders": { id: "view.expandAllFolders", label: "Expand all folders" },
  "help.about": { id: "help.about", label: "About" },
};

export const commandMenuLabels = {
  file: "File",
  edit: "Edit",
  insert: "Insert",
  format: "Format",
  view: "View",
  help: "Help",
} satisfies Record<CommandMenuId, string>;

export const getCommandShortcuts = ({ shortcut, shortcuts }: CommandDefinition) =>
  shortcuts ?? (shortcut ? [shortcut] : []);

export const shortcutCommandIds = Object.values(commandDefinitions)
  .filter((command) => getCommandShortcuts(command).length > 0)
  .map((command) => command.id);

const isPrimaryModifierEvent = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;

export const formatShortcut = ({ alt, key, mod, shift }: CommandShortcut) =>
  [
    mod ? "Mod" : null,
    alt ? "Alt" : null,
    shift ? "Shift" : null,
    key.length === 1 ? key.toUpperCase() : key,
  ]
    .filter(Boolean)
    .join("+");

export const matchesShortcut = (event: KeyboardEvent, shortcut: CommandShortcut) => {
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const shortcutKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;

  return (
    eventKey === shortcutKey &&
    Boolean(shortcut.mod) === isPrimaryModifierEvent(event) &&
    Boolean(shortcut.alt) === event.altKey &&
    Boolean(shortcut.shift) === event.shiftKey
  );
};

export const isSuppressedWebviewShortcut = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase();

  return (
    (isPrimaryModifierEvent(event) && key === "r") ||
    key === "f5" ||
    (event.altKey && (key === "arrowleft" || key === "arrowright"))
  );
};
