import { OPEN_WEBVIEW_DEVTOOLS_COMMAND } from "@/commands/actions/help";
import { GET_DIAGNOSTICS_SUMMARY_COMMAND, type DiagnosticsSummary } from "@/features/diagnostics";
import {
  OPEN_MARKDOWN_FILE_COMMAND,
  SAVE_MARKDOWN_FILE_COMMAND,
  type OpenMarkdownFileArgs,
  type OpenMarkdownFileResult,
  type SaveMarkdownFileArgs,
  type SaveMarkdownFileResult,
} from "@/features/document/services/markdownDocumentApi";
import {
  RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND,
  type ResolveMarkdownImageTargetArgs,
  type ResolveMarkdownImageTargetResult,
} from "@/features/editor/services/markdownImageApi";
import {
  RESOLVE_MARKDOWN_LINK_TARGET_COMMAND,
  type ResolveMarkdownLinkTargetArgs,
  type ResolveMarkdownLinkTargetResult,
} from "@/features/editor/services/markdownLinkApi";
import {
  OPEN_MARKDOWN_FOLDER_COMMAND,
  SCAN_MARKDOWN_FOLDER_COMMAND,
  UNWATCH_MARKDOWN_FOLDER_COMMAND,
  WATCH_MARKDOWN_FOLDER_COMMAND,
  type OpenMarkdownFolderArgs,
  type OpenMarkdownFolderResult,
  type ScanMarkdownFolderArgs,
  type ScanMarkdownFolderResult,
  type UnwatchMarkdownFolderArgs,
  type WatchMarkdownFolderArgs,
} from "@/features/folder-context/services/folderContextApi";

import {
  countInvokeCalls,
  getLastInvokeArgs,
  mockInvokeCommands,
  type InvokeCommandHandler,
} from "./tauri";

interface TauriApiCommandArgs {
  openMarkdownFile: OpenMarkdownFileArgs;
  saveMarkdownFile: SaveMarkdownFileArgs;
  scanMarkdownFolder: ScanMarkdownFolderArgs;
  openMarkdownFolder: OpenMarkdownFolderArgs;
  watchMarkdownFolder: WatchMarkdownFolderArgs;
  unwatchMarkdownFolder: UnwatchMarkdownFolderArgs;
  resolveMarkdownImageTarget: ResolveMarkdownImageTargetArgs;
  resolveMarkdownLinkTarget: ResolveMarkdownLinkTargetArgs;
  openWebviewDevtools: undefined;
  getDiagnosticsSummary: undefined;
}

interface TauriApiCommandResults {
  openMarkdownFile: OpenMarkdownFileResult;
  saveMarkdownFile: SaveMarkdownFileResult;
  scanMarkdownFolder: ScanMarkdownFolderResult;
  openMarkdownFolder: OpenMarkdownFolderResult;
  watchMarkdownFolder: void;
  unwatchMarkdownFolder: void;
  resolveMarkdownImageTarget: ResolveMarkdownImageTargetResult;
  resolveMarkdownLinkTarget: ResolveMarkdownLinkTargetResult;
  openWebviewDevtools: void;
  getDiagnosticsSummary: DiagnosticsSummary;
}

type TauriApiCommandName = keyof TauriApiCommandArgs;

type TauriApiCommandHandler<TCommand extends TauriApiCommandName> = (
  args: TauriApiCommandArgs[TCommand],
) => TauriApiCommandResults[TCommand] | Promise<TauriApiCommandResults[TCommand]>;

type TauriApiCommandHandlers = Partial<{
  [TCommand in TauriApiCommandName]: TauriApiCommandHandler<TCommand>;
}>;

const TAURI_API_COMMANDS = {
  openMarkdownFile: OPEN_MARKDOWN_FILE_COMMAND,
  saveMarkdownFile: SAVE_MARKDOWN_FILE_COMMAND,
  scanMarkdownFolder: SCAN_MARKDOWN_FOLDER_COMMAND,
  openMarkdownFolder: OPEN_MARKDOWN_FOLDER_COMMAND,
  watchMarkdownFolder: WATCH_MARKDOWN_FOLDER_COMMAND,
  unwatchMarkdownFolder: UNWATCH_MARKDOWN_FOLDER_COMMAND,
  resolveMarkdownImageTarget: RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND,
  resolveMarkdownLinkTarget: RESOLVE_MARKDOWN_LINK_TARGET_COMMAND,
  openWebviewDevtools: OPEN_WEBVIEW_DEVTOOLS_COMMAND,
  getDiagnosticsSummary: GET_DIAGNOSTICS_SUMMARY_COMMAND,
} satisfies Record<TauriApiCommandName, string>;

export const mockTauriApi = (handlers: TauriApiCommandHandlers) => {
  const invokeHandlers = Object.fromEntries(
    Object.entries(handlers).map(([commandName, handler]) => [
      TAURI_API_COMMANDS[commandName as TauriApiCommandName],
      handler,
    ]),
  ) as Record<string, InvokeCommandHandler>;

  mockInvokeCommands(invokeHandlers);
};

export const tauriApiCommand = (commandName: TauriApiCommandName) =>
  TAURI_API_COMMANDS[commandName];

export const mockTauriApiCommand = <TCommand extends TauriApiCommandName>(
  commandName: TCommand,
  handler: TauriApiCommandHandler<TCommand>,
) => {
  mockInvokeCommands({
    [tauriApiCommand(commandName)]: handler as InvokeCommandHandler,
  });
};

export const countTauriApiCalls = (commandName: TauriApiCommandName) =>
  countInvokeCalls(TAURI_API_COMMANDS[commandName]);

export const getLastTauriApiArgs = <TCommand extends TauriApiCommandName>(commandName: TCommand) =>
  getLastInvokeArgs<TauriApiCommandArgs[TCommand]>(TAURI_API_COMMANDS[commandName]);
