// @vitest-environment happy-dom

import { getCurrentWindow } from "@tauri-apps/api/window";
import { describe, expect, it, vi } from "vitest";

import { renderHook, waitFor } from "@/test/utils/react";
import { getWindowDragDropHandler } from "@/test/utils/tauri";

import { useDroppedPathListener } from "./useDroppedPathListener";

const dropWorkflowMocks = vi.hoisted(() => ({
  handleDroppedPaths: vi.fn(async () => true),
}));

vi.mock("../services/dropWorkflows", () => dropWorkflowMocks);

describe("useDroppedPathListener", () => {
  it("handles native drops and disposes the listener", async () => {
    const unlisten = vi.fn();
    vi.mocked(getCurrentWindow().onDragDropEvent).mockResolvedValue(unlisten);

    const { unmount } = renderHook(() => useDroppedPathListener());

    await waitFor(() => {
      expect(getCurrentWindow().onDragDropEvent).toHaveBeenCalledTimes(1);
    });

    const handleDragDrop = getWindowDragDropHandler();

    handleDragDrop({ payload: { type: "enter", paths: ["C:/Notes"], position: {} as never } });
    handleDragDrop({ payload: { type: "drop", paths: ["C:/Notes"], position: {} as never } });

    await waitFor(() => {
      expect(dropWorkflowMocks.handleDroppedPaths).toHaveBeenCalledWith(["C:/Notes"]);
    });

    unmount();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
