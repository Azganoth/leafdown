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
  explicitOpen?: boolean;
}

const resolveMarkdownLink = ({
  documentPath,
  explicitOpen = false,
  folderContextPath,
  target,
}: ResolveMarkdownLinkOptions) =>
  resolveMarkdownLinkTarget({
    documentPath,
    folderContextPath,
    target,
    explicitOpen,
  });

const confirmOutsideFolderLink = (target: string) =>
  showConfirmDialog(`This link points outside the current folder:\n\n${target}\n\nOpen it?`, {
    title: "Open outside folder?",
    kind: "warning",
    okLabel: "Open link",
    cancelLabel: "Cancel",
  });

const confirmLocalFileLink = (path: string) =>
  showConfirmDialog(`Open this local file with the system default app?\n\n${path}`, {
    title: "Open local file?",
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
      return activateOutsideFolderMarkdownLink(options);

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
      notifyWarning("Invalid link path.", options.target);
      return false;

    case "permissionDenied":
      notifyWarning("Link access denied.", resolution.message);
      return false;

    case "metadataFailed":
      notifyWarning("Link target metadata unavailable.", resolution.message);
      return false;
  }
};

const activateOutsideFolderMarkdownLink = async (
  options: ActivateMarkdownLinkOptions,
): Promise<boolean> => {
  if (!(await confirmOutsideFolderLink(options.target))) {
    return false;
  }

  const resolution = await resolveMarkdownLink({
    ...options,
    explicitOpen: true,
  });

  if (resolution.kind === "outsideFolder") {
    return false;
  }

  if (resolution.kind === "localFile") {
    return openLocalFilePath(resolution.path);
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
