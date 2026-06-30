import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND,
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
        documentPath: "C:/Notes/index.md",
        folderContextPath: "C:/Notes",
        target: "./image.png",
        explicitLoad: false,
      }),
    ).resolves.toBe(result);

    expect(invoke).toHaveBeenCalledWith(RESOLVE_MARKDOWN_IMAGE_TARGET_COMMAND, {
      documentPath: "C:/Notes/index.md",
      folderContextPath: "C:/Notes",
      target: "./image.png",
      explicitLoad: false,
    });
  });
});
