import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  OPEN_MARKDOWN_FILE_COMMAND,
  openMarkdownFile,
  SAVE_MARKDOWN_FILE_COMMAND,
  saveMarkdownFile,
  type OpenMarkdownFileResult,
  type SaveMarkdownFileResult,
} from "./markdownDocumentApi";

describe("markdownDocumentApi", () => {
  it("invokes the open Markdown file command", async () => {
    const result = {
      path: "C:/Notes/index.md",
      parentFolderPath: "C:/Notes",
      metadata: {
        modifiedAtUnixMs: 1,
        sizeBytes: 12,
      },
      content: "# Notes",
      lineEnding: "lf",
    } satisfies OpenMarkdownFileResult;
    vi.mocked(invoke).mockResolvedValueOnce(result);

    await expect(openMarkdownFile({ path: result.path })).resolves.toBe(result);

    expect(invoke).toHaveBeenCalledWith(OPEN_MARKDOWN_FILE_COMMAND, {
      path: result.path,
    });
  });

  it("invokes the save Markdown file command", async () => {
    const result = {
      path: "C:/Notes/index.md",
      parentFolderPath: "C:/Notes",
      metadata: {
        modifiedAtUnixMs: 2,
        sizeBytes: 24,
      },
    } satisfies SaveMarkdownFileResult;
    vi.mocked(invoke).mockResolvedValueOnce(result);

    await expect(
      saveMarkdownFile({
        path: result.path,
        content: "# Updated",
        expectedMetadata: null,
        overwrite: false,
      }),
    ).resolves.toBe(result);

    expect(invoke).toHaveBeenCalledWith(SAVE_MARKDOWN_FILE_COMMAND, {
      path: result.path,
      content: "# Updated",
      expectedMetadata: null,
      overwrite: false,
    });
  });
});
