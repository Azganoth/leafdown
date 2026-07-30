export {
  ensureMarkdownExtension,
  MARKDOWN_FILE_EXTENSIONS,
  openMarkdownDocument,
  saveMarkdownDocument,
  selectMarkdownFilePath,
  selectMarkdownSavePath,
  type MarkdownFileExtension,
  type OpenedMarkdownDocument,
  type SavedMarkdownDocument,
  type WriteMarkdownDocumentOptions,
} from "./services/markdownDocument";
export {
  getOpenMarkdownFileErrorMessage,
  getSaveMarkdownFileErrorMessage,
  isOpenMarkdownFileError,
  isSaveMarkdownFileError,
  type OpenMarkdownFileError,
  type SaveMarkdownFileError,
} from "./utils/documentErrors";
export { formatMarkdownForSave } from "./utils/documentSerialization";
export {
  getActiveDocumentKey,
  LINE_ENDINGS,
  matchesActiveDocumentKey,
  toSavedDocument,
  toUntitledDocument,
  type ActiveDocumentState,
  type FileMetadataSnapshot,
  type LineEnding,
  type SavedDocumentState,
  type UntitledDocumentState,
} from "./utils/documentState";
