// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

const mountEditor = setupMilkdownEditorMount();

describe("command state plugin", () => {
  it("notifies when command availability changes without doc or selection changes", async () => {
    const onCommandStateChanged = vi.fn();
    const mounted = await mountEditor("Plain text", { onCommandStateChanged });
    const strong = mounted.view.state.schema.marks.strong;

    if (!strong) {
      throw new Error("Expected the editor schema to include the strong mark.");
    }

    expect(onCommandStateChanged).not.toHaveBeenCalled();

    mounted.view.dispatch(mounted.view.state.tr.addStoredMark(strong.create()));

    expect(onCommandStateChanged).toHaveBeenCalledTimes(1);
    expect(onCommandStateChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabledCommands: expect.objectContaining({
          "format.clearInline": true,
        }),
        status: "ready",
      }),
    );
  });
});
