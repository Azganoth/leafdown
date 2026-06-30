import type {
  FileMetadataSnapshot,
  OpenedMarkdownDocument,
  SavedDocumentState,
  SavedMarkdownDocument,
  UntitledDocumentState,
} from "@/features/document";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";

export const TEST_UNTITLED_DOCUMENT_ID = "untitled:test";

const TEST_FILE_MODIFIED_AT_UNIX_MS = 1_773_916_800_000;

type FileMetadataFactoryOptions = Partial<FileMetadataSnapshot>;

type SavedDocumentFactoryOptions = Partial<Omit<SavedDocumentState, "metadata" | "status">> & {
  metadata?: FileMetadataFactoryOptions;
};

type UntitledDocumentFactoryOptions = Partial<Omit<UntitledDocumentState, "status">>;

type OpenedMarkdownDocumentFactoryOptions = Partial<Omit<OpenedMarkdownDocument, "metadata">> & {
  metadata?: FileMetadataFactoryOptions;
};

type SavedMarkdownDocumentResultFactoryOptions = Partial<
  Omit<SavedMarkdownDocument, "metadata">
> & {
  metadata?: FileMetadataFactoryOptions;
};

const getContentSizeBytes = (content: string) => new TextEncoder().encode(content).byteLength;

export const createFileMetadata = (
  overrides: FileMetadataFactoryOptions = {},
): FileMetadataSnapshot => ({
  sizeBytes: 7,
  modifiedAtUnixMs: TEST_FILE_MODIFIED_AT_UNIX_MS,
  ...overrides,
});

export const createSavedDocument = (
  overrides: SavedDocumentFactoryOptions = {},
): SavedDocumentState => {
  const { content = "# Notes", metadata, ...documentOverrides } = overrides;

  return {
    status: "saved",
    path: TEST_MARKDOWN_FILE_PATH,
    content,
    isDirty: false,
    lineEnding: "lf",
    ...documentOverrides,
    metadata: createFileMetadata({
      sizeBytes: getContentSizeBytes(content),
      ...metadata,
    }),
  };
};

export const createUntitledDocument = (
  overrides: UntitledDocumentFactoryOptions = {},
): UntitledDocumentState => ({
  status: "untitled",
  id: TEST_UNTITLED_DOCUMENT_ID,
  content: "Draft",
  isDirty: false,
  lineEnding: "lf",
  ...overrides,
});

export const createOpenedMarkdownDocument = (
  overrides: OpenedMarkdownDocumentFactoryOptions = {},
): OpenedMarkdownDocument => {
  const { content = "# Notes", metadata, ...documentOverrides } = overrides;

  return {
    path: TEST_MARKDOWN_FILE_PATH,
    parentFolderPath: TEST_NOTES_FOLDER_PATH,
    content,
    lineEnding: "lf",
    ...documentOverrides,
    metadata: createFileMetadata({
      sizeBytes: getContentSizeBytes(content),
      ...metadata,
    }),
  };
};

export const createSavedMarkdownDocumentResult = (
  overrides: SavedMarkdownDocumentResultFactoryOptions = {},
): SavedMarkdownDocument => {
  const { metadata, ...documentOverrides } = overrides;

  return {
    path: TEST_MARKDOWN_FILE_PATH,
    parentFolderPath: TEST_NOTES_FOLDER_PATH,
    ...documentOverrides,
    metadata: createFileMetadata(metadata),
  };
};
