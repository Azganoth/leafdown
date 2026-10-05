import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  INSPECT_MARKDOWN_FILE_COMMAND,
  inspectMarkdownFile,
  MARKDOWN_FILE_EXTENSIONS,
  NEW_DOCUMENT_EXTENSIONS,
  OPEN_MARKDOWN_FILE_COMMAND,
  openMarkdownFile,
  SAVE_MARKDOWN_FILE_COMMAND,
  saveMarkdownFile,
  UNWATCH_MARKDOWN_DOCUMENT_COMMAND,
  unwatchMarkdownDocument,
  WATCH_MARKDOWN_DOCUMENT_COMMAND,
  watchMarkdownDocument,
  type MarkdownFileState,
  type OpenMarkdownFileResult,
  type SaveMarkdownFileResult,
} from "./markdownDocumentApi";

describe("markdownDocumentApi", () => {
  it("accepts the built-in Markdown file extensions in resolution order", () => {
    expect(MARKDOWN_FILE_EXTENSIONS).toEqual(["md", "markdown", "mdown", "mkd"]);
  });

  it("offers only accepted extensions for new documents", () => {
    expect(NEW_DOCUMENT_EXTENSIONS).toEqual([".md", ".markdown"]);
    for (const extension of NEW_DOCUMENT_EXTENSIONS) {
      expect(MARKDOWN_FILE_EXTENSIONS).toContain(extension.slice(1));
    }
  });

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
      encoding: { name: "UTF-16LE", bom: true },
      fingerprint: "0123456789abcdef",
    } satisfies OpenMarkdownFileResult;
    vi.mocked(invoke).mockResolvedValueOnce(result);

    await expect(openMarkdownFile({ path: result.path })).resolves.toBe(result);

    expect(invoke).toHaveBeenCalledWith(OPEN_MARKDOWN_FILE_COMMAND, {
      path: result.path,
      encoding: null,
    });
  });

  it("sends a chosen encoding with the open Markdown file command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await openMarkdownFile({ path: "C:/Notes/latin.md", encoding: "windows-1252" });

    expect(invoke).toHaveBeenCalledWith(OPEN_MARKDOWN_FILE_COMMAND, {
      path: "C:/Notes/latin.md",
      encoding: "windows-1252",
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
      fingerprint: "fedcba9876543210",
    } satisfies SaveMarkdownFileResult;
    vi.mocked(invoke).mockResolvedValueOnce(result);

    await expect(
      saveMarkdownFile({
        path: result.path,
        content: "# Updated",
        encoding: { name: "UTF-8", bom: true },
        expectedMetadata: null,
        overwrite: false,
      }),
    ).resolves.toBe(result);

    expect(invoke).toHaveBeenCalledWith(SAVE_MARKDOWN_FILE_COMMAND, {
      path: result.path,
      content: "# Updated",
      encoding: { name: "UTF-8", bom: true },
      expectedMetadata: null,
      overwrite: false,
    });
  });

  it("invokes the inspect Markdown file command with the document's version", async () => {
    const result = { kind: "unchanged" } satisfies MarkdownFileState;
    const metadata = { modifiedAtUnixMs: 3, sizeBytes: 7 };
    vi.mocked(invoke).mockResolvedValueOnce(result);

    await expect(
      inspectMarkdownFile({ path: "C:/Notes/index.md", metadata, fingerprint: "0123456789abcdef" }),
    ).resolves.toBe(result);

    expect(invoke).toHaveBeenCalledWith(INSPECT_MARKDOWN_FILE_COMMAND, {
      path: "C:/Notes/index.md",
      metadata,
      fingerprint: "0123456789abcdef",
    });
  });

  it("invokes the document watch commands with their scope", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await watchMarkdownDocument({
      path: "C:/Notes/index.md",
      scopeId: "document-watch:1",
      scopeGeneration: 1,
    });
    await unwatchMarkdownDocument({ scopeId: "document-watch:1", scopeGeneration: 1 });

    expect(invoke).toHaveBeenCalledWith(WATCH_MARKDOWN_DOCUMENT_COMMAND, {
      path: "C:/Notes/index.md",
      scopeId: "document-watch:1",
      scopeGeneration: 1,
    });
    expect(invoke).toHaveBeenCalledWith(UNWATCH_MARKDOWN_DOCUMENT_COMMAND, {
      scopeId: "document-watch:1",
      scopeGeneration: 1,
    });
  });
});
