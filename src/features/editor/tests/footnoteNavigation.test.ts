// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { dispatchClick } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { withWindowsUserAgent } from "@/test/utils/platform";
import { getEditorNodePosition, setTextSelection } from "@/test/utils/prosemirror";

import { EDITOR_COMMANDS } from "../commands";
import { findFootnoteDefinitions } from "../utils/footnoteDefinitions";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const DOCUMENT = "Body[^note].\n\n[^note]: The definition body.";

// A file never opens holding a reference no definition answers to: remark reads one as literal
// text. The state is reached from inside the session, by taking the definition a reference names
// away from it.
const orphanReference = (view: MountedMilkdownEditor["view"]) => {
  const [definition] = findFootnoteDefinitions(view.state.doc);

  view.dispatch(view.state.tr.delete(definition.pos, definition.pos + definition.node.nodeSize));
};

const getReferenceElement = (dom: Element, label = "note") => {
  const reference = dom.querySelector(`sup[data-type="footnote_reference"][data-label="${label}"]`);

  expect(reference).not.toBeNull();

  return reference!;
};

describe("footnote definition navigation", () => {
  it("moves the selection into the definition on a modifier click", async () => {
    const mounted = await mountEditor(DOCUMENT);

    await withWindowsUserAgent(() => {
      const event = dispatchClick(getReferenceElement(mounted.view.dom), { ctrl: true });

      expect(event.defaultPrevented).toBe(true);
    });

    const { $from } = mounted.view.state.selection;

    expect($from.parent.textContent).toBe("The definition body.");
    expect($from.parentOffset).toBe(0);
  });

  it("leaves a plain click to the reference's own source projection", async () => {
    const mounted = await mountEditor(DOCUMENT);

    await withWindowsUserAgent(() => {
      const event = dispatchClick(getReferenceElement(mounted.view.dom));

      expect(event.defaultPrevented).toBe(false);
    });

    expect(mounted.getMarkdown()).toBe(`${DOCUMENT}\n`);
  });

  it("navigates from every reference sharing a label to the one definition", async () => {
    const mounted = await mountEditor("One[^note] and two[^note].\n\n[^note]: Shared body.");
    const references = mounted.view.dom.querySelectorAll(
      'sup[data-type="footnote_reference"][data-label="note"]',
    );

    expect(references).toHaveLength(2);

    const reached: number[] = [];

    for (const reference of references) {
      await withWindowsUserAgent(() => dispatchClick(reference, { ctrl: true }));
      reached.push(mounted.view.state.selection.from);
    }

    expect(reached[0]).toBe(reached[1]);
  });

  it("does not navigate from a reference whose definition is gone", async () => {
    const mounted = await mountEditor(DOCUMENT);

    orphanReference(mounted.view);

    const selectionBefore = mounted.view.state.selection.from;

    await withWindowsUserAgent(() => {
      const event = dispatchClick(getReferenceElement(mounted.view.dom), { ctrl: true });

      expect(event.defaultPrevented).toBe(true);
    });

    expect(mounted.view.state.selection.from).toBe(selectionBefore);
  });

  it("leaves the document, its dirty state, and its history untouched", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(DOCUMENT, { onContentChanged });

    await withWindowsUserAgent(() =>
      dispatchClick(getReferenceElement(mounted.view.dom), { ctrl: true }),
    );

    expect(mounted.getMarkdown()).toBe(`${DOCUMENT}\n`);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(EDITOR_COMMANDS["edit.undo"].canRun(mounted.view.state)).toBe(false);
  });
});

describe("jump to footnote definition command", () => {
  it("is available and jumps while the caret reads a defined reference", async () => {
    const mounted = await mountEditor(DOCUMENT);

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "footnote_reference") + 1);

    expect(EDITOR_COMMANDS["edit.jumpToFootnoteDefinition"].canRun(mounted.view.state)).toBe(true);
    expect(EDITOR_COMMANDS["edit.jumpToFootnoteDefinition"].run(mounted.editor)).toBe(true);
    expect(mounted.view.state.selection.$from.parent.textContent).toBe("The definition body.");
  });

  it("is unavailable where the caret reads no reference", async () => {
    const mounted = await mountEditor(DOCUMENT);

    setTextSelection(mounted.view, 2);

    expect(EDITOR_COMMANDS["edit.jumpToFootnoteDefinition"].canRun(mounted.view.state)).toBe(false);
  });

  it("is unavailable for a reference whose definition is gone", async () => {
    const mounted = await mountEditor(DOCUMENT);

    orphanReference(mounted.view);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "footnote_reference") + 1);

    expect(EDITOR_COMMANDS["edit.jumpToFootnoteDefinition"].canRun(mounted.view.state)).toBe(false);
  });
});
