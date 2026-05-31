import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export type MarkdownImageResolutionKind =
  | "renderable"
  | "missing"
  | "untitledRelative"
  | "outsideFolder"
  | "remoteBlocked"
  | "unsupportedFormat"
  | "unsupportedTarget"
  | "invalidPath"
  | "permissionDenied"
  | "metadataFailed";

interface RenderableMarkdownImageTarget {
  kind: "renderable";
  path: string;
}

interface MissingMarkdownImageTarget {
  kind: "missing";
  path: string;
}

interface MarkdownImageTargetMessage {
  kind: "permissionDenied" | "metadataFailed";
  message: string;
}

type BackendMarkdownImageTarget =
  | RenderableMarkdownImageTarget
  | MissingMarkdownImageTarget
  | MarkdownImageTargetMessage
  | {
      kind: Exclude<
        MarkdownImageResolutionKind,
        "renderable" | "missing" | "permissionDenied" | "metadataFailed"
      >;
    };

export type MarkdownImageResolution =
  | (RenderableMarkdownImageTarget & { assetUrl: string })
  | Exclude<BackendMarkdownImageTarget, RenderableMarkdownImageTarget>;

export interface ResolveMarkdownImageOptions {
  documentPath: string | null;
  folderContextPath: string | null;
  target: string;
  explicitLoad?: boolean;
}

export const normalizePathForAssetUrl = (path: string) => path.replaceAll("\\", "/");

export const toTauriAssetUrl = (path: string) => convertFileSrc(normalizePathForAssetUrl(path));

export const resolveMarkdownImage = async ({
  documentPath,
  folderContextPath,
  target,
  explicitLoad = false,
}: ResolveMarkdownImageOptions): Promise<MarkdownImageResolution> => {
  const result = await invoke<BackendMarkdownImageTarget>("resolve_markdown_image_target", {
    documentPath,
    folderContextPath,
    target,
    explicitLoad,
  });

  if (result.kind !== "renderable") {
    return result;
  }

  return {
    ...result,
    assetUrl: toTauriAssetUrl(result.path),
  };
};
