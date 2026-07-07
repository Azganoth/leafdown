import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { mockTauriApiCommand, tauriApiCommand } from "@/test/utils/tauriApi";

import { activateMarkdownLink } from "./linkActivation";

const onOpenMarkdownPath = vi.fn(async () => true);

const createMarkdownLinkOptions = (
  overrides: Partial<Parameters<typeof activateMarkdownLink>[0]> = {},
) => ({
  ...createMarkdownReferenceContext(),
  onOpenMarkdownPath,
  target: "https://example.com/docs",
  ...overrides,
});

describe("Markdown link activation", () => {
  beforeEach(() => {
    onOpenMarkdownPath.mockResolvedValue(true);
  });

  it("opens external web links in the system browser", async () => {
    mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({
      kind: "externalWeb",
      url: "https://example.com/docs",
    }));

    await expect(activateMarkdownLink(createMarkdownLinkOptions())).resolves.toBe(true);

    expect(openUrl).toHaveBeenCalledWith("https://example.com/docs");
    expect(confirm).not.toHaveBeenCalled();
    expect(openPath).not.toHaveBeenCalled();
  });

  it("delegates outside-folder Markdown links to the application callback without confirmation", async () => {
    const resolveMarkdownLinkTarget = vi
      .fn()
      .mockResolvedValueOnce({ kind: "outsideFolder" })
      .mockResolvedValueOnce({ kind: "localMarkdown", path: "C:/Other/target.md" });
    mockTauriApiCommand("resolveMarkdownLinkTarget", resolveMarkdownLinkTarget);

    await expect(
      activateMarkdownLink(createMarkdownLinkOptions({ target: "../Other/target.md" })),
    ).resolves.toBe(true);

    expect(confirm).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenNthCalledWith(1, tauriApiCommand("resolveMarkdownLinkTarget"), {
      ...createMarkdownReferenceContext(),
      target: "../Other/target.md",
      explicitOpen: false,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, tauriApiCommand("resolveMarkdownLinkTarget"), {
      ...createMarkdownReferenceContext(),
      target: "../Other/target.md",
      explicitOpen: true,
    });
    expect(onOpenMarkdownPath).toHaveBeenCalledWith("C:/Other/target.md");
  });

  it("asks before opening outside-folder non-Markdown links with the system default app", async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    const resolveMarkdownLinkTarget = vi
      .fn()
      .mockResolvedValueOnce({ kind: "outsideFolder" })
      .mockResolvedValueOnce({ kind: "localFile", path: "C:/Other/manual.pdf" });
    mockTauriApiCommand("resolveMarkdownLinkTarget", resolveMarkdownLinkTarget);

    await expect(
      activateMarkdownLink(createMarkdownLinkOptions({ target: "../Other/manual.pdf" })),
    ).resolves.toBe(true);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      "Open this local file with the system default app?\n\nC:/Other/manual.pdf",
      {
        title: "Open local file?",
        kind: "warning",
        okLabel: "Open file",
        cancelLabel: "Cancel",
      },
    );
    expect(openPath).toHaveBeenCalledWith("C:/Other/manual.pdf");
  });

  it("asks before opening local non-Markdown links with the system default app", async () => {
    mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({
      kind: "localFile",
      path: "C:/Notes/manual.pdf",
    }));

    await expect(
      activateMarkdownLink(createMarkdownLinkOptions({ target: "manual.pdf" })),
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
  ] as const)(
    "shows a non-disruptive message for $resolution.kind links",
    async ({ resolution, title }) => {
      mockTauriApiCommand("resolveMarkdownLinkTarget", () => resolution);

      await expect(
        activateMarkdownLink(
          createMarkdownLinkOptions({
            documentPath: null,
            target: "missing.md",
          }),
        ),
      ).resolves.toBe(false);

      expect(vi.mocked(toast.warning).mock.calls.at(-1)?.[0]).toBe(title);
      expect(confirm).not.toHaveBeenCalled();
      expect(openPath).not.toHaveBeenCalled();
      expect(openUrl).not.toHaveBeenCalled();
    },
  );
});
