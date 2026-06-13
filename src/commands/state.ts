import type { ActiveDocumentState } from "@/features/document";
import { inactiveEditorCommandState, isEditorCommandId } from "@/features/editor";
import type { ArticleSortOrder } from "@/features/folder-context";

import type { AppCommandId, CommandStateContext, ResolvedCommandState } from "./types";

export { inactiveEditorCommandState };

const selectionCommandIds = new Set<AppCommandId>([
  "edit.cut",
  "edit.copy",
  "edit.copyAsPlainText",
  "edit.copyAsMarkdown",
  "edit.jumpToSelection",
]);

const tableCommandIds = new Set<AppCommandId>([
  "format.table.delete",
  "format.table.addRowAbove",
  "format.table.addRowBelow",
  "format.table.addColumnBefore",
  "format.table.addColumnAfter",
  "format.table.moveRowUp",
  "format.table.moveRowDown",
  "format.table.moveColumnLeft",
  "format.table.moveColumnRight",
  "format.table.deleteRow",
  "format.table.deleteColumn",
]);

const documentOnly = (activeDocument: ActiveDocumentState | null) =>
  activeDocument ? enabled() : disabled("No document is open.");

const enabled = (state: Omit<ResolvedCommandState, "enabled"> = {}): ResolvedCommandState => ({
  enabled: true,
  ...state,
});

const disabled = (
  disabledReason: string,
  state: Omit<ResolvedCommandState, "enabled" | "disabledReason"> = {},
): ResolvedCommandState => ({
  disabledReason,
  enabled: false,
  ...state,
});

const activeDocumentLineEnding = (activeDocument: ActiveDocumentState | null) =>
  activeDocument?.lineEnding ?? null;

export const getCommandState = (
  commandId: AppCommandId,
  context: CommandStateContext,
): ResolvedCommandState => {
  const { activeDocument, editor, folderContext, fullscreen, history, navigator, settings } =
    context;

  if (isEditorCommandId(commandId)) {
    if (!activeDocument) {
      return disabled("No document is open.");
    }

    if (selectionCommandIds.has(commandId) && !editor.hasSelection) {
      return disabled("No selection is active.");
    }

    if (tableCommandIds.has(commandId) && !editor.hasTableSelection) {
      return disabled("The caret is not inside a table.");
    }

    return editor.enabledCommands[commandId]
      ? enabled()
      : disabled("The editor command is not available.");
  }

  switch (commandId) {
    case "file.new":
    case "file.open":
    case "file.openFolder":
    case "file.preferences":
    case "file.closeWindow":
    case "view.zoomIn":
    case "view.zoomOut":
    case "view.resetZoom":
    case "help.about":
      return enabled();

    case "file.clearRecentItems":
      return history.recentFiles.length > 0 || history.recentFolders.length > 0
        ? enabled()
        : disabled("No recent items are available.");

    case "file.save":
      if (!activeDocument) {
        return disabled("No document is open.");
      }

      return activeDocument.status === "saved" && !activeDocument.isDirty
        ? disabled("The saved document is clean.")
        : enabled();

    case "file.saveAs":
    case "file.closeDocument":
      return documentOnly(activeDocument);

    case "file.openLocation":
      return activeDocument?.status === "saved"
        ? enabled()
        : disabled("The active document has no file path.");

    case "file.revealInSidebar":
      return navigator.canRevealActiveArticle
        ? enabled()
        : disabled("The active file is not available in the current sidebar.");

    case "edit.lineEnding.crlf":
      return activeDocument
        ? enabled({ checked: activeDocumentLineEnding(activeDocument) === "crlf" })
        : disabled("No document is open.");

    case "edit.lineEnding.lf":
      return activeDocument
        ? enabled({ checked: activeDocumentLineEnding(activeDocument) === "lf" })
        : disabled("No document is open.");

    case "edit.insertFinalNewline":
      return enabled({ checked: settings.insertFinalNewline });

    case "view.toggleSidebar":
      return enabled({ checked: settings.sidebarVisible });

    case "view.fullscreen":
      return enabled({ checked: fullscreen });

    case "view.appearance.system":
      return enabled({ checked: settings.theme === "system" });

    case "view.appearance.light":
      return enabled({ checked: settings.theme === "light" });

    case "view.appearance.dark":
      return enabled({ checked: settings.theme === "dark" });

    case "view.sort.name":
      return getSortCommandState("name", context);

    case "view.sort.modifiedDate":
      return getSortCommandState("modifiedDate", context);

    case "view.sort.type":
      return getSortCommandState("type", context);

    case "view.collapseAllFolders":
    case "view.expandAllFolders":
      return folderContext ? enabled() : disabled("No folder context is open.");
  }

  return disabled("The command is not available.");
};

const getSortCommandState = (
  sortOrder: ArticleSortOrder,
  { folderContext, navigator, settings }: CommandStateContext,
) => {
  const checked = settings.articleSortOrder === sortOrder;

  if (!folderContext) {
    return disabled("No folder context is open.", { checked });
  }

  return navigator.pendingSortOrder
    ? disabled("The article navigator is refreshing.", { checked })
    : enabled({ checked });
};
