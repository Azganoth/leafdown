import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, render, screen } from "@/test/utils/react";

import { MilkdownEditor } from "./MilkdownEditor";
import type {
  CreateMilkdownEditorOptions,
  MilkdownEditorBridge,
  MilkdownEditorInstance,
} from "./types";

const milkdownEditorMocks = vi.hoisted(() => ({
  createMilkdownEditor: vi.fn(),
  getMilkdownEditorMarkdown: vi.fn(),
}));

vi.mock("./createMilkdownEditor", () => milkdownEditorMocks);

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
    milkdownEditorMocks.createMilkdownEditor.mockReturnValue(editor.instance);

    render(<MilkdownEditor documentKey="C:/Notes/readme.md" initialMarkdown="# Notes" />);

    await waitFor(() => {
      expect(editor.create).toHaveBeenCalledTimes(1);
    });

    const options = getCreateOptions();

    expect(screen.getByTestId("milkdown-editor-host")).toBeInTheDocument();
    expect(options.root).toBeInstanceOf(HTMLElement);
    expect(options.initialMarkdown).toBe("# Notes");
  });

  it("destroys the created editor on unmount", async () => {
    const editor = createMockEditor();
    const onBridgeChange = vi.fn();
    milkdownEditorMocks.createMilkdownEditor.mockReturnValue(editor.instance);

    const { unmount } = render(
      <MilkdownEditor
        documentKey="C:/Notes/readme.md"
        initialMarkdown="# Notes"
        onBridgeChange={onBridgeChange}
      />,
    );

    await waitFor(() => {
      expect(onBridgeChange).toHaveBeenCalledWith(
        expect.objectContaining({ getMarkdown: expect.any(Function) }),
      );
    });

    unmount();

    expect(editor.destroy).toHaveBeenCalledTimes(1);
    expect(onBridgeChange).toHaveBeenLastCalledWith(null);
  });

  it("destroys the editor if creation resolves after unmount", async () => {
    const deferred = Promise.withResolvers<MilkdownEditorInstance>();
    const editor = createMockEditor(deferred.promise);
    milkdownEditorMocks.createMilkdownEditor.mockReturnValue(editor.instance);

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
      .mockReturnValueOnce(firstEditor.instance)
      .mockReturnValueOnce(secondEditor.instance);

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
    const onBridgeChange = vi.fn();
    milkdownEditorMocks.createMilkdownEditor.mockReturnValue(editor.instance);
    milkdownEditorMocks.getMilkdownEditorMarkdown.mockReturnValue("# Serialized");

    const { unmount } = render(
      <MilkdownEditor
        documentKey="C:/Notes/readme.md"
        initialMarkdown="# Notes"
        onBridgeChange={onBridgeChange}
      />,
    );

    await waitFor(() => {
      expect(onBridgeChange).toHaveBeenCalledWith(
        expect.objectContaining({ getMarkdown: expect.any(Function) }),
      );
    });

    const bridge = onBridgeChange.mock.calls.find(([value]) => value)?.[0] as MilkdownEditorBridge;

    expect(bridge.getMarkdown()).toBe("# Serialized");
    expect(milkdownEditorMocks.getMilkdownEditorMarkdown).toHaveBeenCalledWith(editor.instance);

    unmount();

    expect(onBridgeChange).toHaveBeenLastCalledWith(null);
    expect(() => bridge.getMarkdown()).toThrow("Milkdown editor is not available.");
  });

  it("registers the markdown update hook without firing an initial update", () => {
    const editor = createMockEditor();
    const onMarkdownUpdated = vi.fn();
    milkdownEditorMocks.createMilkdownEditor.mockReturnValue(editor.instance);

    render(
      <MilkdownEditor
        documentKey="C:/Notes/readme.md"
        initialMarkdown="# Notes"
        onMarkdownUpdated={onMarkdownUpdated}
      />,
    );

    const options = getCreateOptions();

    expect(onMarkdownUpdated).not.toHaveBeenCalled();

    options.onMarkdownUpdated?.({
      markdown: "# New Notes",
      previousMarkdown: "# Notes",
    });

    expect(onMarkdownUpdated).toHaveBeenCalledWith({
      markdown: "# New Notes",
      previousMarkdown: "# Notes",
    });
  });
});
