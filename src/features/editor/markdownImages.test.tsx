import { fireEvent, waitFor } from "@testing-library/react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, {
    documentPath: "C:/Notes/readme.md",
    folderContextPath: "C:/Notes",
    rootClassName: "leafdown-editor",
  });
  mountedEditors.push(mounted);
  return mounted;
};

describe("Markdown images", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(convertFileSrc).mockClear();
  });

  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("renders supported local images through backend resolution and Tauri asset URLs", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "renderable",
      path: "C:\\Notes\\assets\\icon special.png",
    });

    const mounted = await mountEditor("![Sample Icon](./assets/icon.png)");

    await waitFor(() => {
      expect(mounted.view.dom.querySelector("img[alt='Sample Icon']")).toBeInTheDocument();
    });

    const image = mounted.view.dom.querySelector<HTMLImageElement>("img[alt='Sample Icon']");

    expect(image?.getAttribute("src")).toBe(
      "asset://localhost/C%3A%2FNotes%2Fassets%2Ficon%20special.png",
    );
    expect(convertFileSrc).toHaveBeenCalledWith("C:/Notes/assets/icon special.png");
    expect(invoke).toHaveBeenCalledWith("resolve_markdown_image_target", {
      documentPath: "C:/Notes/readme.md",
      folderContextPath: "C:/Notes",
      target: "./assets/icon.png",
      explicitLoad: false,
    });
    expect(mounted.getMarkdown()).toBe("![Sample Icon](./assets/icon.png)\n");
  });

  it("blocks remote image loading while preserving source Markdown", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "remoteBlocked" });

    const mounted = await mountEditor("![Remote](https://example.com/image.png)");

    await waitFor(() => {
      expect(mounted.view.dom).toHaveTextContent("Remote images are blocked.");
    });

    expect(mounted.view.dom.querySelector(".leafdown-markdown-image")).not.toBeInTheDocument();
    expect(convertFileSrc).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toBe("![Remote](https://example.com/image.png)\n");
  });

  it("requires an inline explicit load before rendering outside-folder images", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ kind: "outsideFolder" })
      .mockResolvedValue({ kind: "renderable", path: "C:\\Other\\outside.png" });

    const mounted = await mountEditor("![Outside](../outside.png)");

    await waitFor(() => {
      expect(mounted.view.dom).toHaveTextContent("Image is outside the current folder.");
    });

    const button = mounted.view.dom.querySelector<HTMLButtonElement>(
      ".leafdown-image-placeholder__action",
    );

    expect(button).toHaveTextContent("Load image");
    fireEvent.click(button as HTMLButtonElement);

    await waitFor(() => {
      expect(mounted.view.dom.querySelector("img[alt='Outside']")).toBeInTheDocument();
    });

    expect(invoke).toHaveBeenLastCalledWith("resolve_markdown_image_target", {
      documentPath: "C:/Notes/readme.md",
      folderContextPath: "C:/Notes",
      target: "../outside.png",
      explicitLoad: true,
    });
    expect(mounted.getMarkdown()).toBe("![Outside](../outside.png)\n");
  });

  it("exposes focused images as editable raw Markdown", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "renderable",
      path: "C:\\Notes\\assets\\icon.png",
    });

    const mounted = await mountEditor("![Alt](./assets/icon.png)");

    await waitFor(() => {
      expect(mounted.view.dom.querySelector("img[alt='Alt']")).toBeInTheDocument();
    });

    const image = mounted.view.dom.querySelector<HTMLImageElement>("img[alt='Alt']");
    fireEvent.mouseDown(image as HTMLImageElement);

    const input = mounted.view.dom.querySelector<HTMLInputElement>(
      ".leafdown-image-markdown-input",
    );

    expect(input).toHaveValue("![Alt](./assets/icon.png)");
    fireEvent.input(input as HTMLInputElement, {
      target: { value: '![Updated](./assets/updated.png "Updated title")' },
    });

    await waitFor(() => {
      expect(mounted.getMarkdown()).toBe('![Updated](./assets/updated.png "Updated title")\n');
    });
  });
});
