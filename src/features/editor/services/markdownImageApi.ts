import { invoke } from "@tauri-apps/api/core";

export const RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND = "resolve_markdown_image_target";

export interface ResolveMarkdownImageTargetArgs {
  documentPath: string | null;
  folderContextPath: string | null;
  target: string;
  explicitLoad: boolean;
}

/* NOTE: src-tauri/src/image.rs (ResolveMarkdownImageTargetResult). */
export type ResolveMarkdownImageTargetResult =
  | { kind: "renderable"; path: string }
  | { kind: "missing"; path: string }
  | { kind: "untitledRelative" }
  | { kind: "outsideFolder" }
  | { kind: "remoteBlocked" }
  | { kind: "unsupportedFormat" }
  | { kind: "unsupportedTarget" }
  | { kind: "invalidPath" }
  | { kind: "permissionDenied"; message: string }
  | { kind: "metadataFailed"; message: string };

export const resolveMarkdownImageTarget = ({
  documentPath,
  explicitLoad,
  folderContextPath,
  target,
}: ResolveMarkdownImageTargetArgs) =>
  invoke<ResolveMarkdownImageTargetResult>(RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND, {
    documentPath,
    folderContextPath,
    target,
    explicitLoad,
  });
