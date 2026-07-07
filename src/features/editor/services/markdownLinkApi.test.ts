import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  RESOLVE_MARKDOWN_LINK_TARGET_COMMAND,
  resolveMarkdownLinkTarget,
  type ResolveMarkdownLinkTargetResult,
} from "./markdownLinkApi";

describe("markdownLinkApi", () => {
  it("invokes the resolve Markdown link target command", async () => {
    const result = {
      kind: "localMarkdown",
      path: "C:/Notes/linked.md",
    } satisfies ResolveMarkdownLinkTargetResult;
    vi.mocked(invoke).mockResolvedValueOnce(result);

    await expect(
      resolveMarkdownLinkTarget({
        allowOutsideFolder: false,
        documentPath: "C:/Notes/index.md",
        folderContextPath: "C:/Notes",
        target: "./linked.md",
      }),
    ).resolves.toBe(result);

    expect(invoke).toHaveBeenCalledWith(RESOLVE_MARKDOWN_LINK_TARGET_COMMAND, {
      allowOutsideFolder: false,
      documentPath: "C:/Notes/index.md",
      folderContextPath: "C:/Notes",
      target: "./linked.md",
    });
  });
});
