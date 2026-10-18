// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { act, render, waitFor } from "@/test/utils/react";

import { MarkdownExamplePreview } from "./markdown-example-preview";

afterEach(() => vi.unstubAllGlobals());

describe("MarkdownExamplePreview", () => {
  it("waits for visibility, renders document syntax read-only, and removes its view", async () => {
    let reveal: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          reveal = () => callback([{ isIntersecting: true }]);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { container, unmount } = render(
      <MarkdownExamplePreview
        source={
          "# A heading\n\n**Strong**\n\n| A | B |\n| - | - |\n| One | Two |\n\n$a^2$\n\n> [!NOTE]\n> A note."
        }
      />,
    );
    expect(container.querySelector(".ProseMirror")).toBeNull();
    act(reveal);
    await waitFor(() => expect(container.querySelector('[data-ready="true"]')).not.toBeNull());
    const editor = container.querySelector(".ProseMirror")!;
    expect(editor).toHaveAttribute("contenteditable", "false");
    expect(editor.querySelector("h1")).toHaveTextContent("A heading");
    expect(editor.querySelector("strong")).toHaveTextContent("Strong");
    expect(editor.querySelector("table")).toHaveTextContent("One");
    expect(editor.querySelector(".katex")).not.toBeNull();
    expect(editor).toHaveTextContent("A note.");
    expect(editor.closest("[inert]")).not.toBeNull();
    unmount();
    expect(editor.isConnected).toBe(false);
    expect(disconnect).toHaveBeenCalled();
  });
});
