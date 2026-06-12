import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStore } from "@/stores/session";
import { resetAppStores, setDefaultSession } from "@/test/fixtures/appStores";

import { activateMarkdownLink } from "./linkActivation";

const notesFolderTree = {
  name: "Notes",
  path: "C:/Notes",
  children: [
    {
      kind: "file" as const,
      name: "readme.md",
      path: "C:/Notes/readme.md",
    },
  ],
};

const otherFolderTree = {
  name: "Other",
  path: "C:/Other",
  children: [
    {
      kind: "file" as const,
      name: "target.md",
      path: "C:/Other/target.md",
    },
  ],
};

describe("Markdown link activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockReset();
    vi.mocked(confirm).mockResolvedValue(false);
    resetAppStores();
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
        target: "https://example.com/docs",
      }),
    ).resolves.toBe(true);

    expect(openUrl).toHaveBeenCalledWith("https://example.com/docs");
    expect(confirm).not.toHaveBeenCalled();
    expect(openPath).not.toHaveBeenCalled();
  });

  it("opens confirmed outside-folder Markdown links inside Leafdown and switches context", async () => {
    setDefaultSession({
      folderContext: { path: "C:/Notes", tree: notesFolderTree, isEmpty: false },
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "[Target](../Other/target.md)",
        isDirty: false,
        lineEnding: "lf",
        metadata: { sizeBytes: 27, modifiedAtUnixMs: 1 },
      },
    });
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(invoke)
      .mockResolvedValueOnce({ kind: "outsideFolder" })
      .mockResolvedValueOnce({ kind: "localMarkdown", path: "C:/Other/target.md" })
      .mockResolvedValueOnce({
        path: "C:/Other/target.md",
        parentFolderPath: "C:/Other",
        content: "# Target\n",
        lineEnding: "lf",
        metadata: { sizeBytes: 9, modifiedAtUnixMs: 2 },
      })
      .mockResolvedValueOnce({
        path: "C:/Other",
        tree: otherFolderTree,
        isEmpty: false,
      });

    await expect(
      activateMarkdownLink({
        documentPath: "C:/Notes/readme.md",
        folderContextPath: "C:/Notes",
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
    expect(invoke).toHaveBeenNthCalledWith(3, "open_markdown_file", {
      path: "C:/Other/target.md",
    });
    expect(useSessionStore.getState()).toMatchObject({
      folderContext: { path: "C:/Other", tree: otherFolderTree },
      activeDocument: {
        status: "saved",
        path: "C:/Other/target.md",
        content: "# Target\n",
        isDirty: false,
      },
    });
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
        target: "missing.md",
      }),
    ).resolves.toBe(false);

    expect(vi.mocked(toast.warning).mock.calls.at(-1)?.[0]).toBe(title);
    expect(confirm).not.toHaveBeenCalled();
    expect(openPath).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });
});
