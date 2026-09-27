// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getEditorTextPosition, setTextSelection } from "@/test/utils/prosemirror";

import { applyCodeBlockLanguage } from "../commands/formatting/codeBlockLanguage";
import type { CodeBlockLanguageRequest } from "./codeBlockLanguage";

const mountEditor = setupMilkdownEditorMount();

const badgeOf = (mounted: MountedMilkdownEditor, index = 0) =>
  mounted.view.dom.querySelectorAll<HTMLButtonElement>("pre > [data-leafdown-code-language]")[
    index
  ];

const withProse = (block: string) => `Intro\n\n${block}\n\nOutro\n`;

describe("code block language badge", () => {
  it("names a block's language on a badge outside the editable code", async () => {
    const mounted = await mountEditor(withProse("```js\ncode\n```"));
    const badge = badgeOf(mounted);
    const pre = badge.parentElement!;

    expect(pre).toHaveAttribute("data-language", "js");
    expect(badge).toHaveTextContent("js");
    expect(badge).toHaveAccessibleName("Code block language: js");
    expect(badge).toHaveAttribute("contenteditable", "false");
    expect(badge.tabIndex).toBe(-1);
    expect(pre.querySelector("code")).toHaveTextContent(/^code$/u);
  });

  it("offers a language for a block without one, marking the block the caret is in", async () => {
    const mounted = await mountEditor(withProse("```\ncode\n```"));
    const badge = badgeOf(mounted);
    const pre = badge.parentElement!;

    expect(pre).not.toHaveAttribute("data-language");
    expect(badge).toHaveTextContent("Language");
    expect(badge).toHaveAccessibleName("Set code block language");

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "code"));
    expect(pre).toHaveClass("leafdown-code-block--active");

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Outro"));
    expect(pre).not.toHaveClass("leafdown-code-block--active");
  });

  it("hides the badge on indented code, which has no fence line to name a language on", async () => {
    const mounted = await mountEditor(withProse("    code"));

    expect(badgeOf(mounted).hidden).toBe(true);
  });

  it("opens the picker for its own block without moving the selection", async () => {
    const requests: CodeBlockLanguageRequest[] = [];
    const mounted = await mountEditor(
      withProse('```js title="x"\nfirst\n```\n\n```rust\nsecond\n```'),
      {
        onCodeBlockLanguageRequested: (request) => requests.push(request),
      },
    );
    const before = mounted.view.state;

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Outro"));

    const selection = mounted.view.state.selection;
    const badge = badgeOf(mounted, 1);
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });

    badge.dispatchEvent(mouseDown);
    badge.click();

    expect(mouseDown.defaultPrevented).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ anchor: badge, language: "rust", meta: "" });
    expect(mounted.view.state.selection.eq(selection)).toBe(true);
    expect(mounted.view.state.doc).toBe(before.doc);
    expect(badge.parentElement).toHaveClass("leafdown-code-block--active");
  });

  it("follows a language change", async () => {
    let request: CodeBlockLanguageRequest | undefined;
    const mounted = await mountEditor(withProse("```js\ncode\n```"), {
      onCodeBlockLanguageRequested: (next) => {
        request = next;
      },
    });

    badgeOf(mounted).click();
    applyCodeBlockLanguage(mounted.view, request!, "");

    expect(badgeOf(mounted)).toHaveTextContent("Language");
    expect(badgeOf(mounted).parentElement).not.toHaveAttribute("data-language");
  });

  it("stays out of the saved Markdown and the copied HTML", async () => {
    const mounted = await mountEditor(withProse("```js\ncode\n```"));

    setTextSelection(mounted.view, 1, mounted.view.state.doc.content.size - 1);

    const copied = mounted.view.serializeForClipboard(mounted.view.state.selection.content());

    expect(mounted.getMarkdown()).toBe(withProse("```js\ncode\n```"));
    expect(copied.dom.querySelector("[data-leafdown-code-language]")).toBeNull();
    expect(copied.dom.querySelector("pre")?.textContent).toBe("code");
  });
});
