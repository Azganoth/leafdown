import { EDITOR_COMMAND_LABELS, type EditorCommandId } from "@/features/editor";
import {
  formatKeyboardKey,
  hasNonPrimaryModifierEvent,
  isPrimaryModifierEvent,
  normalizeKeyboardKey,
} from "@/lib/input";
import { isTruthy } from "@/lib/predicates";

import type { AppCommandId } from "./dispatch";

export type CommandMenuId = "file" | "edit" | "insert" | "format" | "view" | "help";

export interface CommandShortcut {
  key: string;
  alt?: boolean;
  mod?: boolean;
  shift?: boolean;
}

export interface CommandDefinition {
  label: string;
  shortcuts?: CommandShortcut[];
}

const commandDef = (label: string, ...shortcuts: CommandShortcut[]): CommandDefinition => ({
  label,
  ...(shortcuts.length > 0 ? { shortcuts } : {}),
});

const editorCommandDef = (commandId: EditorCommandId, ...shortcuts: CommandShortcut[]) =>
  commandDef(EDITOR_COMMAND_LABELS[commandId], ...shortcuts);

export const COMMAND_DEFINITIONS: Record<AppCommandId, CommandDefinition> = {
  "file.new": commandDef("New", { key: "n", mod: true }),
  "file.open": commandDef("Open...", { key: "o", mod: true }),
  "file.openFolder": commandDef("Open folder...", { key: "o", mod: true, shift: true }),
  "file.clearRecentItems": commandDef("Clear recent items"),
  "file.save": commandDef("Save", { key: "s", mod: true }),
  "file.saveAs": commandDef("Save as...", { key: "s", mod: true, shift: true }),
  "file.openLocation": commandDef("Open file location"),
  "file.revealInSidebar": commandDef("Reveal in sidebar"),
  "file.preferences": commandDef("Preferences...", { key: ",", mod: true }),
  "file.closeDocument": commandDef("Close document", { key: "w", mod: true }),
  "file.closeWindow": commandDef("Close window", { key: "q", mod: true }, { key: "F4", alt: true }),
  "edit.undo": editorCommandDef("edit.undo", { key: "z", mod: true }),
  "edit.redo": editorCommandDef(
    "edit.redo",
    { key: "y", mod: true },
    { key: "z", mod: true, shift: true },
  ),
  "edit.cut": editorCommandDef("edit.cut", { key: "x", mod: true }),
  "edit.copy": editorCommandDef("edit.copy", { key: "c", mod: true }),
  "edit.copyAsPlainText": editorCommandDef("edit.copyAsPlainText"),
  "edit.copyAsMarkdown": editorCommandDef("edit.copyAsMarkdown"),
  "edit.paste": editorCommandDef("edit.paste", { key: "v", mod: true }),
  "edit.pasteAsPlainText": editorCommandDef("edit.pasteAsPlainText", {
    key: "v",
    mod: true,
    shift: true,
  }),
  "edit.pasteAsMarkdown": editorCommandDef("edit.pasteAsMarkdown"),
  "edit.pasteAsRichText": editorCommandDef("edit.pasteAsRichText"),
  "edit.delete": editorCommandDef("edit.delete", { key: "Delete" }),
  "edit.deleteWordBackward": editorCommandDef("edit.deleteWordBackward", {
    key: "Backspace",
    mod: true,
  }),
  "edit.deleteWordForward": editorCommandDef("edit.deleteWordForward", {
    key: "Delete",
    mod: true,
  }),
  "edit.selectAll": editorCommandDef("edit.selectAll", { key: "a", mod: true }),
  "edit.selectWord": editorCommandDef("edit.selectWord"),
  "edit.jumpToTop": editorCommandDef("edit.jumpToTop", { key: "Home", mod: true }),
  "edit.jumpToBottom": editorCommandDef("edit.jumpToBottom", { key: "End", mod: true }),
  "edit.jumpToSelection": editorCommandDef("edit.jumpToSelection"),
  "edit.jumpToLineStart": editorCommandDef("edit.jumpToLineStart", { key: "Home" }),
  "edit.jumpToLineEnd": editorCommandDef("edit.jumpToLineEnd", { key: "End" }),
  "edit.lineEnding.crlf": commandDef("Windows line ending (CRLF)"),
  "edit.lineEnding.lf": commandDef("Unix line ending (LF)"),
  "edit.insertFinalNewline": commandDef("Insert final newline on save"),
  "insert.paragraph": editorCommandDef("insert.paragraph"),
  "insert.heading1": editorCommandDef("insert.heading1"),
  "insert.heading2": editorCommandDef("insert.heading2"),
  "insert.heading3": editorCommandDef("insert.heading3"),
  "insert.heading4": editorCommandDef("insert.heading4"),
  "insert.heading5": editorCommandDef("insert.heading5"),
  "insert.heading6": editorCommandDef("insert.heading6"),
  "insert.link": editorCommandDef("insert.link", { key: "k", mod: true }),
  "insert.image": editorCommandDef("insert.image"),
  "insert.orderedList": editorCommandDef("insert.orderedList"),
  "insert.unorderedList": editorCommandDef("insert.unorderedList"),
  "insert.taskList": editorCommandDef("insert.taskList"),
  "insert.blockquote": editorCommandDef("insert.blockquote"),
  "insert.codeBlock": editorCommandDef("insert.codeBlock"),
  "insert.table": editorCommandDef("insert.table"),
  "insert.horizontalRule": editorCommandDef("insert.horizontalRule"),
  "format.strong": editorCommandDef("format.strong", { key: "b", mod: true }),
  "format.emphasis": editorCommandDef("format.emphasis", { key: "i", mod: true }),
  "format.strikethrough": editorCommandDef("format.strikethrough", {
    key: "x",
    mod: true,
    alt: true,
  }),
  "format.inlineCode": editorCommandDef("format.inlineCode", { key: "e", mod: true }),
  "format.clearInline": editorCommandDef("format.clearInline", { key: "\\", mod: true }),
  "format.paragraph": editorCommandDef("format.paragraph", {
    key: "0",
    mod: true,
    alt: true,
  }),
  "format.heading1": editorCommandDef("format.heading1", { key: "1", mod: true, alt: true }),
  "format.heading2": editorCommandDef("format.heading2", { key: "2", mod: true, alt: true }),
  "format.heading3": editorCommandDef("format.heading3", { key: "3", mod: true, alt: true }),
  "format.heading4": editorCommandDef("format.heading4", { key: "4", mod: true, alt: true }),
  "format.heading5": editorCommandDef("format.heading5", { key: "5", mod: true, alt: true }),
  "format.heading6": editorCommandDef("format.heading6", { key: "6", mod: true, alt: true }),
  "format.increaseHeading": editorCommandDef("format.increaseHeading"),
  "format.decreaseHeading": editorCommandDef("format.decreaseHeading"),
  "format.orderedList": editorCommandDef("format.orderedList", {
    key: "7",
    mod: true,
    alt: true,
  }),
  "format.unorderedList": editorCommandDef("format.unorderedList", {
    key: "8",
    mod: true,
    alt: true,
  }),
  "format.taskList": editorCommandDef("format.taskList"),
  "format.increaseListIndent": editorCommandDef("format.increaseListIndent", { key: "Tab" }),
  "format.decreaseListIndent": editorCommandDef("format.decreaseListIndent", {
    key: "Tab",
    shift: true,
  }),
  "format.toggleTaskChecked": editorCommandDef("format.toggleTaskChecked"),
  "format.blockquote": editorCommandDef("format.blockquote", {
    key: "b",
    mod: true,
    shift: true,
  }),
  "format.codeBlock": editorCommandDef("format.codeBlock", { key: "c", mod: true, alt: true }),
  "format.table.delete": editorCommandDef("format.table.delete"),
  "format.table.addRowAbove": editorCommandDef("format.table.addRowAbove"),
  "format.table.addRowBelow": editorCommandDef("format.table.addRowBelow"),
  "format.table.addColumnBefore": editorCommandDef("format.table.addColumnBefore"),
  "format.table.addColumnAfter": editorCommandDef("format.table.addColumnAfter"),
  "format.table.moveRowUp": editorCommandDef("format.table.moveRowUp"),
  "format.table.moveRowDown": editorCommandDef("format.table.moveRowDown"),
  "format.table.moveColumnLeft": editorCommandDef("format.table.moveColumnLeft"),
  "format.table.moveColumnRight": editorCommandDef("format.table.moveColumnRight"),
  "format.table.deleteRow": editorCommandDef("format.table.deleteRow"),
  "format.table.deleteColumn": editorCommandDef("format.table.deleteColumn"),
  "format.clearBlock": editorCommandDef("format.clearBlock"),
  "view.toggleSidebar": commandDef("Toggle sidebar", { key: "e", mod: true, shift: true }),
  "view.zoomIn": commandDef("Zoom in", { key: "=", mod: true }),
  "view.zoomOut": commandDef("Zoom out", { key: "-", mod: true }),
  "view.resetZoom": commandDef("Reset zoom", { key: "0", mod: true }),
  "view.fullscreen": commandDef("Full screen", { key: "F11" }),
  "view.appearance.system": commandDef("System"),
  "view.appearance.light": commandDef("Light"),
  "view.appearance.dark": commandDef("Dark"),
  "view.sort.name": commandDef("Name"),
  "view.sort.modifiedDate": commandDef("Modified date"),
  "view.sort.type": commandDef("Type"),
  "view.collapseAllFolders": commandDef("Collapse all folders"),
  "view.expandAllFolders": commandDef("Expand all folders"),
  "help.about": commandDef("About"),
};

export const COMMAND_MENU_LABELS = {
  file: "File",
  edit: "Edit",
  insert: "Insert",
  format: "Format",
  view: "View",
  help: "Help",
} satisfies Record<CommandMenuId, string>;

export const SHORTCUT_COMMAND_IDS = (Object.keys(COMMAND_DEFINITIONS) as AppCommandId[]).filter(
  (commandId) => COMMAND_DEFINITIONS[commandId].shortcuts?.length,
);

export const formatShortcut = ({ alt, key, mod, shift }: CommandShortcut) =>
  [mod && "Mod", alt && "Alt", shift && "Shift", formatKeyboardKey(key)].filter(isTruthy).join("+");

export const getShortcutSignature = ({ alt, key, mod, shift }: CommandShortcut) =>
  [mod && "mod", alt && "alt", shift && "shift", normalizeKeyboardKey(key)]
    .filter(isTruthy)
    .join("+");

export const matchesShortcut = (event: KeyboardEvent, shortcut: CommandShortcut) =>
  normalizeKeyboardKey(event.key) === normalizeKeyboardKey(shortcut.key) &&
  Boolean(shortcut.mod) === isPrimaryModifierEvent(event) &&
  !hasNonPrimaryModifierEvent(event) &&
  Boolean(shortcut.alt) === event.altKey &&
  Boolean(shortcut.shift) === event.shiftKey;
