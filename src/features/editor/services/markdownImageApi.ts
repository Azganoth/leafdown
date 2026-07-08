import { invoke } from "@tauri-apps/api/core";

export const RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND = "resolve_markdown_image_target";

export interface ResolveMarkdownImageTargetArgs {
  allowOutsideFolder: boolean;
  documentPath: string | null;
  folderContextPath: string | null;
  target: string;
}

/* NOTE: src-tauri/src/image.rs (ResolveMarkdownImageTargetResult). */
export type ResolveMarkdownImageTargetResult =
  | { kind: "renderable"; path: string }
  | { kind: "missing"; path: string }
  | { kind: "untitledRelative" }
  | { kind: "outsideFolder"; path: string }
  | { kind: "remoteBlocked" }
  | { kind: "unsupportedFormat" }
  | { kind: "unsupportedTarget" }
  | { kind: "invalidPath"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string };

export const resolveMarkdownImageTarget = ({
  allowOutsideFolder,
  documentPath,
  folderContextPath,
  target,
}: ResolveMarkdownImageTargetArgs) =>
  invoke<ResolveMarkdownImageTargetResult>(RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND, {
    allowOutsideFolder,
    documentPath,
    folderContextPath,
    target,
  });
