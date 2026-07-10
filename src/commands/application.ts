import * as edit from "./actions/edit";
import * as file from "./actions/file";
import * as help from "./actions/help";
import * as view from "./actions/view";
import type { AppCommandContext } from "./context";
import { enabled, type CommandState } from "./statePrimitives";

type AppCommandHandler = (context: AppCommandContext) => void | Promise<void>;
type AppCommandStateGetter = (context: AppCommandContext) => CommandState;

interface AppCommand {
  getState: AppCommandStateGetter;
  run: AppCommandHandler;
}

const alwaysEnabled = () => enabled();

const appCommand = (
  run: AppCommandHandler,
  getState: AppCommandStateGetter = alwaysEnabled,
): AppCommand => ({ getState, run });

export const APPLICATION_COMMANDS = {
  "file.new": appCommand(file.createNewFile),
  "file.open": appCommand(file.openFile),
  "file.openFolder": appCommand(file.openFolder),
  "file.clearRecentItems": appCommand(file.clearRecentItems, file.getClearRecentItemsState),
  "file.save": appCommand(file.saveDocument, file.getSaveDocumentState),
  "file.saveAs": appCommand(file.saveDocumentAs, file.getSaveDocumentAsState),
  "file.openLocation": appCommand(file.openLocation, file.getOpenLocationState),
  "file.revealInSidebar": appCommand(file.revealInSidebar, file.getRevealInSidebarState),
  "file.preferences": appCommand(file.openPreferences),
  "file.closeDocument": appCommand(file.closeDocument, file.getCloseDocumentState),
  "file.closeFolder": appCommand(file.closeFolder, file.getCloseFolderState),
  "file.closeWindow": appCommand(file.closeWindow),

  "edit.lineEnding.crlf": appCommand(edit.setCrlfLineEnding, edit.getCrlfLineEndingState),
  "edit.lineEnding.lf": appCommand(edit.setLfLineEnding, edit.getLfLineEndingState),
  "edit.insertFinalNewline": appCommand(edit.toggleFinalNewline, edit.getFinalNewlineState),

  "view.toggleSidebar": appCommand(view.toggleSidebar, view.getToggleSidebarState),
  "view.zoomIn": appCommand(view.zoomIn, view.getZoomInState),
  "view.zoomOut": appCommand(view.zoomOut, view.getZoomOutState),
  "view.resetZoom": appCommand(view.resetZoom, view.getResetZoomState),
  "view.fullscreen": appCommand(view.toggleFullscreen, view.getFullscreenState),
  "view.appearance.system": appCommand(view.setSystemTheme, view.getSystemThemeState),
  "view.appearance.light": appCommand(view.setLightTheme, view.getLightThemeState),
  "view.appearance.dark": appCommand(view.setDarkTheme, view.getDarkThemeState),
  "view.sort.name": appCommand(view.sortByName, view.getSortByNameState),
  "view.sort.modifiedDate": appCommand(view.sortByModifiedDate, view.getSortByModifiedDateState),
  "view.sort.type": appCommand(view.sortByType, view.getSortByTypeState),
  "view.collapseAllFolders": appCommand(view.collapseAllFolders, view.getCollapseAllFoldersState),
  "view.expandAllFolders": appCommand(view.expandAllFolders, view.getExpandAllFoldersState),

  "help.openDevTools": appCommand(help.openDevTools),
  "help.diagnostics": appCommand(help.openDiagnostics),
  "help.about": appCommand(help.openAbout),
} satisfies Record<string, AppCommand>;

export type ApplicationCommandId = keyof typeof APPLICATION_COMMANDS & string;

export const APPLICATION_COMMAND_IDS = Object.keys(APPLICATION_COMMANDS) as ApplicationCommandId[];

export const isApplicationCommandId = (value: string): value is ApplicationCommandId =>
  Object.hasOwn(APPLICATION_COMMANDS, value);

export const runApplicationCommand = (
  context: AppCommandContext,
  commandId: ApplicationCommandId,
) => APPLICATION_COMMANDS[commandId].run(context);
