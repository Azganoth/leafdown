import { openUrl } from "@tauri-apps/plugin-opener";

import { requestConfirmation } from "@/lib/confirmation";
import { notifyOperationFailure } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { notifyWarning } from "@/lib/toast";

import {
  openMarkdownLinkTarget,
  resolveMarkdownLinkTarget,
  type ResolveMarkdownLinkTargetResult,
} from "../services/markdownLinkApi";
import type { MarkdownReferenceContext } from "./markdownReferences";

export interface MarkdownLinkContext extends MarkdownReferenceContext {
  onOpenMarkdownPath: (path: string, heading?: string) => boolean | Promise<boolean>;
  onReadMarkdownPath?: (path: string) => Promise<string>;
}

export interface ActivateMarkdownLinkOptions extends MarkdownLinkContext {
  target: string;
  heading?: string;
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
  requestConfirmation({
    title: t("editor.link.confirmLocalFile.title"),
    message: t("editor.link.confirmLocalFile.message"),
    detail: path,
    confirmLabel: t("editor.link.confirmLocalFile.confirm"),
    cancelLabel: t("editor.link.confirmLocalFile.cancel"),
  });

const confirmOutsideFolderMarkdownLink = (path: string) =>
  requestConfirmation({
    title: t("editor.link.confirmOutsideFolder.title"),
    message: t("editor.link.confirmOutsideFolder.message"),
    detail: path,
    confirmLabel: t("editor.link.confirmOutsideFolder.confirm"),
    cancelLabel: t("editor.link.confirmOutsideFolder.cancel"),
  });

const openExternalWebTarget = async (url: string) => {
  try {
    await openUrl(url);
    return true;
  } catch (error) {
    notifyOperationFailure(t("editor.link.openWebFailed"), error, "openExternalWebTarget");
    return false;
  }
};

const openLocalFilePath = async (
  { documentPath, folderContextPath, target }: ActivateMarkdownLinkOptions,
  allowOutsideFolder: boolean,
) => {
  try {
    await openMarkdownLinkTarget({
      allowOutsideFolder,
      documentPath,
      folderContextPath,
      target,
    });
    return true;
  } catch (error) {
    notifyOperationFailure(t("editor.link.openLocalFailed"), error, "openLocalFilePath");
    return false;
  }
};

const openLocalFileTarget = async (
  options: ActivateMarkdownLinkOptions,
  path: string,
  allowOutsideFolder: boolean,
) => {
  if (!(await confirmLocalFileLink(path))) {
    return false;
  }

  return openLocalFilePath(options, allowOutsideFolder);
};

const activateResolvedMarkdownLink = async (
  options: ActivateMarkdownLinkOptions,
  resolution: ResolveMarkdownLinkTargetResult,
  allowOutsideFolder = false,
) => {
  switch (resolution.kind) {
    case "externalWeb":
      return openExternalWebTarget(resolution.url);

    case "localMarkdown":
      return options.heading
        ? options.onOpenMarkdownPath(resolution.path, options.heading)
        : options.onOpenMarkdownPath(resolution.path);

    case "localFile":
      return openLocalFileTarget(options, resolution.path, allowOutsideFolder);

    case "outsideFolder":
      return activateOutsideFolderLink(options, resolution.path);

    case "missing":
      notifyWarning(t("editor.link.missing"), resolution.path);
      return false;

    case "untitledRelative":
      notifyWarning(t("editor.link.untitledRelative"));
      return false;

    case "unsupportedTarget":
      notifyWarning(t("editor.link.unsupportedTarget"), options.target);
      return false;

    case "invalidPath":
      notifyWarning(t("editor.link.invalidPath"), resolution.path);
      return false;

    case "permissionDenied":
      notifyWarning(t("editor.link.permissionDenied"), resolution.message || resolution.path);
      return false;

    case "metadataFailed":
      notifyWarning(t("editor.link.metadataFailed"), resolution.message || resolution.path);
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
    notifyWarning(t("editor.link.outsideFolder"), resolution.path || path);
    return false;
  }

  if (
    resolution.kind === "localMarkdown" &&
    !(await confirmOutsideFolderMarkdownLink(resolution.path))
  ) {
    return false;
  }

  return activateResolvedMarkdownLink(options, resolution, true);
};

export const activateMarkdownLink = async (options: ActivateMarkdownLinkOptions) => {
  try {
    const resolution = await resolveMarkdownLink(options);

    return activateResolvedMarkdownLink(options, resolution);
  } catch (error) {
    notifyOperationFailure(t("editor.link.resolveFailed"), error, "activateMarkdownLink");
    return false;
  }
};
