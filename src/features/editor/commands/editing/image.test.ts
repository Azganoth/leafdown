// @vitest-environment happy-dom

import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  getEditorTextPosition,
  setTextSelection,
} from "@/test/utils/prosemirror";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import {
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
} from "../../plugins/blockSelection";
import {
  hasActiveSourceProjection,
  SOURCE_PROJECTION_IMAGE_POINTER_ENTRY_META,
} from "../../plugins/sourceProjection";
import { redo, undo } from "./history";
import { canReplaceImage, replaceImage } from "./image";

const mountEditor = setupMilkdownEditorMount({
  ...createMarkdownReferenceContext({ documentPath: "C:\\Notes\\drafts\\plan.md" }),
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const projectImage = (mounted: MountedMilkdownEditor) => {
  const position = getEditorNodePosition(mounted, "image");

  mounted.view.dispatch(
    mounted.view.state.tr
      .setSelection(NodeSelection.create(mounted.view.state.doc, position))
      .setMeta(SOURCE_PROJECTION_IMAGE_POINTER_ENTRY_META, true),
  );
};

const selectImage = (mounted: MountedMilkdownEditor) => {
  const position = getEditorNodePosition(mounted, "image");

  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(
      TextSelection.create(mounted.view.state.doc, position, position + 1),
    ),
  );
};

const selectBlockAt = (mounted: MountedMilkdownEditor, text: string) => {
  const position = getEditorTextPosition(mounted, text);
  const target = getSelectableBlockTargets(mounted.view.state.doc).findLast(
    ({ pos, node }) => pos < position && position <= pos + node.nodeSize,
  );

  if (!target) {
    throw new Error(`Expected a block holding ${text}.`);
  }

  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(
      createHierarchicalBlockSelection(mounted.view.state.doc, target.pos),
    ),
  );
};

const pickFile = (path: string | null) => vi.mocked(open).mockResolvedValueOnce(path);

describe("image replacement", () => {
  beforeEach(() => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));
  });

  describe("availability", () => {
    it("is available while an image's source is projected", async () => {
      const mounted = await mountEditor("Before ![leaf](leaf.png) after\n");

      projectImage(mounted);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(canReplaceImage(mounted.view.state)).toBe(true);
    });

    it("is available for a selection of exactly one image", async () => {
      const mounted = await mountEditor("Before ![leaf](leaf.png) after\n");
      const position = getEditorNodePosition(mounted, "image");

      selectImage(mounted);

      expect(canReplaceImage(mounted.view.state)).toBe(true);

      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(
          TextSelection.create(mounted.view.state.doc, position - 1, position + 1),
        ),
      );

      expect(canReplaceImage(mounted.view.state)).toBe(false);
    });

    it("is available for a selected block holding nothing but an image", async () => {
      const mounted = await mountEditor("![leaf](leaf.png)\n\nText ![oak](oak.png)\n");

      selectBlockAt(mounted, "Text");

      expect(canReplaceImage(mounted.view.state)).toBe(false);

      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(
          createHierarchicalBlockSelection(mounted.view.state.doc, 0),
        ),
      );

      expect(canReplaceImage(mounted.view.state)).toBe(true);
    });

    it("is unavailable in text, for a linked image, and for a reference image", async () => {
      const plain = await mountEditor("Text ![leaf](leaf.png)\n");

      setTextSelection(plain.view, getEditorTextPosition(plain, "Text"));

      expect(canReplaceImage(plain.view.state)).toBe(false);

      const linked = await mountEditor("[![leaf](leaf.png) more](https://example.com)\n");

      selectImage(linked);

      expect(canReplaceImage(linked.view.state)).toBe(false);

      const reference = await mountEditor("![leaf][ref]\n\n[ref]: leaf.png\n");

      selectImage(reference);

      expect(canReplaceImage(reference.view.state)).toBe(false);

      projectImage(reference);

      expect(canReplaceImage(reference.view.state)).toBe(false);
    });
  });

  it("names a picked file relative to the document as one undoable change", async () => {
    const mounted = await mountEditor('Before ![A **red** leaf](leaf.png "Autumn") after\n');

    selectImage(mounted);
    pickFile("C:\\Notes\\images\\green leaf.png");

    await expect(replaceImage(mounted.editor)).resolves.toBe(true);

    const replaced = 'Before ![A **red** leaf](<../images/green leaf.png> "Autumn") after\n';

    expect(open).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultPath: "C:/Notes/drafts", directory: false }),
    );
    expect(mounted.getMarkdown()).toBe(replaced);

    expect(undo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe('Before ![A **red** leaf](leaf.png "Autumn") after\n');

    expect(redo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe(replaced);
  });

  it("names a file on another root, or from an untitled document, by its absolute path", async () => {
    const saved = await mountEditor("![leaf](leaf.png)\n");

    selectImage(saved);
    pickFile("D:\\Images\\oak.png");

    await expect(replaceImage(saved.editor)).resolves.toBe(true);
    expect(saved.getMarkdown()).toBe("![leaf](D:/Images/oak.png)\n");

    const untitled = await mountEditor("![leaf](leaf.png)\n", { documentPath: null });

    selectImage(untitled);
    pickFile("C:\\Notes\\oak.png");

    await expect(replaceImage(untitled.editor)).resolves.toBe(true);
    expect(untitled.getMarkdown()).toBe("![leaf](C:/Notes/oak.png)\n");
  });

  it("closes a projected image's source only once a file is chosen", async () => {
    const mounted = await mountEditor("![leaf](leaf.png)\n");

    projectImage(mounted);
    pickFile(null);

    await expect(replaceImage(mounted.editor)).resolves.toBe(false);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

    pickFile("C:\\Notes\\drafts\\oak.png");

    await expect(replaceImage(mounted.editor)).resolves.toBe(true);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.getMarkdown()).toBe("![leaf](oak.png)\n");

    expect(undo(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe("![leaf](leaf.png)\n");
  });

  it("replaces the image a projected source edit spells", async () => {
    const mounted = await mountEditor("![leaf](leaf.png)\n");

    projectImage(mounted);
    mounted.view.dispatch(
      mounted.view.state.tr.insertText("red ", getEditorTextPosition(mounted, "![leaf]") + 2),
    );
    pickFile("C:\\Notes\\drafts\\oak.png");

    await expect(replaceImage(mounted.editor)).resolves.toBe(true);
    expect(mounted.getMarkdown()).toBe("![red leaf](oak.png)\n");
  });

  it("replaces the image of a selected block", async () => {
    const mounted = await mountEditor("![leaf](leaf.png)\n\nAfter\n");

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, 0),
      ),
    );
    pickFile("C:\\Notes\\drafts\\oak.png");

    await expect(replaceImage(mounted.editor)).resolves.toBe(true);
    expect(mounted.getMarkdown()).toBe("![leaf](oak.png)\n\nAfter\n");
  });

  it("keeps the authored destination form the replacement does not need", async () => {
    const mounted = await mountEditor("![leaf](<leaf.png>)\n");

    selectImage(mounted);
    pickFile("C:\\Notes\\drafts\\oak.png");

    await expect(replaceImage(mounted.editor)).resolves.toBe(true);
    expect(mounted.getMarkdown()).toBe("![leaf](oak.png)\n");
  });

  it("leaves a document that changed while the picker was open", async () => {
    const mounted = await mountEditor("Before ![leaf](leaf.png)\n");
    let resolvePick: (path: string) => void = () => {};

    selectImage(mounted);
    vi.mocked(open).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePick = resolve;
      }),
    );

    const replacing = replaceImage(mounted.editor);

    mounted.view.dispatch(mounted.view.state.tr.insertText("New ", 1));
    resolvePick("C:\\Notes\\drafts\\oak.png");

    await expect(replacing).resolves.toBe(false);
    expect(mounted.getMarkdown()).toBe("New Before ![leaf](leaf.png)\n");
  });
});
