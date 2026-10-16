import { invoke } from "@tauri-apps/api/core";

export const REPORT_WINDOW_SESSION_COMMAND = "report_window_session";
export const RESTORE_WINDOW_SESSION_COMMAND = "restore_window_session";
export const CLEAR_KEPT_SESSION_COMMAND = "clear_kept_session";

export interface KeptWindowPayload {
  state: unknown;
  snapshotIds: string[];
}

export interface SnapshotText {
  id: string;
  text: string;
}

export interface ReportWindowSessionArgs {
  session: KeptWindowPayload;
  snapshots: SnapshotText[];
}

export interface RestoredWindowSession {
  state: unknown;
  /** The text of each snapshot that could be read, by id. */
  snapshots: Record<string, string>;
}

export type KeptSessionError =
  | { kind: "unavailable" }
  | { kind: "invalidSnapshotId"; id: string }
  | { kind: "writeFailed"; message: string };

export const reportWindowSession = (args: ReportWindowSessionArgs) =>
  invoke<void>(REPORT_WINDOW_SESSION_COMMAND, { ...args });

export const restoreWindowSession = () =>
  invoke<RestoredWindowSession | null>(RESTORE_WINDOW_SESSION_COMMAND);

export const clearKeptSession = () => invoke<void>(CLEAR_KEPT_SESSION_COMMAND);
