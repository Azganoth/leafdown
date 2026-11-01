import { isSamePath } from "@/lib/path";

import { useNamedFoldersStore } from "../stores/namedFolders";
import { editNamedFolder, type NamedFolder } from "./namedFoldersApi";
import { createBookmark, refreshNamedFolders } from "./namedFolderWorkflows";

export const addNamedFolder = (name: string, path: string) => createBookmark(name, path);

export const updateNamedFolder = async (folder: NamedFolder, name: string, path: string) => {
  const nextPath = path.trim();
  if (!name.trim() || !nextPath) return false;
  await editNamedFolder(folder.id, {
    name: name.trim(),
    ...(isSamePath(folder.path, nextPath) ? {} : { path: nextPath }),
    expectedRevision: useNamedFoldersStore.getState().revision,
  });
  await refreshNamedFolders();
  return true;
};
