import { invoke } from "@tauri-apps/api/core";

import { isTaggedPayload } from "@/lib/taggedPayload";

export const RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND = "resolve_markdown_image_target";
export const FETCH_REMOTE_IMAGE_COMMAND = "fetch_remote_image";
export const READ_MARKDOWN_IMAGE_COMMAND = "read_markdown_image";

export interface ResolveMarkdownImageTargetArgs {
  allowOutsideFolder: boolean;
  documentPath: string | null;
  folderContextPath: string | null;
  target: string;
}

export type ResolveMarkdownImageTargetResult =
  | { kind: "renderable"; path: string }
  | { kind: "missing"; path: string }
  | { kind: "untitledRelative" }
  | { kind: "outsideFolder"; path: string }
  | { kind: "remoteBlocked"; host: string | null }
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

export interface FetchRemoteImageArgs {
  target: string;
}

export type FetchRemoteImageError =
  | { kind: "invalidTarget" }
  | { kind: "insecureScheme" }
  | { kind: "blockedDestination" }
  | { kind: "insecureRedirect" }
  | { kind: "tooManyRedirects" }
  | { kind: "httpStatus"; status: number }
  | { kind: "tooLarge" }
  | { kind: "unsupportedType" }
  | { kind: "timeout" }
  | { kind: "network" };

export const fetchRemoteImage = ({ target }: FetchRemoteImageArgs) =>
  invoke<ArrayBuffer>(FETCH_REMOTE_IMAGE_COMMAND, { target });

export type ReadMarkdownImageArgs = ResolveMarkdownImageTargetArgs;

export type ReadMarkdownImageError =
  | { kind: "unresolved"; resolution: ResolveMarkdownImageTargetResult }
  | { kind: "tooLarge"; path: string; sizeBytes: number; maxSizeBytes: number }
  | { kind: "unsupportedContent"; path: string }
  | { kind: "readFailed"; path: string; message: string };

const READ_MARKDOWN_IMAGE_ERROR_KINDS = [
  "unresolved",
  "tooLarge",
  "unsupportedContent",
  "readFailed",
] as const satisfies readonly ReadMarkdownImageError["kind"][];

export const isReadMarkdownImageError = (error: unknown): error is ReadMarkdownImageError =>
  isTaggedPayload(error, READ_MARKDOWN_IMAGE_ERROR_KINDS);

export const readMarkdownImage = ({
  allowOutsideFolder,
  documentPath,
  folderContextPath,
  target,
}: ReadMarkdownImageArgs) =>
  invoke<ArrayBuffer>(READ_MARKDOWN_IMAGE_COMMAND, {
    allowOutsideFolder,
    documentPath,
    folderContextPath,
    target,
  });
