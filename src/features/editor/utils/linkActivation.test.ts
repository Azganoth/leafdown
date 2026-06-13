import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { activateMarkdownLink } from "./linkActivation";

const onOpenMarkdownPath = vi.fn(async () => true);

describe("Markdown link activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockReset();
    vi.mocked(confirm).mockResolvedValue(false);
    onOpenMarkdownPath.mockResolvedValue(true);
  });

  it("opens external web links in the system browser", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "externalWeb",
      url: "https://example.com/docs",
    });

    await expect(
      activateMarkdownLink({
        documentPath: "C:/Notes/readme.md",
        folderContextPath: "C:/Notes",
        onOpenMarkdownPath,
        target: "https://example.com/docs",
      }),
    ).resolves.toBe(true);

    expect(openUrl).toHaveBeenCalledWith("https://example.com/docs");
    expect(confirm).not.toHaveBeenCalled();
    expect(openPath).not.toHaveBeenCalled();
  });

  it("delegates confirmed outside-folder Markdown links to the application callback", async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(invoke)
      .mockResolvedValueOnce({ kind: "outsideFolder" })
      .mockResolvedValueOnce({ kind: "localMarkdown", path: "C:/Other/target.md" });

    await expect(
      activateMarkdownLink({
        documentPath: "C:/Notes/readme.md",
        folderContextPath: "C:/Notes",
        onOpenMarkdownPath,
        target: "../Other/target.md",
      }),
    ).resolves.toBe(true);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenNthCalledWith(1, "resolve_markdown_link_target", {
      documentPath: "C:/Notes/readme.md",
      folderContextPath: "C:/Notes",
      target: "../Other/target.md",
      explicitOpen: false,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "resolve_markdown_link_target", {
      documentPath: "C:/Notes/readme.md",
      folderContextPath: "C:/Notes",
      target: "../Other/target.md",
      explicitOpen: true,
    });
    expect(onOpenMarkdownPath).toHaveBeenCalledWith("C:/Other/target.md");
  });

  it("opens outside-folder non-Markdown links after one confirmation", async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(invoke)
      .mockResolvedValueOnce({ kind: "outsideFolder" })
      .mockResolvedValueOnce({ kind: "localFile", path: "C:/Other/manual.pdf" });

    await expect(
      activateMarkdownLink({
        documentPath: "C:/Notes/readme.md",
        folderContextPath: "C:/Notes",
        onOpenMarkdownPath,
        target: "../Other/manual.pdf",
      }),
    ).resolves.toBe(true);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(openPath).toHaveBeenCalledWith("C:/Other/manual.pdf");
  });

  it("asks before opening local non-Markdown links with the system default app", async () => {
    vi.mocked(confirm).mockResolvedValue(false);
    vi.mocked(invoke).mockResolvedValue({ kind: "localFile", path: "C:/Notes/manual.pdf" });

    await expect(
      activateMarkdownLink({
        documentPath: "C:/Notes/readme.md",
        folderContextPath: "C:/Notes",
        onOpenMarkdownPath,
        target: "manual.pdf",
      }),
    ).resolves.toBe(false);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(openPath).not.toHaveBeenCalled();
  });

  it.each([
    {
      resolution: { kind: "missing", path: "C:/Notes/missing.md" },
      title: "Link target not found.",
    },
    {
      resolution: { kind: "untitledRelative" },
      title: "Save the document to resolve this link.",
    },
    {
      resolution: { kind: "unsupportedTarget" },
      title: "Unsupported link target.",
    },
    {
      resolution: { kind: "invalidPath" },
      title: "Invalid link path.",
    },
  ])("shows a non-disruptive message for $resolution.kind links", async ({ resolution, title }) => {
    vi.mocked(invoke).mockResolvedValue(resolution);

    await expect(
      activateMarkdownLink({
        documentPath: null,
        folderContextPath: "C:/Notes",
        onOpenMarkdownPath,
        target: "missing.md",
      }),
    ).resolves.toBe(false);

    expect(vi.mocked(toast.warning).mock.calls.at(-1)?.[0]).toBe(title);
    expect(confirm).not.toHaveBeenCalled();
    expect(openPath).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });
});
