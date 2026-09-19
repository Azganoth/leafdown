// @vitest-environment happy-dom

import { getCurrentWindow } from "@tauri-apps/api/window";
import { describe, expect, it, vi } from "vitest";

import { act, renderHook, waitFor } from "@/test/utils/react";
import { getWindowDragDropHandler } from "@/test/utils/tauri";

import { useDroppedPathListener } from "./useDroppedPathListener";

const dropWorkflowMocks = vi.hoisted(() => ({
  handleDroppedPaths: vi.fn(async () => true),
  prepareDroppedPaths: vi.fn(async () => ({
    action: "openFolder" as const,
    droppedPath: { kind: "folder" as const, path: "C:/Notes" },
    status: "ready" as const,
  })),
}));

vi.mock("../services/dropWorkflows", () => dropWorkflowMocks);

describe("useDroppedPathListener", () => {
  it("previews native drags, clears the preview on drop, and disposes the listener", async () => {
    const unlisten = vi.fn();
    vi.mocked(getCurrentWindow().onDragDropEvent).mockResolvedValue(unlisten);

    const { result, unmount } = renderHook(() => useDroppedPathListener());

    await waitFor(() => {
      expect(getCurrentWindow().onDragDropEvent).toHaveBeenCalledTimes(1);
    });

    const handleDragDrop = getWindowDragDropHandler();

    act(() => {
      handleDragDrop({ payload: { type: "enter", paths: ["C:/Notes"], position: {} as never } });
    });

    expect(result.current).toEqual({ status: "checking" });

    await waitFor(() => {
      expect(result.current).toEqual({
        action: "openFolder",
        droppedPath: { kind: "folder", path: "C:/Notes" },
        status: "ready",
      });
    });

    act(() => {
      handleDragDrop({ payload: { type: "drop", paths: ["C:/Notes"], position: {} as never } });
    });

    expect(result.current).toBeNull();

    await waitFor(() => {
      expect(dropWorkflowMocks.handleDroppedPaths).toHaveBeenCalledWith(["C:/Notes"]);
    });

    unmount();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("clears the preview on leave and ignores an inspection that finishes afterward", async () => {
    const inspection = Promise.withResolvers<{
      action: "openFolder";
      droppedPath: { kind: "folder"; path: string };
      status: "ready";
    }>();
    dropWorkflowMocks.prepareDroppedPaths.mockReturnValueOnce(inspection.promise);

    const { result } = renderHook(() => useDroppedPathListener());

    await waitFor(() => {
      expect(getCurrentWindow().onDragDropEvent).toHaveBeenCalled();
    });

    const handleDragDrop = getWindowDragDropHandler();

    act(() => {
      handleDragDrop({ payload: { type: "enter", paths: ["C:/Notes"], position: {} as never } });
      handleDragDrop({ payload: { type: "leave" } });
    });

    expect(result.current).toBeNull();

    await act(async () => {
      inspection.resolve({
        action: "openFolder",
        droppedPath: { kind: "folder", path: "C:/Notes" },
        status: "ready",
      });
      await inspection.promise;
    });

    expect(result.current).toBeNull();
  });
});
