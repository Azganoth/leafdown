import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import {
  countTauriApiCalls,
  mockTauriApi,
  mockTauriApiCommand,
  tauriApiCommand,
} from "@/test/utils/tauriApi";

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
    expect(countTauriApiCalls("openMarkdownLinkTarget")).toBe(0);
  });

  it("asks before opening outside-folder Markdown links", async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    const resolveMarkdownLinkTarget = vi
      .fn()
      .mockResolvedValueOnce({ kind: "outsideFolder", path: "C:/Other/target.md" })
      .mockResolvedValueOnce({ kind: "localMarkdown", path: "C:/Other/target.md" });
    mockTauriApiCommand("resolveMarkdownLinkTarget", resolveMarkdownLinkTarget);

    await expect(
      activateMarkdownLink(createMarkdownLinkOptions({ target: "../Other/target.md" })),
    ).resolves.toBe(true);

    expect(confirm).toHaveBeenCalledWith(
      "Open this Markdown file outside the current folder?\n\nC:/Other/target.md",
      {
        title: "Open outside folder?",
        kind: "warning",
        okLabel: "Open file",
        cancelLabel: "Cancel",
      },
    );
    expect(invoke).toHaveBeenNthCalledWith(1, tauriApiCommand("resolveMarkdownLinkTarget"), {
      ...createMarkdownReferenceContext(),
      allowOutsideFolder: false,
      target: "../Other/target.md",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, tauriApiCommand("resolveMarkdownLinkTarget"), {
      ...createMarkdownReferenceContext(),
      allowOutsideFolder: true,
      target: "../Other/target.md",
    });
    expect(onOpenMarkdownPath).toHaveBeenCalledWith("C:/Other/target.md");
  });

  it("asks before opening outside-folder non-Markdown links with the system default app", async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    const resolveMarkdownLinkTarget = vi
      .fn()
      .mockResolvedValueOnce({ kind: "outsideFolder", path: "C:/Other/manual.pdf" })
      .mockResolvedValueOnce({ kind: "localFile", path: "C:/Other/manual.pdf" });
    mockTauriApi({
      resolveMarkdownLinkTarget,
      openMarkdownLinkTarget: () => undefined,
    });

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
    expect(invoke).toHaveBeenLastCalledWith(tauriApiCommand("openMarkdownLinkTarget"), {
      ...createMarkdownReferenceContext(),
      allowOutsideFolder: true,
      target: "../Other/manual.pdf",
    });
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
    expect(countTauriApiCalls("openMarkdownLinkTarget")).toBe(0);
  });

  it("opens confirmed local non-Markdown links through the backend", async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    mockTauriApi({
      resolveMarkdownLinkTarget: () => ({ kind: "localFile", path: "C:/Notes/manual.pdf" }),
      openMarkdownLinkTarget: () => undefined,
    });

    await expect(
      activateMarkdownLink(createMarkdownLinkOptions({ target: "manual.pdf" })),
    ).resolves.toBe(true);

    expect(invoke).toHaveBeenLastCalledWith(tauriApiCommand("openMarkdownLinkTarget"), {
      ...createMarkdownReferenceContext(),
      allowOutsideFolder: false,
      target: "manual.pdf",
    });
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
      resolution: { kind: "invalidPath", path: "bad:path" },
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
      expect(countTauriApiCalls("openMarkdownLinkTarget")).toBe(0);
      expect(openUrl).not.toHaveBeenCalled();
    },
  );
});
