import { confirm } from "@tauri-apps/plugin-dialog";
import { describe, expect, it, vi } from "vitest";

import { useSessionStore } from "@/features/session";
import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import { setDefaultSession } from "@/test/utils/appStores";

import { confirmDiscardActiveDocumentChanges } from "./unsavedChanges";

describe("confirmDiscardActiveDocumentChanges", () => {
  it("returns true without prompting when there is no active document", async () => {
    await expect(confirmDiscardActiveDocumentChanges()).resolves.toBe(true);

    expect(confirm).not.toHaveBeenCalled();
  });

  it("returns true without prompting when the active document is clean", async () => {
    setDefaultSession({
      activeDocument: createSavedDocument(),
    });

    await expect(confirmDiscardActiveDocumentChanges()).resolves.toBe(true);

    expect(confirm).not.toHaveBeenCalled();
  });

  it("returns false when dirty document discard is declined", async () => {
    setDefaultSession({
      activeDocument: createUntitledDocument({ isDirty: true }),
    });

    await expect(confirmDiscardActiveDocumentChanges()).resolves.toBe(false);

    expect(confirm).toHaveBeenCalledWith(
      "The active document has unsaved changes. Discard them and continue?",
      {
        title: "Unsaved changes",
        kind: "warning",
        okLabel: "Discard changes",
        cancelLabel: "Keep editing",
      },
    );
  });

  it("returns true when dirty document discard is confirmed for the same document", async () => {
    setDefaultSession({
      activeDocument: createSavedDocument({ isDirty: true }),
    });
    vi.mocked(confirm).mockResolvedValue(true);

    await expect(confirmDiscardActiveDocumentChanges()).resolves.toBe(true);
  });

  it("returns false when the active document changes while confirmation is pending", async () => {
    const confirmDeferred = Promise.withResolvers<boolean>();
    setDefaultSession({
      activeDocument: createSavedDocument({ isDirty: true }),
    });
    vi.mocked(confirm).mockImplementation(() => confirmDeferred.promise);

    const confirmation = confirmDiscardActiveDocumentChanges();

    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());

    useSessionStore.getState().setActiveDocument(createUntitledDocument({ id: "untitled:next" }));
    confirmDeferred.resolve(true);

    await expect(confirmation).resolves.toBe(false);
  });
});
