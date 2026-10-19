import { useEffect } from "react";

import { handleUnexpectedError } from "@/lib/errors";
import { useTauriEvent } from "@/lib/tauriEvent";

import {
  NAMED_FOLDERS_CHANGED_EVENT,
  type NamedFoldersSnapshot,
} from "../services/namedFoldersApi";
import { refreshNamedFolders } from "../services/namedFolderWorkflows";
import { useNamedFoldersStore } from "../stores/namedFolders";

export const useNamedFolders = () => {
  useEffect(() => {
    void refreshNamedFolders().catch((error) => handleUnexpectedError(error, "listNamedFolders"));
  }, []);
  useTauriEvent<NamedFoldersSnapshot>(
    NAMED_FOLDERS_CHANGED_EVENT,
    ({ payload }) => {
      useNamedFoldersStore.getState().applySnapshot(payload);
    },
    "namedFoldersChanged",
  );
};
