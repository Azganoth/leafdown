// @vitest-environment happy-dom

import type { EditorView } from "@milkdown/kit/prose/view";
import { describe, expect, it, vi } from "vitest";

import { TWO_PARAGRAPH_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";
import { act, render } from "@/test/utils/react";

const mountEditor = setupMilkdownEditorMount();

const findNodeValueGetter = (node: Node) => {
  for (
    let prototype: object | null = Object.getPrototypeOf(node);
    prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    const property = Object.getOwnPropertyDescriptor(prototype, "nodeValue");

    if (property?.get) {
      return { owner: prototype, get: property.get };
    }
  }

  throw new Error("nodeValue has no getter");
};

const countEditorTextReadsDuringCommit = (view: EditorView, commit: () => void) => {
  const textNode = view.dom.querySelector("p")?.firstChild;

  if (!textNode) {
    throw new Error("editor has no text node");
  }

  const { owner, get } = findNodeValueGetter(textNode);
  let reads = 0;
  const spy = vi.spyOn(owner as Node, "nodeValue", "get").mockImplementation(function (this: Node) {
    if (view.dom.contains(this)) reads += 1;
    return get.call(this) as string | null;
  });

  try {
    act(commit);
  } finally {
    spy.mockRestore();
  }

  return reads;
};

describe("React selection opt-out plugin", () => {
  it("keeps the editable attribute while its property no longer reads as true", async () => {
    const { view } = await mountEditor(TWO_PARAGRAPH_MARKDOWN);

    expect(view.dom).toHaveAttribute("contenteditable", "true");
    expect(view.dom.contentEditable).toBe("inherit");

    view.setProps({ editable: () => false });

    expect(view.dom).toHaveAttribute("contenteditable", "false");
    expect(view.dom.contentEditable).toBe("false");
  });

  it("removes its property when the editor is destroyed", async () => {
    const mounted = await mountEditor(TWO_PARAGRAPH_MARKDOWN);
    const { dom } = mounted.view;

    await mounted.destroy();

    expect(Object.hasOwn(dom, "contentEditable")).toBe(false);
  });

  it("keeps React commits from walking the focused editor's text", async () => {
    const { view } = await mountEditor(TWO_PARAGRAPH_MARKDOWN);
    let count = 0;
    const { rerender } = render(<output>{count}</output>);
    const commit = () => rerender(<output>{++count}</output>);
    view.focus();
    setSelectionAtDocumentEnd(view);

    expect(document.activeElement).toBe(view.dom);
    expect(countEditorTextReadsDuringCommit(view, commit)).toBe(0);

    Reflect.deleteProperty(view.dom, "contentEditable");

    expect(countEditorTextReadsDuringCommit(view, commit)).toBeGreaterThan(0);
  });
});
