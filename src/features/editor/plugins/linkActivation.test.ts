// @vitest-environment happy-dom

import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { openUrl } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";

import { toastManager } from "@/lib/toast";
import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { dispatchClick, dispatchMouseEvent, type TestMouseEventOptions } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { withMacUserAgent, withWindowsUserAgent } from "@/test/utils/platform";
import { dispatchEditorMouseClick } from "@/test/utils/prosemirror";
import { waitFor, within } from "@/test/utils/react";
import {
  countTauriApiCalls,
  getLastTauriApiArgs,
  mockTauriApiCommand,
} from "@/test/utils/tauriApi";

const mountEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const mountLinkEditor = (
  initialMarkdown: string,
  documentPath: string | null = "C:/Notes/readme.md",
  onOpenMarkdownPath?: (path: string) => boolean,
) =>
  mountEditor(initialMarkdown, {
    ...createMarkdownReferenceContext({ documentPath }),
    onOpenMarkdownPath,
  });

const dispatchLinkGesture = (
  mounted: MountedMilkdownEditor,
  link: HTMLElement,
  modifiers: TestMouseEventOptions,
) => {
  const position = mounted.view.posAtDOM(link, 0) + 1;
  vi.spyOn(mounted.view, "posAtCoords").mockReturnValue({
    pos: position,
    inside: mounted.view.state.doc.resolve(position).before(),
  });

  const click = dispatchEditorMouseClick(mounted.view, link, position, {
    ...modifiers,
    clientX: 10,
    clientY: 10,
  });

  expect(link.isConnected).toBe(true);
  expect(mounted.view.state.selection).toBeInstanceOf(TextSelection);
  expect(click).not.toBeNull();
  return click!;
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

  it.each([
    ["auxclick", 1],
    ["auxclick", 2],
    ["click", 1],
  ] as const)("suppresses %s with button %i on rendered links", async (type, button) => {
    const mounted = await mountLinkEditor("[Docs](https://example.com/docs)");
    const link = within(mounted.view.dom).getByRole("link", { name: "Docs" });
    const selectionBefore = mounted.view.state.selection.from;

    const event = dispatchMouseEvent(link, type, { button });

    expect(event.defaultPrevented).toBe(true);
    expect(countTauriApiCalls("resolveMarkdownLinkTarget")).toBe(0);
    expect(openUrl).not.toHaveBeenCalled();
    expect(mounted.view.state.selection.from).toBe(selectionBefore);
    expect(mounted.getMarkdown()).toBe("[Docs](https://example.com/docs)\n");
  });

  it("ignores auxclick away from rendered links", async () => {
    const mounted = await mountLinkEditor("Plain paragraph");

    const event = dispatchMouseEvent(mounted.view.dom, "auxclick", { button: 1 });

    expect(event.defaultPrevented).toBe(false);
  });

  it("activates links on Mod+click without mutating source Markdown", async () => {
    await withWindowsUserAgent(async () => {
      mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({
        kind: "externalWeb",
        url: "https://example.com/docs",
      }));
      const mounted = await mountLinkEditor("[Docs](https://example.com/docs)");
      const link = within(mounted.view.dom).getByRole("link", { name: "Docs" });

      const event = dispatchLinkGesture(mounted, link, { ctrl: true });

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

  it.each([
    ["a mixed-format label", "[Read **the** docs](https://example.com/docs)\n", "the"],
    ["a reference link", "[Docs][docs]\n\n[docs]: https://example.com/docs\n", "Docs"],
    ["a list item", "- Item with [Docs](https://example.com/docs)\n", "Docs"],
    ["a blockquote", "> Quote with [Docs](https://example.com/docs)\n", "Docs"],
    [
      "a table cell",
      "| Docs link                        |\n| -------------------------------- |\n| [Docs](https://example.com/docs) |\n",
      "Docs",
    ],
  ])("activates %s on Mod+click without projecting or selecting it", async (_, markdown, text) => {
    await withWindowsUserAgent(async () => {
      mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({
        kind: "externalWeb",
        url: "https://example.com/docs",
      }));
      const mounted = await mountLinkEditor(markdown);
      const pressed = within(mounted.view.dom).getByText(text);
      const link = pressed.closest("a")!;

      dispatchLinkGesture(mounted, pressed, { ctrl: true });

      await waitFor(() => {
        expect(openUrl).toHaveBeenCalledWith("https://example.com/docs");
      });
      expect(link.isConnected).toBe(true);
      expect(mounted.view.state.selection).not.toBeInstanceOf(NodeSelection);
      expect(mounted.view.dom.querySelector(".ProseMirror-selectednode")).toBeNull();
      expect(mounted.getMarkdown()).toBe(markdown);
    });
  });

  it("opens a local Markdown target on Mod+click through the session", async () => {
    await withWindowsUserAgent(async () => {
      mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({
        kind: "localMarkdown",
        path: "C:/Notes/guide.md",
      }));
      const onOpenMarkdownPath = vi.fn(() => true);
      const mounted = await mountLinkEditor(
        "See [Guide](guide.md) here.",
        "C:/Notes/readme.md",
        onOpenMarkdownPath,
      );
      const link = within(mounted.view.dom).getByRole("link", { name: "Guide" });

      dispatchLinkGesture(mounted, link, { ctrl: true });

      await waitFor(() => {
        expect(onOpenMarkdownPath).toHaveBeenCalledWith("C:/Notes/guide.md");
      });
      expect(openUrl).not.toHaveBeenCalled();
      expect(mounted.getMarkdown()).toBe("See [Guide](guide.md) here.\n");
    });
  });

  it("leaves plain mousedown on a link to the native caret", async () => {
    const mounted = await mountLinkEditor("[Guide](guide.md)");
    const link = within(mounted.view.dom).getByRole("link", { name: "Guide" });

    const event = dispatchMouseEvent(link, "mousedown", { button: 0 });

    expect(event.defaultPrevented).toBe(false);
  });

  it("uses Meta-click as the primary modifier on macOS", async () => {
    await withMacUserAgent(async () => {
      mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({
        kind: "externalWeb",
        url: "https://example.com/docs",
      }));
      const mounted = await mountLinkEditor("[Docs](https://example.com/docs)");
      const link = within(mounted.view.dom).getByRole("link", { name: "Docs" });

      const event = dispatchLinkGesture(mounted, link, { meta: true });

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

      dispatchLinkGesture(mounted, link, { ctrl: true });

      await waitFor(() => {
        expect(toastManager.add).toHaveBeenCalledWith({
          title: "Save the document to resolve this link.",
          type: "warning",
        });
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
