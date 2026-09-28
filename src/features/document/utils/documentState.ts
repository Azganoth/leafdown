import { isSamePath } from "@/lib/path";

import type { DocumentEncoding } from "./documentEncoding";

export const LINE_ENDINGS = ["crlf", "lf"] as const;
export type LineEnding = (typeof LINE_ENDINGS)[number];

export interface FileMetadataSnapshot {
  sizeBytes: number;
  modifiedAtUnixMs: number;
}

/** A version of the file on disk that the editor has not loaded. */
export type ExternalFileChange =
  | { kind: "missing" }
  | { kind: "modified"; metadata: FileMetadataSnapshot; fingerprint: string };

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
  /** Names the bytes last read or written, so a metadata-only change can be told from a new version. */
  fingerprint: string;
  externalChange: ExternalFileChange | null;
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

type SavedDocumentInput = Omit<
  SavedDocumentState,
  "status" | "isDirty" | "fileEncoding" | "externalChange"
> &
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
  externalChange: null,
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
