import { OPEN_WEBVIEW_DEVTOOLS_COMMAND } from "@/commands/actions/help";
import { GET_DIAGNOSTICS_SUMMARY_COMMAND, type DiagnosticsSummary } from "@/features/diagnostics";
import {
  INSPECT_MARKDOWN_FILE_COMMAND,
  OPEN_MARKDOWN_FILE_COMMAND,
  SAVE_MARKDOWN_FILE_COMMAND,
  UNWATCH_MARKDOWN_DOCUMENT_COMMAND,
  WATCH_MARKDOWN_DOCUMENT_COMMAND,
  WRITE_HTML_EXPORT_COMMAND,
  type InspectMarkdownFileArgs,
  type MarkdownFileState,
  type OpenMarkdownFileArgs,
  type OpenMarkdownFileResult,
  type SaveMarkdownFileArgs,
  type SaveMarkdownFileResult,
  type UnwatchMarkdownDocumentArgs,
  type WatchMarkdownDocumentArgs,
  type WriteHtmlExportArgs,
} from "@/features/document/services/markdownDocumentApi";
import {
  FETCH_REMOTE_IMAGE_COMMAND,
  READ_MARKDOWN_IMAGE_COMMAND,
  RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND,
  type FetchRemoteImageArgs,
  type ReadMarkdownImageArgs,
  type ResolveMarkdownImageTargetArgs,
  type ResolveMarkdownImageTargetResult,
} from "@/features/editor/services/markdownImageApi";
import {
  OPEN_MARKDOWN_LINK_TARGET_COMMAND,
  RESOLVE_MARKDOWN_LINK_TARGET_COMMAND,
  RESOLVE_WIKI_LINK_TARGET_COMMAND,
  type OpenMarkdownLinkTargetArgs,
  type ResolveMarkdownLinkTargetArgs,
  type ResolveMarkdownLinkTargetResult,
} from "@/features/editor/services/markdownLinkApi";
import {
  CREATE_ARTICLE_DIRECTORY_COMMAND,
  CREATE_MARKDOWN_ARTICLE_COMMAND,
  OPEN_MARKDOWN_FOLDER_COMMAND,
  RENAME_FOLDER_ENTRY_COMMAND,
  SCAN_MARKDOWN_FOLDER_COMMAND,
  TRASH_FOLDER_ENTRY_COMMAND,
  UNWATCH_MARKDOWN_FOLDER_COMMAND,
  WATCH_MARKDOWN_FOLDER_COMMAND,
  type CreateArticleDirectoryArgs,
  type CreateMarkdownArticleArgs,
  type FolderEntryResult,
  type OpenMarkdownFolderArgs,
  type OpenMarkdownFolderResult,
  type RenameFolderEntryArgs,
  type ScanMarkdownFolderArgs,
  type ScanMarkdownFolderResult,
  type TrashFolderEntryArgs,
  type UnwatchMarkdownFolderArgs,
  type WatchMarkdownFolderArgs,
} from "@/features/folder-context/services/folderContextApi";
import {
  PREFLIGHT_FOLDER_REPLACEMENT_COMMAND,
  READ_FOLDER_SEARCH_FILES_COMMAND,
  WRITE_FOLDER_REPLACEMENT_FILES_COMMAND,
  type FolderReplacementArgs,
  type FolderReplacementOutcome,
  type FolderSearchFileOutcome,
  type ReadFolderSearchFilesArgs,
} from "@/features/folder-search/services/folderSearchApi";

import {
  countInvokeCalls,
  getLastInvokeArgs,
  mockInvokeCommands,
  type InvokeCommandHandler,
} from "./tauri";

interface TauriApiCommandArgs {
  openMarkdownFile: OpenMarkdownFileArgs;
  saveMarkdownFile: SaveMarkdownFileArgs;
  inspectMarkdownFile: InspectMarkdownFileArgs;
  watchMarkdownDocument: WatchMarkdownDocumentArgs;
  unwatchMarkdownDocument: UnwatchMarkdownDocumentArgs;
  scanMarkdownFolder: ScanMarkdownFolderArgs;
  openMarkdownFolder: OpenMarkdownFolderArgs;
  watchMarkdownFolder: WatchMarkdownFolderArgs;
  unwatchMarkdownFolder: UnwatchMarkdownFolderArgs;
  createMarkdownArticle: CreateMarkdownArticleArgs;
  createArticleDirectory: CreateArticleDirectoryArgs;
  renameFolderEntry: RenameFolderEntryArgs;
  trashFolderEntry: TrashFolderEntryArgs;
  resolveMarkdownImageTarget: ResolveMarkdownImageTargetArgs;
  fetchRemoteImage: FetchRemoteImageArgs;
  readMarkdownImage: ReadMarkdownImageArgs;
  writeHtmlExport: WriteHtmlExportArgs;
  resolveMarkdownLinkTarget: ResolveMarkdownLinkTargetArgs;
  resolveWikiLinkTarget: ResolveMarkdownLinkTargetArgs;
  openMarkdownLinkTarget: OpenMarkdownLinkTargetArgs;
  readFolderSearchFiles: ReadFolderSearchFilesArgs;
  preflightFolderReplacement: FolderReplacementArgs;
  writeFolderReplacementFiles: FolderReplacementArgs;
  openWebviewDevtools: undefined;
  getDiagnosticsSummary: undefined;
}

interface TauriApiCommandResults {
  openMarkdownFile: OpenMarkdownFileResult;
  saveMarkdownFile: SaveMarkdownFileResult;
  inspectMarkdownFile: MarkdownFileState;
  watchMarkdownDocument: void;
  unwatchMarkdownDocument: void;
  scanMarkdownFolder: ScanMarkdownFolderResult;
  openMarkdownFolder: OpenMarkdownFolderResult;
  watchMarkdownFolder: void;
  unwatchMarkdownFolder: void;
  createMarkdownArticle: FolderEntryResult;
  createArticleDirectory: FolderEntryResult;
  renameFolderEntry: FolderEntryResult;
  trashFolderEntry: void;
  resolveMarkdownImageTarget: ResolveMarkdownImageTargetResult;
  fetchRemoteImage: ArrayBuffer;
  readMarkdownImage: ArrayBuffer;
  writeHtmlExport: void;
  resolveMarkdownLinkTarget: ResolveMarkdownLinkTargetResult;
  resolveWikiLinkTarget: ResolveMarkdownLinkTargetResult;
  openMarkdownLinkTarget: void;
  readFolderSearchFiles: FolderSearchFileOutcome[];
  preflightFolderReplacement: FolderReplacementOutcome[];
  writeFolderReplacementFiles: FolderReplacementOutcome[];
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
  inspectMarkdownFile: INSPECT_MARKDOWN_FILE_COMMAND,
  watchMarkdownDocument: WATCH_MARKDOWN_DOCUMENT_COMMAND,
  unwatchMarkdownDocument: UNWATCH_MARKDOWN_DOCUMENT_COMMAND,
  scanMarkdownFolder: SCAN_MARKDOWN_FOLDER_COMMAND,
  openMarkdownFolder: OPEN_MARKDOWN_FOLDER_COMMAND,
  watchMarkdownFolder: WATCH_MARKDOWN_FOLDER_COMMAND,
  unwatchMarkdownFolder: UNWATCH_MARKDOWN_FOLDER_COMMAND,
  createMarkdownArticle: CREATE_MARKDOWN_ARTICLE_COMMAND,
  createArticleDirectory: CREATE_ARTICLE_DIRECTORY_COMMAND,
  renameFolderEntry: RENAME_FOLDER_ENTRY_COMMAND,
  trashFolderEntry: TRASH_FOLDER_ENTRY_COMMAND,
  resolveMarkdownImageTarget: RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND,
  fetchRemoteImage: FETCH_REMOTE_IMAGE_COMMAND,
  readMarkdownImage: READ_MARKDOWN_IMAGE_COMMAND,
  writeHtmlExport: WRITE_HTML_EXPORT_COMMAND,
  resolveMarkdownLinkTarget: RESOLVE_MARKDOWN_LINK_TARGET_COMMAND,
  resolveWikiLinkTarget: RESOLVE_WIKI_LINK_TARGET_COMMAND,
  openMarkdownLinkTarget: OPEN_MARKDOWN_LINK_TARGET_COMMAND,
  readFolderSearchFiles: READ_FOLDER_SEARCH_FILES_COMMAND,
  preflightFolderReplacement: PREFLIGHT_FOLDER_REPLACEMENT_COMMAND,
  writeFolderReplacementFiles: WRITE_FOLDER_REPLACEMENT_FILES_COMMAND,
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
