import { invoke } from "@tauri-apps/api/core";

export const RESOLVE_MARKDOWN_LINK_TARGET_COMMAND = "resolve_markdown_link_target";

export interface ResolveMarkdownLinkTargetArgs {
  allowOutsideFolder: boolean;
  documentPath: string | null;
  folderContextPath: string | null;
  target: string;
}

/* NOTE: src-tauri/src/link.rs (ResolveMarkdownLinkTargetResult). */
export type ResolveMarkdownLinkTargetResult =
  | { kind: "externalWeb"; url: string }
  | { kind: "localMarkdown"; path: string }
  | { kind: "localFile"; path: string }
  | { kind: "missing"; path: string }
  | { kind: "untitledRelative" }
  | { kind: "outsideFolder"; path: string }
  | { kind: "unsupportedTarget" }
  | { kind: "invalidPath"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string };

export const resolveMarkdownLinkTarget = ({
  allowOutsideFolder,
  documentPath,
  folderContextPath,
  target,
}: ResolveMarkdownLinkTargetArgs) =>
  invoke<ResolveMarkdownLinkTargetResult>(RESOLVE_MARKDOWN_LINK_TARGET_COMMAND, {
    allowOutsideFolder,
    documentPath,
    folderContextPath,
    target,
  });
