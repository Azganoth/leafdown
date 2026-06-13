import { invoke } from "@tauri-apps/api/core";
import { confirm as showConfirmDialog } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

export type MarkdownLinkResolutionKind =
  | "externalWeb"
  | "localMarkdown"
  | "localFile"
  | "missing"
  | "untitledRelative"
  | "outsideFolder"
  | "unsupportedTarget"
  | "invalidPath"
  | "permissionDenied"
  | "metadataFailed";

interface ExternalWebMarkdownLinkTarget {
  kind: "externalWeb";
  url: string;
}

interface LocalMarkdownLinkTarget {
  kind: "localMarkdown";
  path: string;
}

interface LocalFileLinkTarget {
  kind: "localFile";
  path: string;
}

interface MissingMarkdownLinkTarget {
  kind: "missing";
  path: string;
}

interface MarkdownLinkTargetMessage {
  kind: "permissionDenied" | "metadataFailed";
  message: string;
}

type BackendMarkdownLinkTarget =
  | ExternalWebMarkdownLinkTarget
  | LocalMarkdownLinkTarget
  | LocalFileLinkTarget
  | MissingMarkdownLinkTarget
  | MarkdownLinkTargetMessage
  | {
      kind: Exclude<
        MarkdownLinkResolutionKind,
        | "externalWeb"
        | "localMarkdown"
        | "localFile"
        | "missing"
        | "permissionDenied"
        | "metadataFailed"
      >;
    };

export interface MarkdownLinkContext {
  documentPath: string | null;
  folderContextPath: string | null;
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
  invoke<BackendMarkdownLinkTarget>("resolve_markdown_link_target", {
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

const showWarning = (title: string, description?: string) => {
  if (description) {
    toast.warning(title, { description });
    return;
  }

  toast.warning(title);
};

const showError = (title: string, error: unknown) => {
  toast.error(title, { description: error instanceof Error ? error.message : String(error) });
};

const openExternalWebTarget = async (url: string) => {
  try {
    await openUrl(url);
    return true;
  } catch (error: unknown) {
    showError("Could not open web link.", error);
    return false;
  }
};

const openLocalFileTarget = async (path: string, confirmationAlreadyShown: boolean) => {
  if (!confirmationAlreadyShown && !(await confirmLocalFileLink(path))) {
    return false;
  }

  try {
    await openPath(path);
    return true;
  } catch (error: unknown) {
    showError("Could not open local link.", error);
    return false;
  }
};

const activateResolvedMarkdownLink = async (
  options: ActivateMarkdownLinkOptions,
  resolution: BackendMarkdownLinkTarget,
  confirmationAlreadyShown: boolean,
): Promise<boolean> => {
  switch (resolution.kind) {
    case "externalWeb":
      return openExternalWebTarget(resolution.url);

    case "localMarkdown":
      return options.onOpenMarkdownPath(resolution.path);

    case "localFile":
      return openLocalFileTarget(resolution.path, confirmationAlreadyShown);

    case "outsideFolder": {
      if (confirmationAlreadyShown || !(await confirmOutsideFolderLink(options.target))) {
        return false;
      }

      const confirmedResolution = await resolveMarkdownLink({
        ...options,
        explicitOpen: true,
      });

      return activateResolvedMarkdownLink(options, confirmedResolution, true);
    }

    case "missing":
      showWarning("Link target not found.", resolution.path);
      return false;

    case "untitledRelative":
      showWarning("Save the document to resolve this link.");
      return false;

    case "unsupportedTarget":
      showWarning("Unsupported link target.", options.target);
      return false;

    case "invalidPath":
      showWarning("Invalid link path.", options.target);
      return false;

    case "permissionDenied":
      showWarning("Link access denied.", resolution.message);
      return false;

    case "metadataFailed":
      showWarning("Link target metadata unavailable.", resolution.message);
      return false;
  }
};

export const activateMarkdownLink = async (options: ActivateMarkdownLinkOptions) => {
  try {
    const resolution = await resolveMarkdownLink(options);

    return activateResolvedMarkdownLink(options, resolution, false);
  } catch (error: unknown) {
    showError("Could not resolve link.", error);
    return false;
  }
};
