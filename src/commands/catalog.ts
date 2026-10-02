import type { MessageId } from "@/lib/i18n";

import type { AppCommandId } from "./dispatch";
import { COMMAND_DEFINITIONS, getCommandMenuLabelId, type CommandMenuId } from "./metadata";

export const PALETTE_COMMAND_IDS = Object.keys(COMMAND_DEFINITIONS) as AppCommandId[];

export const getCommandMenuPathIds = (commandId: AppCommandId): MessageId[] => {
  const menuId = commandId.split(".")[0] as CommandMenuId;
  const path: MessageId[] = [getCommandMenuLabelId(menuId)];

  if (commandId === "file.clearRecentItems") {
    path.push("menu.file.openRecent");
  } else if (commandId.startsWith("edit.copyAs")) {
    path.push("menu.edit.copyAs");
  } else if (commandId.startsWith("edit.pasteAs")) {
    path.push("menu.edit.pasteAs");
  } else if (commandId.startsWith("edit.delete")) {
    path.push("menu.edit.delete");
  } else if (commandId === "edit.selectAll" || commandId === "edit.selectWord") {
    path.push("menu.edit.select");
  } else if (commandId.startsWith("edit.jump")) {
    path.push("menu.edit.jump");
  } else if (commandId.startsWith("edit.lineEnding") || commandId === "edit.insertFinalNewline") {
    path.push("menu.edit.lineEnding");
  } else if (commandId.startsWith("edit.encoding")) {
    path.push("menu.edit.encoding", "menu.edit.saveWithEncoding");
  } else if (
    ["edit.find", "edit.findNext", "edit.findPrevious", "edit.replace"].includes(commandId)
  ) {
    path.push("menu.edit.findAndReplace");
  } else if (commandId.startsWith("insert.heading") || commandId.startsWith("format.heading")) {
    path.push("menu.heading");
  } else if (commandId.startsWith("format.table")) {
    path.push("menu.format.table");
  } else if (commandId.startsWith("view.appearance")) {
    path.push("menu.view.appearance");
  } else if (commandId.startsWith("view.sort")) {
    path.push("menu.view.sortArticlesBy");
  }

  return path;
};
