import { useEffect } from "react";

import { startFolderSearchSession } from "../services/folderSearchWorkflows";

export const useFolderSearchSession = () => {
  useEffect(() => {
    const session = startFolderSearchSession();

    return () => session.dispose();
  }, []);
};
