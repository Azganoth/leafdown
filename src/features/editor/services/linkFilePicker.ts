import { open } from "@tauri-apps/plugin-dialog";

import { t } from "@/lib/i18n";
import { getPathParts } from "@/lib/path";

/** Asks for any one local file, starting in the document's folder when it has one. */
export const selectLinkFilePath = async (documentPath: string | null) => {
  const selectedPath = await open({
    defaultPath: documentPath === null ? undefined : getPathParts(documentPath).parent,
    directory: false,
    multiple: false,
    title: t("editor.chooseLinkFile.pickerTitle"),
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return null;
  }

  return selectedPath;
};
