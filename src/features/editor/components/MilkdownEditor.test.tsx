import { describe, expect, it, vi } from "vitest";

import { act, render, screen, waitFor } from "@/test/utils/react";

import { READY_DISABLED_EDITOR_COMMAND_STATE } from "../commands";
import type {
  CreateMilkdownEditorOptions,
  MilkdownEditorInstance,
} from "../utils/createMilkdownEditor";
import { MilkdownEditor, type MilkdownEditorBridge } from "./MilkdownEditor";

const milkdownEditorMocks = vi.hoisted(() => ({
  createMilkdownEditor: vi.fn(),
  getMilkdownEditorMarkdown: vi.fn(),
}));

vi.mock("../utils/createMilkdownEditor", () => milkdownEditorMocks);

interface MockMilkdownEditor {
  instance: MilkdownEditorInstance;
  create: ReturnType<typeof vi.fn<() => Promise<MilkdownEditorInstance>>>;
  destroy: ReturnType<typeof vi.fn<() => Promise<MilkdownEditorInstance>>>;
}

const createMockEditor = (createPromise?: Promise<MilkdownEditorInstance>): MockMilkdownEditor => {
  const editor = {
    create: vi.fn<() => Promise<MilkdownEditorInstance>>(),
    destroy: vi.fn<() => Promise<MilkdownEditorInstance>>(),
  };
  const instance = editor as unknown as MilkdownEditorInstance;

  editor.create.mockReturnValue(createPromise ?? Promise.resolve(instance));
  editor.destroy.mockResolvedValue(instance);

  return { instance, create: editor.create, destroy: editor.destroy };
};

const getCreateOptions = (): CreateMilkdownEditorOptions =>
  milkdownEditorMocks.createMilkdownEditor.mock.calls[0][0];

describe("MilkdownEditor", () => {
  describe("creation and live options", () => {
    it("creates a Milkdown editor with the root element and initial Markdown", async () => {
      const editor = createMockEditor();
      milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);

      render(<MilkdownEditor initialMarkdown="# Notes" />);

      await waitFor(() => {
        expect(editor.create).toHaveBeenCalledTimes(1);
      });

      const options = getCreateOptions();

      expect(screen.getByTestId("milkdown-editor-host")).toBeInTheDocument();
      expect(screen.getByTestId("milkdown-editor-host")).toHaveAttribute(
        "data-code-block-soft-wrap",
        "false",
      );
      expect(options.root).toBeInstanceOf(HTMLElement);
      expect(options.initialMarkdown).toBe("# Notes");
      expect(options.isAutoPairEnabled?.()).toBe(true);
      expect(options.getMarkdownReferenceContext?.()).toEqual({
        documentPath: null,
        folderContextPath: null,
      });
      expect(options.onOpenMarkdownPath).toEqual(expect.any(Function));
    });

    it("passes live editor settings and link/image context without recreating the editor", async () => {
      const editor = createMockEditor();
      milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);

      const { rerender } = render(
        <MilkdownEditor
          initialMarkdown="# Notes"
          documentPath="C:/Notes/readme.md"
          folderContextPath="C:/Notes"
          autoPairBracketsAndQuotes
          softWrapCodeBlocks={false}
        />,
      );

      await waitFor(() => {
        expect(editor.create).toHaveBeenCalledTimes(1);
      });

      const options = getCreateOptions();

      expect(options.isAutoPairEnabled?.()).toBe(true);
      expect(options.getMarkdownReferenceContext?.()).toEqual({
        documentPath: "C:/Notes/readme.md",
        folderContextPath: "C:/Notes",
      });
      expect(options.onOpenMarkdownPath).toEqual(expect.any(Function));
      expect(screen.getByTestId("milkdown-editor-host")).toHaveAttribute(
        "data-code-block-soft-wrap",
        "false",
      );

      rerender(
        <MilkdownEditor
          initialMarkdown="# Notes"
          documentPath="C:/Notes/renamed.md"
          folderContextPath="C:/Notes"
          autoPairBracketsAndQuotes={false}
          softWrapCodeBlocks
        />,
      );

      expect(milkdownEditorMocks.createMilkdownEditor).toHaveBeenCalledTimes(1);
      expect(options.isAutoPairEnabled?.()).toBe(false);
      expect(options.getMarkdownReferenceContext?.()).toEqual({
        documentPath: "C:/Notes/renamed.md",
        folderContextPath: "C:/Notes",
      });
      expect(options.onOpenMarkdownPath).toEqual(expect.any(Function));
      expect(screen.getByTestId("milkdown-editor-host")).toHaveAttribute(
        "data-code-block-soft-wrap",
        "true",
      );
    });
  });

  describe("lifecycle", () => {
    it("destroys the created editor on unmount", async () => {
      const editor = createMockEditor();
      const bridgeRef = { current: null as MilkdownEditorBridge | null };
      milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);

      const { unmount } = render(<MilkdownEditor initialMarkdown="# Notes" ref={bridgeRef} />);

      await waitFor(() => {
        expect(bridgeRef.current).toEqual(
          expect.objectContaining({ getMarkdown: expect.any(Function) }),
        );
      });

      unmount();

      expect(editor.destroy).toHaveBeenCalledTimes(1);
      expect(bridgeRef.current).toBeNull();
    });

    it("destroys the editor if creation resolves after unmount", async () => {
      const deferred = Promise.withResolvers<MilkdownEditorInstance>();
      const editor = createMockEditor(deferred.promise);
      milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);

      const { unmount } = render(<MilkdownEditor initialMarkdown="# Notes" />);

      await waitFor(() => {
        expect(editor.create).toHaveBeenCalledTimes(1);
      });

      unmount();

      expect(editor.destroy).not.toHaveBeenCalled();

      await act(async () => {
        deferred.resolve(editor.instance);
        await deferred.promise;
      });

      expect(editor.destroy).toHaveBeenCalledTimes(1);
    });

    it("recreates the editor when the active document changes", async () => {
      const firstEditor = createMockEditor();
      const secondEditor = createMockEditor();
      milkdownEditorMocks.createMilkdownEditor
        .mockResolvedValueOnce(firstEditor.instance)
        .mockResolvedValueOnce(secondEditor.instance);

      const { rerender } = render(
        <MilkdownEditor key="C:/Notes/first.md" initialMarkdown="# First" />,
      );

      await waitFor(() => {
        expect(firstEditor.create).toHaveBeenCalledTimes(1);
      });

      rerender(<MilkdownEditor key="C:/Notes/second.md" initialMarkdown="# Second" />);

      await waitFor(() => {
        expect(secondEditor.create).toHaveBeenCalledTimes(1);
      });

      expect(firstEditor.destroy).toHaveBeenCalledTimes(1);
      expect(milkdownEditorMocks.createMilkdownEditor.mock.calls[1][0]).toMatchObject({
        initialMarkdown: "# Second",
      });
    });
  });

  describe("bridge", () => {
    it("provides a markdown bridge and clears it when the editor unmounts", async () => {
      const editor = createMockEditor();
      const bridgeRef = { current: null as MilkdownEditorBridge | null };
      milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);
      milkdownEditorMocks.getMilkdownEditorMarkdown.mockReturnValue("# Serialized");

      const { unmount } = render(<MilkdownEditor initialMarkdown="# Notes" ref={bridgeRef} />);

      await waitFor(() => {
        expect(bridgeRef.current).toEqual(
          expect.objectContaining({ getMarkdown: expect.any(Function) }),
        );
      });

      const bridge = bridgeRef.current as MilkdownEditorBridge;

      expect(bridge.getMarkdown()).toBe("# Serialized");
      expect(milkdownEditorMocks.getMilkdownEditorMarkdown).toHaveBeenCalledWith(editor.instance);

      unmount();

      expect(bridgeRef.current).toBeNull();
      expect(() => bridge.getMarkdown()).toThrow("Milkdown editor is not available.");
    });
  });

  describe("callbacks", () => {
    it("registers the markdown update hook without firing an initial update", async () => {
      const editor = createMockEditor();
      const onMarkdownUpdated = vi.fn();
      milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);

      render(<MilkdownEditor initialMarkdown="# Notes" onMarkdownUpdated={onMarkdownUpdated} />);

      await waitFor(() => {
        expect(editor.create).toHaveBeenCalledTimes(1);
      });

      expect(onMarkdownUpdated).not.toHaveBeenCalled();

      getCreateOptions().onMarkdownUpdated?.({
        markdown: "# New Notes",
        previousMarkdown: "# Notes",
      });

      expect(onMarkdownUpdated).toHaveBeenCalledWith({
        markdown: "# New Notes",
        previousMarkdown: "# Notes",
      });
    });

    it("ignores delayed callbacks from a destroyed editor after document changes", async () => {
      const firstEditor = createMockEditor();
      const secondEditor = createMockEditor();
      const firstMarkdownUpdated = vi.fn();
      const secondMarkdownUpdated = vi.fn();
      milkdownEditorMocks.createMilkdownEditor
        .mockResolvedValueOnce(firstEditor.instance)
        .mockResolvedValueOnce(secondEditor.instance);

      const { rerender } = render(
        <MilkdownEditor
          key="C:/Notes/first.md"
          initialMarkdown="# First"
          onMarkdownUpdated={firstMarkdownUpdated}
        />,
      );

      await waitFor(() => {
        expect(firstEditor.create).toHaveBeenCalledTimes(1);
      });

      const firstOptions = milkdownEditorMocks.createMilkdownEditor.mock.calls[0][0];

      rerender(
        <MilkdownEditor
          key="C:/Notes/second.md"
          initialMarkdown="# Second"
          onMarkdownUpdated={secondMarkdownUpdated}
        />,
      );

      await waitFor(() => {
        expect(secondEditor.create).toHaveBeenCalledTimes(1);
      });

      firstOptions.onMarkdownUpdated?.({
        markdown: "# Late First",
        previousMarkdown: "# First",
      });

      expect(firstMarkdownUpdated).not.toHaveBeenCalled();
      expect(secondMarkdownUpdated).not.toHaveBeenCalled();

      milkdownEditorMocks.createMilkdownEditor.mock.calls[1][0].onMarkdownUpdated?.({
        markdown: "# Current Second",
        previousMarkdown: "# Second",
      });

      expect(secondMarkdownUpdated).toHaveBeenCalledWith({
        markdown: "# Current Second",
        previousMarkdown: "# Second",
      });
    });

    it("registers the command-state update hook and fires it when the editor is ready", async () => {
      const editor = createMockEditor();
      const onCommandStateChanged = vi.fn();
      milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);

      render(
        <MilkdownEditor initialMarkdown="# Notes" onCommandStateChanged={onCommandStateChanged} />,
      );

      await waitFor(() => {
        expect(editor.create).toHaveBeenCalledTimes(1);
      });

      expect(onCommandStateChanged).toHaveBeenCalledTimes(1);

      getCreateOptions().onCommandStateChanged?.(READY_DISABLED_EDITOR_COMMAND_STATE);

      expect(onCommandStateChanged).toHaveBeenCalledTimes(2);
    });
  });
});
