import { invoke } from "@tauri-apps/api/core";

export const INSPECT_DROPPED_PATH_COMMAND = "inspect_dropped_path";

export interface InspectDroppedPathArgs {
  path: string;
}

/* NOTE: src-tauri/src/drop.rs (DroppedPath). */
export type DroppedPath =
  | { kind: "folder"; path: string }
  | { kind: "markdownFile"; path: string }
  | { kind: "unsupported"; path: string };

/* NOTE: src-tauri/src/drop.rs (InspectDroppedPathError). */
export type InspectDroppedPathError =
  | { kind: "invalidPath"; path: string }
  | { kind: "missingPath"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string };

export const inspectDroppedPath = ({ path }: InspectDroppedPathArgs) =>
  invoke<DroppedPath>(INSPECT_DROPPED_PATH_COMMAND, { path });
