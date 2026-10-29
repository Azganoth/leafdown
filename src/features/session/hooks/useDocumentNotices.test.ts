// @vitest-environment happy-dom

import { getCurrentWindow } from "@tauri-apps/api/window";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cancelPendingConfirmations, useConfirmationStore } from "@/lib/confirmation";
import { createFileMetadata, createSavedDocument } from "@/test/factories/document";
import { setDefaultSession } from "@/test/utils/appStores";
import { act, renderHook, waitFor } from "@/test/utils/react";

import { useDocumentNotices } from "./useDocumentNotices";

const setAffectedDocument = () =>
  setDefaultSession({
    activeDocument: createSavedDocument({
      externalChange: { kind: "modified", fingerprint: "changed", metadata: createFileMetadata() },
    }),
  });
const emitFocus = (focused: boolean) => {
  const handler = vi.mocked(getCurrentWindow().onFocusChanged).mock.calls[0][0];
  act(() => handler({ event: "tauri://focus", id: 0, payload: focused }));
};
afterEach(cancelPendingConfirmations);

describe("useDocumentNotices", () => {
  it("opens the affected document's dialog when the native window regains focus", async () => {
    setAffectedDocument();
    vi.mocked(getCurrentWindow().isFocused).mockResolvedValue(false);
    renderHook(useDocumentNotices);
    await waitFor(() => expect(getCurrentWindow().isFocused).toHaveBeenCalledOnce());
    expect(useConfirmationStore.getState().current).toBeNull();
    emitFocus(true);
    expect(useConfirmationStore.getState().current?.title).toBe("File changed on disk");
  });

  it("does not let a late initial focus query override a newer blur event", async () => {
    setAffectedDocument();
    const initialFocus = Promise.withResolvers<boolean>();
    vi.mocked(getCurrentWindow().isFocused).mockReturnValue(initialFocus.promise);
    renderHook(useDocumentNotices);
    await waitFor(() => expect(getCurrentWindow().isFocused).toHaveBeenCalledOnce());
    emitFocus(false);
    await act(async () => initialFocus.resolve(true));
    expect(useConfirmationStore.getState().current).toBeNull();
    emitFocus(true);
    expect(useConfirmationStore.getState().current?.title).toBe("File changed on disk");
  });

  it("disposes a late native listener and does not prompt after unmount", async () => {
    setAffectedDocument();
    const listener = Promise.withResolvers<() => void>();
    const unlisten = vi.fn();
    vi.mocked(getCurrentWindow().onFocusChanged).mockReturnValue(listener.promise);
    const { unmount } = renderHook(useDocumentNotices);
    unmount();
    await act(async () => listener.resolve(unlisten));
    expect(unlisten).toHaveBeenCalledOnce();
    emitFocus(true);
    expect(useConfirmationStore.getState().current).toBeNull();
  });

  it("releases native focus tracking and cancels its dialog on unmount", async () => {
    setAffectedDocument();
    const unlisten = vi.fn();
    vi.mocked(getCurrentWindow().onFocusChanged).mockResolvedValue(unlisten);
    const { unmount } = renderHook(useDocumentNotices);
    await waitFor(() => expect(useConfirmationStore.getState().current).not.toBeNull());
    unmount();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(useConfirmationStore.getState().current).toBeNull();
  });
});
