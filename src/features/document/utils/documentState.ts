import { isSamePath } from "@/lib/path";

/* NOTE: src-tauri/src/document.rs (LineEnding). */
export type LineEnding = "crlf" | "lf";

/* NOTE: src-tauri/src/document.rs (FileMetadataSnapshot). */
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

type SavedDocumentInput = Omit<SavedDocumentState, "status" | "isDirty"> &
  Partial<Pick<SavedDocumentState, "isDirty">>;

type UntitledDocumentInput = Omit<UntitledDocumentState, "status" | "isDirty"> &
  Partial<Pick<UntitledDocumentState, "isDirty">>;

export const toSavedDocument = ({
  isDirty = false,
  ...documentFields
}: SavedDocumentInput): SavedDocumentState => ({
  status: "saved",
  isDirty,
  ...documentFields,
});

export const toUntitledDocument = ({
  isDirty = false,
  ...documentFields
}: UntitledDocumentInput): UntitledDocumentState => ({
  status: "untitled",
  isDirty,
  ...documentFields,
});

export const getActiveDocumentKey = (document: ActiveDocumentState) =>
  document.status === "saved" ? document.path : document.id;

export const matchesActiveDocumentKey = (document: ActiveDocumentState, documentKey: string) =>
  document.status === "saved"
    ? isSamePath(document.path, documentKey)
    : document.id === documentKey;
