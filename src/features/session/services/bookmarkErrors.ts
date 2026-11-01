import {
  getScanFolderContextErrorMessage,
  isScanFolderContextError,
} from "@/features/folder-context";
import { getErrorDescription, handleUnexpectedError } from "@/lib/errors";
import { t } from "@/lib/i18n";

export interface BookmarkFormError {
  message: string;
  field?: "folder";
}

export const getBookmarkError = (error: unknown): BookmarkFormError => {
  if (isScanFolderContextError(error)) {
    const message = getScanFolderContextErrorMessage(error);
    return {
      message: [message.title, message.description].filter(Boolean).join(" "),
      field: "folder",
    };
  }
  if (error && typeof error === "object" && "kind" in error) {
    switch (error.kind) {
      case "duplicateBookmark":
        return { message: t("session.bookmarks.duplicate"), field: "folder" };
      case "folderUnavailable":
        return {
          message: getErrorDescription(error) ?? t("session.bookmarks.folderUnavailable"),
          field: "folder",
        };
      case "invalidContext":
        return { message: t("session.bookmarks.changed") };
      case "writeFailed":
        return { message: getErrorDescription(error) ?? t("session.bookmarks.failed") };
      case "unavailable":
        return { message: t("session.bookmarks.failed") };
      case "contextBusy":
        return { message: t("session.bookmarks.busy") };
    }
  }
  handleUnexpectedError(error, "bookmarkAction");
  return { message: getErrorDescription(error) ?? t("session.bookmarks.failed") };
};
