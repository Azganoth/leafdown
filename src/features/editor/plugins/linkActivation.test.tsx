import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { describe, expect, it } from "vitest";

import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { dispatchClick } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { withMacUserAgent, withWindowsUserAgent } from "@/test/utils/platform";
import { waitFor, within } from "@/test/utils/react";
import {
  countTauriApiCalls,
  getLastTauriApiArgs,
  mockTauriApiCommand,
} from "@/test/utils/tauriApi";

const mountEditor = setupMilkdownEditorMount();

const mountLinkEditor = (
  initialMarkdown: string,
  documentPath: string | null = "C:/Notes/readme.md",
) => {
  const markdownReferenceContext = createMarkdownReferenceContext({ documentPath });

  return mountEditor(initialMarkdown, {
    ...markdownReferenceContext,
    rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
  });
};

describe("Markdown links", () => {
  it("places the caret for normal link clicks without activating links", async () => {
    const mounted = await mountLinkEditor("[Guide](guide.md)");
    const link = within(mounted.view.dom).getByRole("link", { name: "Guide" });

    const event = dispatchClick(link);

    expect(event.defaultPrevented).toBe(true);
    expect(countTauriApiCalls("resolveMarkdownLinkTarget")).toBe(0);
    expect(openUrl).not.toHaveBeenCalled();
    expect(mounted.view.state.selection.empty).toBe(true);
    expect(mounted.view.state.selection.from).toBeGreaterThan(1);
    expect(mounted.getMarkdown()).toBe("[Guide](guide.md)\n");
  });

  it("activates links on Mod+click without mutating source Markdown", async () => {
    await withWindowsUserAgent(async () => {
      mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({
        kind: "externalWeb",
        url: "https://example.com/docs",
      }));
      const mounted = await mountLinkEditor("[Docs](https://example.com/docs)");
      const link = within(mounted.view.dom).getByRole("link", { name: "Docs" });

      const event = dispatchClick(link, { ctrl: true });

      await waitFor(() => {
        expect(openUrl).toHaveBeenCalledWith("https://example.com/docs");
      });
      expect(event.defaultPrevented).toBe(true);
      expect(getLastTauriApiArgs("resolveMarkdownLinkTarget")).toEqual({
        ...createMarkdownReferenceContext(),
        allowOutsideFolder: false,
        target: "https://example.com/docs",
      });
      expect(mounted.getMarkdown()).toBe("[Docs](https://example.com/docs)\n");
    });
  });

  it("uses Meta-click as the primary modifier on macOS", async () => {
    await withMacUserAgent(async () => {
      mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({
        kind: "externalWeb",
        url: "https://example.com/docs",
      }));
      const mounted = await mountLinkEditor("[Docs](https://example.com/docs)");
      const link = within(mounted.view.dom).getByRole("link", { name: "Docs" });

      const event = dispatchClick(link, { meta: true });

      await waitFor(() => {
        expect(openUrl).toHaveBeenCalledWith("https://example.com/docs");
      });
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("shows a non-disruptive message for relative links from untitled documents", async () => {
    await withWindowsUserAgent(async () => {
      mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({ kind: "untitledRelative" }));
      const mounted = await mountLinkEditor("[Guide](guide.md)", null);
      const link = within(mounted.view.dom).getByRole("link", { name: "Guide" });

      dispatchClick(link, { ctrl: true });

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith("Save the document to resolve this link.");
      });
      expect(mounted.getMarkdown()).toBe("[Guide](guide.md)\n");
    });
  });

  it("does not activate links for non-primary modifier clicks", async () => {
    await withWindowsUserAgent(async () => {
      const mounted = await mountLinkEditor("[Guide](guide.md)");
      const link = within(mounted.view.dom).getByRole("link", { name: "Guide" });

      const event = dispatchClick(link, { meta: true });

      expect(event.defaultPrevented).toBe(true);
      expect(countTauriApiCalls("resolveMarkdownLinkTarget")).toBe(0);
      expect(openUrl).not.toHaveBeenCalled();
      expect(mounted.getMarkdown()).toBe("[Guide](guide.md)\n");
    });
  });
});
