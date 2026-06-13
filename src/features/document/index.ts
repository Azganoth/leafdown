export {
  ensureMarkdownExtension,
  openMarkdownDocument,
  saveMarkdownDocument,
  selectMarkdownFilePath,
  selectMarkdownSavePath,
} from "./services/markdownDocument";
export {
  getActiveDocumentKey,
  toSavedDocument,
  toUntitledDocument,
  type ActiveDocumentState,
  type FileMetadataSnapshot,
  type LineEnding,
  type OpenedMarkdownDocument,
  type SavedDocumentState,
  type SavedMarkdownDocument,
  type UntitledDocumentState,
  type WriteMarkdownDocumentOptions,
} from "./types";
export {
  getOpenMarkdownFileErrorMessage,
  getSaveMarkdownFileErrorMessage,
  isSaveMarkdownFileError,
  showDocumentIoErrorToast,
  type DocumentIoErrorMessage,
  type OpenMarkdownFileError,
  type SaveMarkdownFileError,
} from "./utils/documentIoErrors";
export { formatMarkdownForSave } from "./utils/documentSerialization";
