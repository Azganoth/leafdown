import { unwatchMarkdownFolder, watchMarkdownFolder } from "./folderContextApi";

export {
  FOLDER_CONTEXT_CHANGED_EVENT,
  FOLDER_CONTEXT_WATCH_ERROR_EVENT,
  type FolderContextChangedEventPayload,
  type FolderContextWatchErrorEventPayload,
} from "./folderContextApi";

export const watchFolderContext = (
  path: string,
  ignoredDirectories: string[],
  scopeId: string,
  scopeGeneration: number,
) =>
  watchMarkdownFolder({
    path,
    ignoredDirectories,
    scopeId,
    scopeGeneration,
  });

export const unwatchFolderContext = (scopeId: string, scopeGeneration: number) =>
  unwatchMarkdownFolder({
    scopeId,
    scopeGeneration,
  });
