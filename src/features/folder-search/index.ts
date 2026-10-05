export { FolderSearchPanel, type FolderSearchPanelProps } from "./components/folder-search-panel";
export type {
  FolderReplaceApplyState,
  FolderReplaceFailedFile,
  FolderReplaceReport,
  FolderReplaceStaleFile,
} from "./services/folderReplaceReport";
export {
  preflightFolderReplacement,
  writeFolderReplacementFiles,
  type FolderReplacementArgs,
  type FolderReplacementFile,
  type FolderReplacementOutcome,
} from "./services/folderSearchApi";
export {
  FOLDER_SEARCH_MATCH_LIMIT,
  FolderSearchEngine,
  hasCompleteReplacementPlan,
  type FolderReplaceFilePlan,
  type FolderSearchActiveDocument,
  type FolderSearchFileResult,
  type FolderSearchMatch,
  type FolderSearchRequest,
  type FolderSearchResults,
  type FolderSearchSkippedFile,
  type FolderSearchStatus,
} from "./services/folderSearchEngine";
export { FolderSearchTextCache } from "./services/folderSearchTextCache";
export {
  useFolderSearchStore,
  type FolderSearchMatchKey,
  type FolderSearchState,
} from "./stores/folderSearch";
