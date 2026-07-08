import { confirm as showConfirmDialog } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import { notifyOperationFailure } from "@/lib/errors";
import { notifyWarning } from "@/lib/toast";

import {
  resolveMarkdownLinkTarget,
  type ResolveMarkdownLinkTargetResult,
} from "../services/markdownLinkApi";
import type { MarkdownReferenceContext } from "./markdownReferences";

export interface MarkdownLinkContext extends MarkdownReferenceContext {
  onOpenMarkdownPath: (path: string) => boolean | Promise<boolean>;
}

export interface ActivateMarkdownLinkOptions extends MarkdownLinkContext {
  target: string;
}

interface ResolveMarkdownLinkOptions extends ActivateMarkdownLinkOptions {
  allowOutsideFolder?: boolean;
}

const resolveMarkdownLink = ({
  allowOutsideFolder = false,
  documentPath,
  folderContextPath,
  target,
}: ResolveMarkdownLinkOptions) =>
  resolveMarkdownLinkTarget({
    allowOutsideFolder,
    documentPath,
    folderContextPath,
    target,
  });

const confirmLocalFileLink = (path: string) =>
  showConfirmDialog(`Open this local file with the system default app?\n\n${path}`, {
    title: "Open local file?",
    kind: "warning",
    okLabel: "Open file",
    cancelLabel: "Cancel",
  });

const confirmOutsideFolderMarkdownLink = (path: string) =>
  showConfirmDialog(`Open this Markdown file outside the current folder?\n\n${path}`, {
    title: "Open outside folder?",
    kind: "warning",
    okLabel: "Open file",
    cancelLabel: "Cancel",
  });

const openExternalWebTarget = async (url: string) => {
  try {
    await openUrl(url);
    return true;
  } catch (error) {
    notifyOperationFailure("Could not open web link.", error, "openExternalWebTarget");
    return false;
  }
};

const openLocalFilePath = async (path: string) => {
  try {
    await openPath(path);
    return true;
  } catch (error) {
    notifyOperationFailure("Could not open local link.", error, "openLocalFilePath");
    return false;
  }
};

const openLocalFileTarget = async (path: string) => {
  if (!(await confirmLocalFileLink(path))) {
    return false;
  }

  return openLocalFilePath(path);
};

const activateResolvedMarkdownLink = async (
  options: ActivateMarkdownLinkOptions,
  resolution: ResolveMarkdownLinkTargetResult,
) => {
  switch (resolution.kind) {
    case "externalWeb":
      return openExternalWebTarget(resolution.url);

    case "localMarkdown":
      return options.onOpenMarkdownPath(resolution.path);

    case "localFile":
      return openLocalFileTarget(resolution.path);

    case "outsideFolder":
      return activateOutsideFolderLink(options, resolution.path);

    case "missing":
      notifyWarning("Link target not found.", resolution.path);
      return false;

    case "untitledRelative":
      notifyWarning("Save the document to resolve this link.");
      return false;

    case "unsupportedTarget":
      notifyWarning("Unsupported link target.", options.target);
      return false;

    case "invalidPath":
      notifyWarning("Invalid link path.", resolution.path);
      return false;

    case "permissionDenied":
      notifyWarning("Link access denied.", resolution.message || resolution.path);
      return false;

    case "metadataFailed":
      notifyWarning("Link target metadata unavailable.", resolution.message || resolution.path);
      return false;
  }
};

const activateOutsideFolderLink = async (
  options: ActivateMarkdownLinkOptions,
  path: string,
): Promise<boolean> => {
  const resolution = await resolveMarkdownLink({
    ...options,
    allowOutsideFolder: true,
  });

  if (resolution.kind === "outsideFolder") {
    notifyWarning("Link target is outside the current folder.", resolution.path || path);
    return false;
  }

  if (
    resolution.kind === "localMarkdown" &&
    !(await confirmOutsideFolderMarkdownLink(resolution.path))
  ) {
    return false;
  }

  return activateResolvedMarkdownLink(options, resolution);
};

export const activateMarkdownLink = async (options: ActivateMarkdownLinkOptions) => {
  try {
    const resolution = await resolveMarkdownLink(options);

    return activateResolvedMarkdownLink(options, resolution);
  } catch (error) {
    notifyOperationFailure("Could not resolve link.", error, "activateMarkdownLink");
    return false;
  }
};
