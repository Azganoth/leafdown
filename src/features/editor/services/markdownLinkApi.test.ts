import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  OPEN_MARKDOWN_LINK_TARGET_COMMAND,
  RESOLVE_MARKDOWN_LINK_TARGET_COMMAND,
  openMarkdownLinkTarget,
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

  it("invokes the open Markdown link target command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await expect(
      openMarkdownLinkTarget({
        allowOutsideFolder: true,
        documentPath: "C:/Notes/index.md",
        folderContextPath: "C:/Notes",
        target: "../Other/manual.pdf",
      }),
    ).resolves.toBeUndefined();

    expect(invoke).toHaveBeenCalledWith(OPEN_MARKDOWN_LINK_TARGET_COMMAND, {
      allowOutsideFolder: true,
      documentPath: "C:/Notes/index.md",
      folderContextPath: "C:/Notes",
      target: "../Other/manual.pdf",
    });
  });
});
