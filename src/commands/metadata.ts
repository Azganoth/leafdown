import {
  formatKeyboardKey,
  hasNonPrimaryModifierEvent,
  isPrimaryModifierEvent,
  normalizeKeyboardKey,
} from "@/lib/input";
import { isTruthy } from "@/lib/predicates";

import { APPLICATION_COMMAND_IDS } from "./application";
import type { AppCommandId } from "./dispatch";

export type CommandMenuId = "file" | "edit" | "insert" | "format" | "view" | "help";

export interface CommandShortcut {
  key: string;
  alt?: boolean;
  mod?: boolean;
  shift?: boolean;
}

export interface CommandDefinition {
  shortcuts?: CommandShortcut[];
}

const commandDef = (...shortcuts: CommandShortcut[]): CommandDefinition =>
  shortcuts.length > 0 ? { shortcuts } : {};

export const getCommandLabelId = (commandId: AppCommandId) => `command.${commandId}` as const;

export const getCommandMenuLabelId = (menuId: CommandMenuId) => `menu.${menuId}` as const;

export const COMMAND_DEFINITIONS: Record<AppCommandId, CommandDefinition> = {
  "file.new": commandDef({ key: "n", mod: true }),
  "file.open": commandDef({ key: "o", mod: true }),
  "file.openFolder": commandDef({ key: "o", mod: true, shift: true }),
  "file.clearRecentItems": commandDef(),
  "file.save": commandDef({ key: "s", mod: true }),
  "file.saveAs": commandDef({ key: "s", mod: true, shift: true }),
  "file.openLocation": commandDef(),
  "file.revealInSidebar": commandDef(),
  "file.preferences": commandDef({ key: ",", mod: true }),
  "file.closeDocument": commandDef({ key: "w", mod: true }),
  "file.closeFolder": commandDef(),
  "file.closeWindow": commandDef({ key: "q", mod: true }, { key: "F4", alt: true }),
  "edit.undo": commandDef({ key: "z", mod: true }),
  "edit.redo": commandDef({ key: "y", mod: true }, { key: "z", mod: true, shift: true }),
  "edit.cut": commandDef({ key: "x", mod: true }),
  "edit.copy": commandDef({ key: "c", mod: true }),
  "edit.copyAsPlainText": commandDef(),
  "edit.copyAsMarkdown": commandDef(),
  "edit.copyAsHtml": commandDef(),
  "edit.copyAsRichText": commandDef(),
  "edit.paste": commandDef({ key: "v", mod: true }),
  "edit.pasteAsPlainText": commandDef({
    key: "v",
    mod: true,
    shift: true,
  }),
  "edit.pasteAsMarkdown": commandDef(),
  "edit.pasteAsRichText": commandDef(),
  "edit.delete": commandDef({ key: "Delete" }),
  "edit.moveBlockUp": commandDef({ key: "ArrowUp", alt: true }),
  "edit.moveBlockDown": commandDef({ key: "ArrowDown", alt: true }),
  "edit.deleteWordBackward": commandDef({
    key: "Backspace",
    mod: true,
  }),
  "edit.deleteWordForward": commandDef({
    key: "Delete",
    mod: true,
  }),
  "edit.selectAll": commandDef({ key: "a", mod: true }),
  "edit.selectWord": commandDef(),
  "edit.jumpToTop": commandDef({ key: "Home", mod: true }),
  "edit.jumpToBottom": commandDef({ key: "End", mod: true }),
  "edit.jumpToSelection": commandDef(),
  "edit.jumpToLineStart": commandDef({ key: "Home" }),
  "edit.jumpToLineEnd": commandDef({ key: "End" }),
  "edit.jumpToFootnoteDefinition": commandDef(),
  "edit.renameFootnote": commandDef(),
  "edit.lineEnding.crlf": commandDef(),
  "edit.lineEnding.lf": commandDef(),
  "edit.insertFinalNewline": commandDef(),
  "insert.paragraph": commandDef(),
  "insert.heading1": commandDef(),
  "insert.heading2": commandDef(),
  "insert.heading3": commandDef(),
  "insert.heading4": commandDef(),
  "insert.heading5": commandDef(),
  "insert.heading6": commandDef(),
  "insert.link": commandDef({ key: "k", mod: true }),
  "insert.footnote": commandDef(),
  "insert.image": commandDef(),
  "insert.orderedList": commandDef(),
  "insert.unorderedList": commandDef(),
  "insert.taskList": commandDef(),
  "insert.blockquote": commandDef(),
  "insert.codeBlock": commandDef(),
  "insert.table": commandDef(),
  "insert.horizontalRule": commandDef(),
  "format.strong": commandDef({ key: "b", mod: true }),
  "format.emphasis": commandDef({ key: "i", mod: true }),
  "format.strikethrough": commandDef({
    key: "x",
    mod: true,
    alt: true,
  }),
  "format.inlineCode": commandDef({ key: "e", mod: true }),
  "format.clearInline": commandDef({ key: "\\", mod: true }),
  "format.paragraph": commandDef({
    key: "0",
    mod: true,
    alt: true,
  }),
  "format.heading1": commandDef({ key: "1", mod: true, alt: true }),
  "format.heading2": commandDef({ key: "2", mod: true, alt: true }),
  "format.heading3": commandDef({ key: "3", mod: true, alt: true }),
  "format.heading4": commandDef({ key: "4", mod: true, alt: true }),
  "format.heading5": commandDef({ key: "5", mod: true, alt: true }),
  "format.heading6": commandDef({ key: "6", mod: true, alt: true }),
  "format.increaseHeading": commandDef(),
  "format.decreaseHeading": commandDef(),
  "format.orderedList": commandDef({
    key: "7",
    mod: true,
    alt: true,
  }),
  "format.unorderedList": commandDef({
    key: "8",
    mod: true,
    alt: true,
  }),
  "format.taskList": commandDef({
    key: "9",
    mod: true,
    alt: true,
  }),
  "format.increaseListIndent": commandDef({ key: "Tab" }),
  "format.decreaseListIndent": commandDef({
    key: "Tab",
    shift: true,
  }),
  "format.toggleTaskChecked": commandDef({
    key: "Enter",
    mod: true,
  }),
  "format.blockquote": commandDef({
    key: "b",
    mod: true,
    shift: true,
  }),
  "format.codeBlock": commandDef({ key: "c", mod: true, alt: true }),
  "format.table.delete": commandDef(),
  "format.table.addRowAbove": commandDef(),
  "format.table.addRowBelow": commandDef(),
  "format.table.addColumnBefore": commandDef(),
  "format.table.addColumnAfter": commandDef(),
  "format.table.moveRowUp": commandDef(),
  "format.table.moveRowDown": commandDef(),
  "format.table.moveColumnLeft": commandDef(),
  "format.table.moveColumnRight": commandDef(),
  "format.table.deleteRow": commandDef(),
  "format.table.deleteColumn": commandDef(),
  "format.clearBlock": commandDef(),
  "view.toggleSidebar": commandDef({ key: "e", mod: true, shift: true }),
  "view.toggleStatusBar": commandDef(),
  "view.zoomIn": commandDef({ key: "=", mod: true }),
  "view.zoomOut": commandDef({ key: "-", mod: true }),
  "view.resetZoom": commandDef({ key: "0", mod: true }),
  "view.fullscreen": commandDef({ key: "F11" }),
  "view.appearance.system": commandDef(),
  "view.appearance.light": commandDef(),
  "view.appearance.dark": commandDef(),
  "view.sort.name": commandDef(),
  "view.sort.modifiedDate": commandDef(),
  "view.sort.type": commandDef(),
  "view.collapseAllFolders": commandDef(),
  "view.expandAllFolders": commandDef(),
  "help.openDevTools": commandDef(),
  "help.reportIssue": commandDef(),
  "help.requestFeature": commandDef(),
  "help.diagnostics": commandDef(),
  "help.about": commandDef(),
};

export const APPLICATION_SHORTCUT_COMMAND_IDS = APPLICATION_COMMAND_IDS.filter(
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
