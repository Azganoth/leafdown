export { FolderSearchPanel, type FolderSearchPanelProps } from "./components/folder-search-panel";
export {
  FOLDER_SEARCH_MATCH_LIMIT,
  FolderSearchEngine,
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
