import { fireEvent, waitFor } from "@testing-library/react";
import { TextSelection } from "@milkdown/kit/prose/state";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (
  initialMarkdown: string,
  documentPath: string | null = "C:/Notes/readme.md",
) => {
  const mounted = await mountMilkdownEditor(initialMarkdown, {
    documentPath,
    folderContextPath: "C:/Notes",
    rootClassName: "leafdown-editor",
  });
  mountedEditors.push(mounted);
  return mounted;
};

describe("Markdown links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockReset();
    vi.mocked(confirm).mockResolvedValue(false);
  });

  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("leaves normal link clicks to the editor caret behavior", async () => {
    const mounted = await mountEditor("[Guide](guide.md)");
    const link = mounted.view.dom.querySelector<HTMLAnchorElement>("a[href='guide.md']");

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(TextSelection.create(mounted.view.state.doc, 1)),
    );
    fireEvent.click(link as HTMLAnchorElement);

    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(invoke).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
    expect(mounted.view.state.selection.empty).toBe(true);
    expect(mounted.view.state.selection.from).toBeGreaterThan(1);
    expect(mounted.getMarkdown()).toBe("[Guide](guide.md)\n");
  });

  it("activates links on Mod+click without mutating source Markdown", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "externalWeb",
      url: "https://example.com/docs",
    });
    const mounted = await mountEditor("[Docs](https://example.com/docs)");
    const link = mounted.view.dom.querySelector<HTMLAnchorElement>(
      "a[href='https://example.com/docs']",
    );

    fireEvent.click(link as HTMLAnchorElement, { ctrlKey: true });

    await waitFor(() => {
      expect(openUrl).toHaveBeenCalledWith("https://example.com/docs");
    });
    expect(invoke).toHaveBeenCalledWith("resolve_markdown_link_target", {
      documentPath: "C:/Notes/readme.md",
      folderContextPath: "C:/Notes",
      target: "https://example.com/docs",
      explicitOpen: false,
    });
    expect(mounted.getMarkdown()).toBe("[Docs](https://example.com/docs)\n");
  });

  it("shows a non-disruptive message for relative links from untitled documents", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "untitledRelative" });
    const mounted = await mountEditor("[Guide](guide.md)", null);
    const link = mounted.view.dom.querySelector<HTMLAnchorElement>("a[href='guide.md']");

    fireEvent.click(link as HTMLAnchorElement, { metaKey: true });

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith("Save the document to resolve this link.");
    });
    expect(mounted.getMarkdown()).toBe("[Guide](guide.md)\n");
  });
});
