import type { TextEncodingName } from "@/features/document";

/** Why a file planned for replacement was left as it was. */
export type FolderReplaceStaleReason = "changedOnDisk" | "missing" | "changedInEditor";

export type FolderReplaceFailureReason =
  | "notArticle"
  | "unrepresentableCharacters"
  | "permissionDenied"
  | "readFailed"
  | "writeFailed"
  /** The write was sent but no outcome came back, so whether it happened is unknown. */
  | "interrupted";

export interface FolderReplaceStaleFile {
  path: string;
  reason: FolderReplaceStaleReason;
  /** The open document took the replacement in its editor, but it was not saved. */
  unsavedInEditor: boolean;
}

export interface FolderReplaceFailedFile {
  path: string;
  reason: FolderReplaceFailureReason;
  unsavedInEditor: boolean;
  encoding?: TextEncodingName;
  /** Operating-system text or the characters an encoding cannot hold, shown as source data. */
  detail?: string;
}

/** What one Apply did to each file it planned, in the order it went through them. */
export interface FolderReplaceReport {
  written: { path: string; matchCount: number }[];
  stale: FolderReplaceStaleFile[];
  failed: FolderReplaceFailedFile[];
  /** Files the Apply never reached because it stopped. */
  notAttempted: string[];
}

export type FolderReplaceApplyState =
  | { status: "idle" }
  | { status: "applying"; phase: "checking" | "writing"; completed: number; total: number }
  | { status: "done"; report: FolderReplaceReport };
