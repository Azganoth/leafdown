import { invoke } from "@tauri-apps/api/core";

import { isTaggedPayload } from "@/lib/taggedPayload";

export const CHECK_FOR_UPDATES_COMMAND = "check_for_updates";

export type UpdateCheck =
  | { kind: "upToDate"; currentVersion: string }
  | { kind: "available"; currentVersion: string; version: string; releaseUrl: string };

export type CheckForUpdatesError =
  | { kind: "network" }
  | { kind: "timeout" }
  | { kind: "rateLimited" }
  | { kind: "unexpectedResponse" };

const CHECK_FOR_UPDATES_ERROR_KINDS = [
  "network",
  "timeout",
  "rateLimited",
  "unexpectedResponse",
] as const satisfies readonly CheckForUpdatesError["kind"][];

export const isCheckForUpdatesError = (error: unknown): error is CheckForUpdatesError =>
  isTaggedPayload(error, CHECK_FOR_UPDATES_ERROR_KINDS);

export const checkForUpdates = () => invoke<UpdateCheck>(CHECK_FOR_UPDATES_COMMAND);
