import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizePathForAssetUrl, resolveMarkdownImage, toTauriAssetUrl } from "./imageResolution";

describe("imageResolution", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(convertFileSrc).mockClear();
  });

  it("normalizes Windows separators before creating Tauri asset URLs", () => {
    const path = "C:\\Notes\\assets\\image with spaces.png";

    expect(normalizePathForAssetUrl(path)).toBe("C:/Notes/assets/image with spaces.png");
    expect(toTauriAssetUrl(path)).toBe(
      "asset://localhost/C%3A%2FNotes%2Fassets%2Fimage%20with%20spaces.png",
    );
    expect(convertFileSrc).toHaveBeenCalledWith("C:/Notes/assets/image with spaces.png");
  });

  it("resolves renderable backend paths into encoded asset URLs", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      kind: "renderable",
      path: "C:\\Notes\\assets\\icon special.png",
    });

    await expect(
      resolveMarkdownImage({
        documentPath: "C:/Notes/readme.md",
        folderContextPath: "C:/Notes",
        target: "./assets/icon special.png",
      }),
    ).resolves.toEqual({
      kind: "renderable",
      path: "C:\\Notes\\assets\\icon special.png",
      assetUrl: "asset://localhost/C%3A%2FNotes%2Fassets%2Ficon%20special.png",
    });
    expect(invoke).toHaveBeenCalledWith("resolve_markdown_image_target", {
      documentPath: "C:/Notes/readme.md",
      folderContextPath: "C:/Notes",
      target: "./assets/icon special.png",
      explicitLoad: false,
    });
  });

  it("returns blocked and placeholder states without asset URL conversion", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ kind: "remoteBlocked" });

    await expect(
      resolveMarkdownImage({
        documentPath: "C:/Notes/readme.md",
        folderContextPath: "C:/Notes",
        target: "https://example.com/icon.png",
      }),
    ).resolves.toEqual({ kind: "remoteBlocked" });
    expect(convertFileSrc).not.toHaveBeenCalled();
  });
});
