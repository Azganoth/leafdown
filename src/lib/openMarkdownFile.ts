import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { useSessionStore, type FileMetadataSnapshot, type LineEnding } from "@/stores/session";

interface OpenMarkdownFileResult {
  path: string;
  parentFolderPath: string;
  content: string;
  lineEnding: LineEnding | null;
  metadata: FileMetadataSnapshot;
}

export const openMarkdownFile = async () => {
  const selectedPath = await open({
    directory: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    multiple: false,
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return;
  }

  const openedDocument = await invoke<OpenMarkdownFileResult>("open_markdown_file", {
    path: selectedPath,
  });

  useSessionStore.getState().setDocumentSession(
    { status: "available", path: openedDocument.parentFolderPath },
    {
      status: "saved",
      path: openedDocument.path,
      content: openedDocument.content,
      lineEnding: openedDocument.lineEnding,
      metadata: openedDocument.metadata,
    },
  );
};
