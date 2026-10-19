import { invoke } from "@tauri-apps/api/core";

import type { RestoredWindowSession } from "./keptSessionApi";

export const NAMED_FOLDERS_CHANGED_EVENT = "leafdown://named-folders-changed";

export interface NamedFolder {
  id: string;
  name: string;
  path: string;
  windowLabel: string | null;
  hasUnsavedDrafts: boolean;
}

export interface NamedFoldersSnapshot {
  revision: number;
  folders: NamedFolder[];
}

export const listNamedFolders = () => invoke<NamedFoldersSnapshot>("list_named_folders");
export const createNamedFolder = (id: string, name: string, path: string) =>
  invoke<void>("create_named_folder", { id, name, path });
export const editNamedFolder = (
  id: string,
  changes: {
    name?: string;
    path?: string;
    remove?: boolean;
    discardUnsaved?: boolean;
    expectedRevision?: number;
  },
) =>
  invoke<void>("edit_named_folder", {
    id,
    changes: { ...changes },
  });
export const selectNamedFolder = (id: string | null, newWindow = false, documentPath?: string) =>
  invoke<{ kind: "focused" } | { kind: "selected"; session: RestoredWindowSession | null }>(
    "select_named_folder",
    { id, newWindow, documentPath: documentPath ?? null },
  );
