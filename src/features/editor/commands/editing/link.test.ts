// @vitest-environment happy-dom

import { open } from "@tauri-apps/plugin-dialog";
import { describe, expect, it, vi } from "vitest";

import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { setupClipboardMock } from "@/test/mocks/clipboard";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  getEditorTextPosition,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "../../plugins/sourceProjection";
import { canRedo, canUndo, redo, undo } from "./history";
import {
  canChooseLinkFile,
  canCopyLinkDestination,
  canRemoveLink,
  chooseLinkFile,
  copyLinkDestination,
  removeLink,
} from "./link";

const mountEditor = setupMilkdownEditorMount({
  ...createMarkdownReferenceContext({ documentPath: "C:\\Notes\\drafts\\plan.md" }),
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const { clipboard } = setupClipboardMock();

const placeCaret = (mounted: MountedMilkdownEditor, text: string, offset = 1) => {
  setTextSelection(mounted.view, getEditorTextPosition(mounted, text) + offset);
};

const readAvailability = ({ view: { state } }: MountedMilkdownEditor) => ({
  choose: canChooseLinkFile(state),
  copy: canCopyLinkDestination(state),
  remove: canRemoveLink(state),
});

const copiedDestination = async (mounted: MountedMilkdownEditor) => {
  await expect(copyLinkDestination(mounted.view)).resolves.toBe(true);

  return clipboard.writeText.mock.lastCall?.[0];
};

const pickFile = (path: string | null) => vi.mocked(open).mockResolvedValueOnce(path);

describe("link actions", () => {
  describe("availability", () => {
    it.each([
      [
        "an inline link",
        "See [the plan](plan.md) now\n",
        "the plan",
        { copy: true, remove: true, choose: true },
      ],
      [
        "a reference link",
        "See [the plan][ref] now\n\n[ref]: plan.md\n",
        "the plan",
        { copy: true, remove: true, choose: false },
      ],
      [
        "a collapsed reference",
        "See [plan][] now\n\n[plan]: plan.md\n",
        "plan",
        { copy: true, remove: true, choose: false },
      ],
      [
        "a URI autolink",
        "See <https://example.com> now\n",
        "example",
        { copy: true, remove: false, choose: false },
      ],
      [
        "a bare autolink",
        "See https://example.com now\n",
        "example",
        { copy: true, remove: false, choose: false },
      ],
      [
        "a link labelled with its own destination",
        "See [https://example.com](https://example.com) now\n",
        "example",
        { copy: true, remove: false, choose: false },
      ],
      ["a wiki link", "See [[Plan]] now\n", "See ", { copy: true, remove: true, choose: false }],
    ])("matches the action table for %s", async (_name, markdown, text, expected) => {
      const mounted = await mountEditor(markdown);

      placeCaret(mounted, text, text === "See " ? 4 : 1);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(readAvailability(mounted)).toEqual(expected);
    });

    it("offers nothing outside a link or for a selection crossing its edge", async () => {
      const mounted = await mountEditor("See [the plan](plan.md) now\n");

      placeCaret(mounted, "See", 0);

      expect(readAvailability(mounted)).toEqual({ copy: false, remove: false, choose: false });

      const start = getEditorTextPosition(mounted, "See");

      setTextSelection(mounted.view, start, getEditorTextPosition(mounted, "the plan") + 3);

      expect(readAvailability(mounted)).toEqual({ copy: false, remove: false, choose: false });
    });

    it("follows the link a projected source spells and drops incomplete source", async () => {
      const mounted = await mountEditor("See [the plan](plan.md) now\n");

      placeCaret(mounted, "the plan");

      const destination = getEditorTextPosition(mounted, "plan.md");

      mounted.view.dispatch(mounted.view.state.tr.insertText("other-", destination));

      expect(await copiedDestination(mounted)).toBe("other-plan.md");

      const closing = getEditorTextPosition(mounted, ".md)") + 3;

      mounted.view.dispatch(mounted.view.state.tr.delete(closing, closing + 1));

      expect(readAvailability(mounted)).toEqual({ copy: false, remove: false, choose: false });
    });
  });

  describe("copy destination", () => {
    it.each([
      [
        "an inline link with a fragment and title",
        'A [label](../notes/plan.md#next-steps "Plan") b\n',
        "label",
        "../notes/plan.md#next-steps",
      ],
      ["a missing relative target", "A [label](missing/file.md) b\n", "label", "missing/file.md"],
      ["an angle-bracket destination", "A [label](<my plan.md>) b\n", "label", "my plan.md"],
      [
        "a reference link",
        'A [label][ref] b\n\n[ref]: https://example.com/a "Title"\n',
        "label",
        "https://example.com/a",
      ],
      ["a URI autolink", "A <https://example.com/b> c\n", "example", "https://example.com/b"],
      ["a bare www autolink", "A www.example.com c\n", "example", "http://www.example.com"],
      ["a bare email autolink", "A team@example.com c\n", "example", "mailto:team@example.com"],
      [
        "a wiki link with a heading and alias",
        "A [[Plan#Next steps|the next steps]] b\n",
        "A ",
        "Plan#Next steps",
      ],
      ["a wiki link to a heading in its own document", "A [[#Goals]] b\n", "A ", "#Goals"],
    ])("copies the destination of %s", async (_name, markdown, text, expected) => {
      const mounted = await mountEditor(markdown);

      placeCaret(mounted, text, text === "A " ? 2 : 1);

      expect(await copiedDestination(mounted)).toBe(expected);
      expect(mounted.getMarkdown()).toBe(markdown);
      expect(canUndo(mounted.view.state)).toBe(false);
    });
  });

  describe("remove link", () => {
    it("keeps a formatted label as one undoable change", async () => {
      const original = 'A [**bold** and `code` label](plan.md "Plan") b\n';
      const mounted = await mountEditor(original);

      placeCaret(mounted, "and");

      expect(removeLink(mounted.view)).toBe(true);

      const removed = "A **bold** and `code` label b\n";

      expect(mounted.getMarkdown()).toBe(removed);
      expect(undo(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe(original);
      expect(canUndo(mounted.view.state)).toBe(false);
      expect(redo(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe(removed);
      expect(canRedo(mounted.view.state)).toBe(false);
    });

    it("keeps a link's surrounding formatting and a selection inside its label", async () => {
      const mounted = await mountEditor("A *[slanted label](plan.md)* b\n");
      const start = getEditorTextPosition(mounted, "slanted");

      setTextSelection(mounted.view, start + 1, start + 5);

      expect(removeLink(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe("A *slanted label* b\n");
    });

    it("leaves a shared definition and its other references", async () => {
      const mounted = await mountEditor(
        "First [one][ref] and [two][ref]\n\n[ref]: https://example.com\n",
      );

      placeCaret(mounted, "one");

      expect(removeLink(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe(
        "First one and [two][ref]\n\n[ref]: https://example.com\n",
      );
    });

    it("turns a wiki link into the label it showed", async () => {
      const aliased = await mountEditor("A [[Plan#Next|the next steps]] b\n");

      placeCaret(aliased, "A ", 2);

      expect(removeLink(aliased.view)).toBe(true);
      expect(aliased.getMarkdown()).toBe("A the next steps b\n");

      const plain = await mountEditor("A [[Plan]] b\n");

      placeCaret(plain, "A ", 2);

      expect(removeLink(plain.view)).toBe(true);
      expect(plain.getMarkdown()).toBe("A Plan b\n");
      expect(undo(plain.view)).toBe(true);
      expect(plain.getMarkdown()).toBe("A [[Plan]] b\n");
    });

    it.each([
      ["an inline link", "See [the plan](plan.md) now\n", "the plan", "See the plan now\n"],
      [
        "a shortcut reference",
        "See [plan] now\n\n[plan]: plan.md\n",
        "plan",
        "See plan now\n\n[plan]: plan.md\n",
      ],
      ["a wiki link", "See [[Plan]] now\n", "See ", "See Plan now\n"],
    ])("stays removed once %s is saved and read back", async (_name, markdown, text, expected) => {
      const mounted = await mountEditor(markdown);

      placeCaret(mounted, text, text === "See " ? 4 : 1);

      expect(removeLink(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe(expected);

      const reopened = await mountEditor(expected);

      placeCaret(reopened, "See", 5);

      expect(reopened.getMarkdown()).toBe(expected);
      expect(readAvailability(reopened)).toEqual({ copy: false, remove: false, choose: false });
    });

    it("drops the destination of a label that spells a web address of its own", async () => {
      const mounted = await mountEditor("A [https://example.com](https://other.example) b\n");

      placeCaret(mounted, "example.com", 0);

      expect(removeLink(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe("A https://example.com b\n");

      // A web address in text is read as an autolink literal, which no escape prevents.
      const reopened = await mountEditor(mounted.getMarkdown());

      placeCaret(reopened, "example.com", 0);

      expect(await copiedDestination(reopened)).toBe("https://example.com");
    });

    it("keeps a linked image", async () => {
      const mounted = await mountEditor("A [![leaf](leaf.png)](https://example.com) b\n");
      const image = getEditorNodePosition(mounted, "image");

      setTextSelection(mounted.view, image, image + 1);

      expect(await copiedDestination(mounted)).toBe("https://example.com");
      expect(removeLink(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe("A ![leaf](leaf.png) b\n");
    });

    it("leaves an autolink alone", async () => {
      const mounted = await mountEditor("A <https://example.com> b\n");

      placeCaret(mounted, "example");

      expect(removeLink(mounted.view)).toBe(false);
      expect(mounted.getMarkdown()).toBe("A <https://example.com> b\n");
    });
  });

  describe("choose file", () => {
    it("replaces the whole destination relative to the document as one undoable change", async () => {
      const original = 'A [**the** plan](old.md#part "Plan") b\n';
      const mounted = await mountEditor(original);

      placeCaret(mounted, "plan");
      pickFile("C:\\Notes\\shared\\next plan.md");

      await expect(chooseLinkFile(mounted.editor)).resolves.toBe(true);

      const chosen = 'A [**the** plan](<../shared/next plan.md> "Plan") b\n';

      expect(open).toHaveBeenLastCalledWith(
        expect.objectContaining({
          defaultPath: "C:/Notes/drafts",
          directory: false,
          multiple: false,
        }),
      );
      expect(mounted.getMarkdown()).toBe(chosen);
      expect(undo(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe(original);
      expect(redo(mounted.view)).toBe(true);
      expect(mounted.getMarkdown()).toBe(chosen);
    });

    it("names a file on another root, or from an untitled document, by its absolute path", async () => {
      const saved = await mountEditor("A [plan](old.md) b\n");

      placeCaret(saved, "plan");
      pickFile("D:\\Archive\\plan.md");

      await expect(chooseLinkFile(saved.editor)).resolves.toBe(true);
      expect(saved.getMarkdown()).toBe("A [plan](D:/Archive/plan.md) b\n");

      const untitled = await mountEditor("A [plan](old.md) b\n", { documentPath: null });

      placeCaret(untitled, "plan");
      pickFile("C:\\Notes\\plan.md");

      await expect(chooseLinkFile(untitled.editor)).resolves.toBe(true);
      expect(untitled.getMarkdown()).toBe("A [plan](C:/Notes/plan.md) b\n");
    });

    it("points the link a projected source edit spells at the chosen file", async () => {
      const mounted = await mountEditor("A [plan](old.md) b\n");

      placeCaret(mounted, "plan");
      mounted.view.dispatch(
        mounted.view.state.tr.insertText("next ", getEditorTextPosition(mounted, "plan")),
      );
      pickFile("C:\\Notes\\drafts\\new.md");

      await expect(chooseLinkFile(mounted.editor)).resolves.toBe(true);
      expect(mounted.getMarkdown()).toBe("A [next plan](new.md) b\n");
    });

    it("leaves the document as it was when the picker is cancelled or fails", async () => {
      const original = "A [plan](old.md) b\n";
      const mounted = await mountEditor(original);

      placeCaret(mounted, "plan");
      pickFile(null);

      await expect(chooseLinkFile(mounted.editor)).resolves.toBe(false);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(mounted.getMarkdown()).toBe(original);

      vi.mocked(open).mockRejectedValueOnce(new Error("Dialog unavailable"));

      await expect(chooseLinkFile(mounted.editor)).rejects.toThrow("Dialog unavailable");
      expect(mounted.getMarkdown()).toBe(original);
      expect(canUndo(mounted.view.state)).toBe(false);
    });

    it("leaves a document that changed while the picker was open", async () => {
      const mounted = await mountEditor("A [plan](old.md) b\n");
      let resolvePick: (path: string) => void = () => {};

      placeCaret(mounted, "plan");
      vi.mocked(open).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePick = resolve;
        }),
      );

      const choosing = chooseLinkFile(mounted.editor);

      mounted.view.dispatch(mounted.view.state.tr.insertText("New ", 1));
      resolvePick("C:\\Notes\\drafts\\new.md");

      await expect(choosing).resolves.toBe(false);
      expect(mounted.getMarkdown()).toBe("New A [plan](old.md) b\n");
    });

    it("is not offered for a reference link or a wiki link", async () => {
      const reference = await mountEditor("A [plan][ref] b\n\n[ref]: old.md\n");

      placeCaret(reference, "plan");

      await expect(chooseLinkFile(reference.editor)).resolves.toBe(false);
      expect(open).not.toHaveBeenCalled();
    });
  });
});
