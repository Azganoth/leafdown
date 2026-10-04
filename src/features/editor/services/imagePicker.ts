import { open } from "@tauri-apps/plugin-dialog";

import { t } from "@/lib/i18n";
import { getPathParts } from "@/lib/path";

const IMAGE_FILE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp"];

/** Asks for a local image file, starting in the document's folder when it has one. */
export const selectImageFilePath = async (documentPath: string | null) => {
  const selectedPath = await open({
    defaultPath: documentPath === null ? undefined : getPathParts(documentPath).parent,
    directory: false,
    filters: [{ name: t("editor.replaceImage.pickerFilter"), extensions: IMAGE_FILE_EXTENSIONS }],
    multiple: false,
    title: t("editor.replaceImage.pickerTitle"),
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return null;
  }

  return selectedPath;
};
