import { invoke } from "@tauri-apps/api/core";

export const RESOLVE_MARKDOWN_LINK_TARGET_COMMAND = "resolve_markdown_link_target";

export interface ResolveMarkdownLinkTargetArgs {
  documentPath: string | null;
  folderContextPath: string | null;
  target: string;
  explicitOpen: boolean;
}

/* NOTE: src-tauri/src/link.rs (ResolveMarkdownLinkTargetResult). */
export type ResolveMarkdownLinkTargetResult =
  | { kind: "externalWeb"; url: string }
  | { kind: "localMarkdown"; path: string }
  | { kind: "localFile"; path: string }
  | { kind: "missing"; path: string }
  | { kind: "untitledRelative" }
  | { kind: "outsideFolder" }
  | { kind: "unsupportedTarget" }
  | { kind: "invalidPath" }
  | { kind: "permissionDenied"; message: string }
  | { kind: "metadataFailed"; message: string };

export const resolveMarkdownLinkTarget = ({
  documentPath,
  explicitOpen,
  folderContextPath,
  target,
}: ResolveMarkdownLinkTargetArgs) =>
  invoke<ResolveMarkdownLinkTargetResult>(RESOLVE_MARKDOWN_LINK_TARGET_COMMAND, {
    documentPath,
    folderContextPath,
    target,
    explicitOpen,
  });
