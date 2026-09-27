import { isSamePath } from "@/lib/path";

import type { DocumentEncoding } from "./documentEncoding";

export const LINE_ENDINGS = ["crlf", "lf"] as const;
export type LineEnding = (typeof LINE_ENDINGS)[number];

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
  encoding: DocumentEncoding;
  /** The encoding the file holds as last read or written, which `encoding` can be converted back to. */
  fileEncoding: DocumentEncoding;
  metadata: FileMetadataSnapshot;
}

export interface UntitledDocumentState {
  status: "untitled";
  id: string;
  content: string;
  isDirty: boolean;
  lineEnding: LineEnding;
  encoding: DocumentEncoding;
}

export type ActiveDocumentState = SavedDocumentState | UntitledDocumentState;

type SavedDocumentInput = Omit<SavedDocumentState, "status" | "isDirty" | "fileEncoding"> &
  Partial<Pick<SavedDocumentState, "isDirty">>;

type UntitledDocumentInput = Omit<UntitledDocumentState, "status" | "isDirty"> &
  Partial<Pick<UntitledDocumentState, "isDirty">>;

export const toSavedDocument = ({
  isDirty = false,
  ...documentFields
}: SavedDocumentInput): SavedDocumentState => ({
  status: "saved",
  isDirty,
  fileEncoding: documentFields.encoding,
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
