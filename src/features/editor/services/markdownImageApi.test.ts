import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  FETCH_REMOTE_IMAGE_COMMAND,
  RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND,
  fetchRemoteImage,
  resolveMarkdownImageTarget,
  type ResolveMarkdownImageTargetResult,
} from "./markdownImageApi";

describe("markdownImageApi", () => {
  it("invokes the resolve Markdown image target command", async () => {
    const result = {
      kind: "renderable",
      path: "C:/Notes/image.png",
    } satisfies ResolveMarkdownImageTargetResult;
    vi.mocked(invoke).mockResolvedValueOnce(result);

    await expect(
      resolveMarkdownImageTarget({
        allowOutsideFolder: false,
        documentPath: "C:/Notes/index.md",
        folderContextPath: "C:/Notes",
        target: "./image.png",
      }),
    ).resolves.toBe(result);

    expect(invoke).toHaveBeenCalledWith(RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND, {
      allowOutsideFolder: false,
      documentPath: "C:/Notes/index.md",
      folderContextPath: "C:/Notes",
      target: "./image.png",
    });
  });

  it("invokes the fetch remote image command with only the target", async () => {
    const bytes = new ArrayBuffer(4);
    vi.mocked(invoke).mockResolvedValueOnce(bytes);

    await expect(fetchRemoteImage({ target: "https://example.com/image.png" })).resolves.toBe(
      bytes,
    );

    expect(invoke).toHaveBeenCalledWith(FETCH_REMOTE_IMAGE_COMMAND, {
      target: "https://example.com/image.png",
    });
  });
});
