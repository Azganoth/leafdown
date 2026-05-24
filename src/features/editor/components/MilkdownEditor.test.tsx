import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, render, screen } from "@/test/utils/react";

import { MilkdownEditor } from "./MilkdownEditor";
import type {
  CreateMilkdownEditorOptions,
  MilkdownEditorBridge,
  MilkdownEditorInstance,
} from "../types";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Milkdown editor with the root element and initial Markdown", async () => {
    const editor = createMockEditor();
    milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);

    render(<MilkdownEditor documentKey="C:/Notes/readme.md" initialMarkdown="# Notes" />);

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
    expect(options.getAutoPairBracketsAndQuotes?.()).toBe(true);
  });

  it("passes live editor settings without recreating the editor", async () => {
    const editor = createMockEditor();
    milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);

    const { rerender } = render(
      <MilkdownEditor
        documentKey="C:/Notes/readme.md"
        initialMarkdown="# Notes"
        autoPairBracketsAndQuotes
        softWrapCodeBlocks={false}
      />,
    );

    await waitFor(() => {
      expect(editor.create).toHaveBeenCalledTimes(1);
    });

    const options = getCreateOptions();

    expect(options.getAutoPairBracketsAndQuotes?.()).toBe(true);
    expect(screen.getByTestId("milkdown-editor-host")).toHaveAttribute(
      "data-code-block-soft-wrap",
      "false",
    );

    rerender(
      <MilkdownEditor
        documentKey="C:/Notes/readme.md"
        initialMarkdown="# Notes"
        autoPairBracketsAndQuotes={false}
        softWrapCodeBlocks
      />,
    );

    expect(milkdownEditorMocks.createMilkdownEditor).toHaveBeenCalledTimes(1);
    expect(options.getAutoPairBracketsAndQuotes?.()).toBe(false);
    expect(screen.getByTestId("milkdown-editor-host")).toHaveAttribute(
      "data-code-block-soft-wrap",
      "true",
    );
  });

  it("destroys the created editor on unmount", async () => {
    const editor = createMockEditor();
    const bridgeRef = { current: null as MilkdownEditorBridge | null };
    milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);

    const { unmount } = render(
      <MilkdownEditor documentKey="C:/Notes/readme.md" initialMarkdown="# Notes" ref={bridgeRef} />,
    );

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

    const { unmount } = render(
      <MilkdownEditor documentKey="C:/Notes/readme.md" initialMarkdown="# Notes" />,
    );

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
      <MilkdownEditor documentKey="C:/Notes/first.md" initialMarkdown="# First" />,
    );

    await waitFor(() => {
      expect(firstEditor.create).toHaveBeenCalledTimes(1);
    });

    rerender(<MilkdownEditor documentKey="C:/Notes/second.md" initialMarkdown="# Second" />);

    await waitFor(() => {
      expect(secondEditor.create).toHaveBeenCalledTimes(1);
    });

    expect(firstEditor.destroy).toHaveBeenCalledTimes(1);
    expect(milkdownEditorMocks.createMilkdownEditor.mock.calls[1][0]).toMatchObject({
      initialMarkdown: "# Second",
    });
  });

  it("provides a markdown bridge and clears it when the editor unmounts", async () => {
    const editor = createMockEditor();
    const bridgeRef = { current: null as MilkdownEditorBridge | null };
    milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);
    milkdownEditorMocks.getMilkdownEditorMarkdown.mockReturnValue("# Serialized");

    const { unmount } = render(
      <MilkdownEditor documentKey="C:/Notes/readme.md" initialMarkdown="# Notes" ref={bridgeRef} />,
    );

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

  it("registers the markdown update hook without firing an initial update", () => {
    const editor = createMockEditor();
    const onMarkdownUpdated = vi.fn();
    milkdownEditorMocks.createMilkdownEditor.mockResolvedValue(editor.instance);

    render(
      <MilkdownEditor
        documentKey="C:/Notes/readme.md"
        initialMarkdown="# Notes"
        onMarkdownUpdated={onMarkdownUpdated}
      />,
    );

    expect(milkdownEditorMocks.createMilkdownEditor).toHaveBeenCalledTimes(1);

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
});
