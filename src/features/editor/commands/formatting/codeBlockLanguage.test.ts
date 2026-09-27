// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getEditorTextPosition, setTextSelection } from "@/test/utils/prosemirror";

import {
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
} from "../../plugins/blockSelection";
import type { CodeBlockLanguageRequest } from "../../plugins/codeBlockLanguage";
import { getEditorDocumentStatus } from "../../utils/documentStatus";
import { canRedo, canUndo, redo, undo } from "../editing/history";
import {
  applyCodeBlockLanguage,
  canEditCodeBlockLanguage,
  closeCodeBlockLanguage,
  editCodeBlockLanguage,
  normalizeCodeBlockLanguage,
} from "./codeBlockLanguage";

const mountEditor = setupMilkdownEditorMount();

const mountWithRequests = async (markdown: string) => {
  const requests: CodeBlockLanguageRequest[] = [];
  const onClose = vi.fn();
  const mounted = await mountEditor(markdown, {
    onCodeBlockLanguageClosed: onClose,
    onCodeBlockLanguageRequested: (request) => requests.push(request),
  });

  return { mounted, onClose, requests };
};

const placeCaret = (mounted: MountedMilkdownEditor, text: string) => {
  setTextSelection(mounted.view, getEditorTextPosition(mounted, text));
};

const openAt = (
  mounted: MountedMilkdownEditor,
  requests: CodeBlockLanguageRequest[],
  text: string,
) => {
  placeCaret(mounted, text);

  expect(editCodeBlockLanguage(mounted.view)).toBe(true);

  const request = requests.at(-1);

  if (!request) {
    throw new Error("Expected the command to request the language popover.");
  }

  return request;
};

const withProse = (block: string) => `Intro\n\n${block}\n\nOutro\n`;

describe("code block language availability", () => {
  it.each([
    ["the content of a fenced block", "```js\ncode\n```", "code", true],
    ["a fenced block without a language", "```\ncode\n```", "code", true],
    ["indented code, which has no fence line", "    code", "code", false],
    ["a paragraph", "```js\ncode\n```", "Outro", false],
  ])("is %s: %s", async (_, block, text, expected) => {
    const mounted = await mountEditor(withProse(block));

    placeCaret(mounted, text);

    expect(canEditCodeBlockLanguage(mounted.view.state)).toBe(expected);
  });

  it("is unavailable for a selection reaching out of the block", async () => {
    const mounted = await mountEditor(withProse("```js\ncode\n```"));

    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "code"),
      getEditorTextPosition(mounted, "Outro") + 2,
    );

    expect(canEditCodeBlockLanguage(mounted.view.state)).toBe(false);
  });

  it("is available for a block selection of one code block and nothing else", async () => {
    const mounted = await mountEditor(withProse("```js\ncode\n```"));
    const targets = getSelectableBlockTargets(mounted.view.state.doc);
    const code = targets.find(({ node }) => node.type.name === "code_block");
    const outro = targets.at(-1);
    const select = (from: number, to = from) =>
      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(
          createHierarchicalBlockSelection(mounted.view.state.doc, from, to),
        ),
      );

    select(code!.pos);
    expect(canEditCodeBlockLanguage(mounted.view.state)).toBe(true);

    select(code!.pos, outro!.pos);
    expect(canEditCodeBlockLanguage(mounted.view.state)).toBe(false);
  });
});

describe("code block language edits", () => {
  it("requests the popover with the block's language and metadata without changing the document", async () => {
    const { mounted, requests } = await mountWithRequests(withProse('```js title="x"\ncode\n```'));
    const before = mounted.view.state.doc;
    const request = openAt(mounted, requests, "code");

    expect(request).toMatchObject({ language: "js", meta: 'title="x"', document: before });
    expect(mounted.view.state.doc).toBe(before);
    expect(canUndo(mounted.view.state)).toBe(false);
  });

  it.each([
    ["sets a language", "```\ncode\n```", "ts", "```ts\ncode\n```"],
    ["changes a known language", "```js\ncode\n```", "rust", "```rust\ncode\n```"],
    [
      "keeps an identifier Leafdown does not highlight",
      "```js\ncode\n```",
      "zig",
      "```zig\ncode\n```",
    ],
    ["trims the surrounding spaces", "```js\ncode\n```", "  ts  ", "```ts\ncode\n```"],
    [
      "keeps the metadata and the spacing around it",
      '```  js   title="x" {1}\ncode\n```',
      "ts",
      '```  ts   title="x" {1}\ncode\n```',
    ],
    ["keeps the tilde fence and its length", "~~~~js\ncode\n~~~~", "ts", "~~~~ts\ncode\n~~~~"],
    ["clears a language", "```js\ncode\n```", "", "```\ncode\n```"],
    ["clears the metadata with the language", '```js title="x"\ncode\n```', "", "```\ncode\n```"],
  ])("%s", async (_, block, language, expected) => {
    const { mounted, requests } = await mountWithRequests(withProse(block));
    const request = openAt(mounted, requests, "code");

    expect(applyCodeBlockLanguage(mounted.view, request, language)).toBe(true);
    expect(mounted.getMarkdown()).toBe(withProse(expected));
  });

  it("encodes a backtick a backtick fence's info string cannot hold", async () => {
    const { mounted, requests } = await mountWithRequests(withProse("```\ncode\n```"));
    const request = openAt(mounted, requests, "code");

    expect(applyCodeBlockLanguage(mounted.view, request, "a`b")).toBe(true);

    const written = mounted.getMarkdown();
    const reopened = await mountEditor(written);

    expect(written).toBe(withProse("```a&#x60;b\ncode\n```"));
    expect(reopened.view.state.doc.child(1).attrs.language).toBe("a`b");
  });

  it("updates the badge and the status bar's block path", async () => {
    const { mounted, requests } = await mountWithRequests(withProse("```js\ncode\n```"));
    const request = openAt(mounted, requests, "code");

    applyCodeBlockLanguage(mounted.view, request, "zig");

    expect(mounted.view.dom.querySelector("pre[data-language='zig']")).toHaveTextContent("code");
    expect(getEditorDocumentStatus(mounted.view.state).blockPath).toEqual(["Code block · zig"]);
  });

  it("is one Undo step that Redo reapplies, keeping the metadata throughout", async () => {
    const source = withProse('```js title="x"\ncode\n```');
    const { mounted, requests } = await mountWithRequests(source);
    const request = openAt(mounted, requests, "code");

    applyCodeBlockLanguage(mounted.view, request, "");

    expect(undo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(source);
    expect(canUndo(mounted.view.state)).toBe(false);

    expect(redo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(withProse("```\ncode\n```"));
    expect(canRedo(mounted.view.state)).toBe(false);
  });

  it("refuses a language holding a space, which would reopen as metadata", async () => {
    const { mounted, requests } = await mountWithRequests(withProse("```js\ncode\n```"));
    const before = mounted.view.state.doc;
    const request = openAt(mounted, requests, "code");

    expect(normalizeCodeBlockLanguage("type script")).toBeNull();
    expect(applyCodeBlockLanguage(mounted.view, request, "type script")).toBe(false);
    expect(mounted.view.state.doc).toBe(before);
  });

  it("closes without a transaction when the language is unchanged", async () => {
    const { mounted, onClose, requests } = await mountWithRequests(withProse("```js\ncode\n```"));
    const before = mounted.view.state.doc;
    const request = openAt(mounted, requests, "code");

    expect(applyCodeBlockLanguage(mounted.view, request, "js")).toBe(true);
    expect(mounted.view.state.doc).toBe(before);
    expect(canUndo(mounted.view.state)).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("changes nothing when cancelled", async () => {
    const source = withProse("```js\ncode\n```");
    const { mounted, onClose, requests } = await mountWithRequests(source);
    const before = mounted.view.state.doc;

    openAt(mounted, requests, "code");

    expect(closeCodeBlockLanguage(mounted.view)).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mounted.view.state.doc).toBe(before);
    expect(mounted.getMarkdown()).toBe(source);
    expect(canUndo(mounted.view.state)).toBe(false);
  });

  it.each([
    [
      "an edit after the block, which leaves its position standing",
      (mounted: MountedMilkdownEditor) =>
        mounted.view.dispatch(
          mounted.view.state.tr.insertText("New ", getEditorTextPosition(mounted, "Outro")),
        ),
    ],
    [
      "deleting the block",
      (mounted: MountedMilkdownEditor) => {
        const code = getSelectableBlockTargets(mounted.view.state.doc).find(
          ({ node }) => node.type.name === "code_block",
        )!;

        mounted.view.dispatch(
          mounted.view.state.tr.delete(code.pos, code.pos + code.node.nodeSize),
        );
      },
    ],
  ])(
    "retires the request after %s, so the staged language applies to no block",
    async (_, edit) => {
      const { mounted, onClose, requests } = await mountWithRequests(
        withProse("```js\ncode\n```\n\n```rust\nother\n```"),
      );
      const request = openAt(mounted, requests, "code");

      edit(mounted);

      const edited = mounted.getMarkdown();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(applyCodeBlockLanguage(mounted.view, request, "ts")).toBe(false);
      expect(mounted.getMarkdown()).toBe(edited);
    },
  );
});
