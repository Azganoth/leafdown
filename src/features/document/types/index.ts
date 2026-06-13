export type LineEnding = "crlf" | "lf";

export interface FileMetadataSnapshot {
  sizeBytes: number;
  modifiedAtUnixMs: number;
}

export interface SavedDocumentState {
  status: "saved";
  path: string;
  content: string;
  isDirty: boolean;
  lineEnding: LineEnding | null;
  metadata: FileMetadataSnapshot;
}

export interface UntitledDocumentState {
  status: "untitled";
  id: string;
  content: string;
  isDirty: boolean;
  lineEnding: LineEnding;
}

export type ActiveDocumentState = SavedDocumentState | UntitledDocumentState;

export interface OpenedMarkdownDocument {
  path: string;
  parentFolderPath: string;
  content: string;
  lineEnding: LineEnding | null;
  metadata: FileMetadataSnapshot;
}

export interface SavedMarkdownDocument {
  path: string;
  parentFolderPath: string;
  metadata: FileMetadataSnapshot;
}

export interface WriteMarkdownDocumentOptions {
  expectedMetadata?: FileMetadataSnapshot | null;
  overwrite?: boolean;
}

export const toSavedDocument = (
  document: Omit<SavedDocumentState, "status" | "isDirty"> &
    Partial<Pick<SavedDocumentState, "isDirty">>,
): SavedDocumentState => ({
  status: "saved",
  isDirty: false,
  ...document,
});

export const toUntitledDocument = (
  document: Omit<UntitledDocumentState, "status" | "isDirty"> &
    Partial<Pick<UntitledDocumentState, "isDirty">>,
): UntitledDocumentState => ({
  status: "untitled",
  isDirty: false,
  ...document,
});

export const getActiveDocumentKey = (document: ActiveDocumentState) =>
  document.status === "saved" ? document.path : document.id;
