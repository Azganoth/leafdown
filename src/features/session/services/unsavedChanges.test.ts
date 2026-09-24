import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStore } from "@/features/session";
import { requestConfirmation } from "@/lib/confirmation";
import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import { setDefaultSession } from "@/test/utils/appStores";

import { confirmDiscardActiveDocumentChanges } from "./unsavedChanges";

vi.mock("@/lib/confirmation", () => ({ requestConfirmation: vi.fn(async () => false) }));

describe("confirmDiscardActiveDocumentChanges", () => {
  beforeEach(() => {
    vi.mocked(requestConfirmation).mockReset().mockResolvedValue(false);
  });

  it("returns true without prompting when there is no active document", async () => {
    await expect(confirmDiscardActiveDocumentChanges()).resolves.toBe(true);

    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it("returns true without prompting when the active document is clean", async () => {
    setDefaultSession({
      activeDocument: createSavedDocument(),
    });

    await expect(confirmDiscardActiveDocumentChanges()).resolves.toBe(true);

    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it("returns false when dirty document discard is declined", async () => {
    setDefaultSession({
      activeDocument: createUntitledDocument({ isDirty: true }),
    });

    await expect(confirmDiscardActiveDocumentChanges()).resolves.toBe(false);

    expect(requestConfirmation).toHaveBeenCalledWith({
      title: "Unsaved changes",
      message: "The active document has unsaved changes. Discard them and continue?",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
    });
  });

  it("returns true when dirty document discard is confirmed for the same document", async () => {
    setDefaultSession({
      activeDocument: createSavedDocument({ isDirty: true }),
    });
    vi.mocked(requestConfirmation).mockResolvedValue(true);

    await expect(confirmDiscardActiveDocumentChanges()).resolves.toBe(true);
  });

  it("returns false when the active document changes while confirmation is pending", async () => {
    const confirmDeferred = Promise.withResolvers<boolean>();
    setDefaultSession({
      activeDocument: createSavedDocument({ isDirty: true }),
    });
    vi.mocked(requestConfirmation).mockImplementation(() => confirmDeferred.promise);

    const confirmation = confirmDiscardActiveDocumentChanges();

    await vi.waitFor(() => expect(requestConfirmation).toHaveBeenCalledOnce());

    useSessionStore.getState().setActiveDocument(createUntitledDocument({ id: "untitled:next" }));
    confirmDeferred.resolve(true);

    await expect(confirmation).resolves.toBe(false);
  });

  it("does not discard a reopened document at the same path", async () => {
    const decision = Promise.withResolvers<boolean>();
    setDefaultSession({ activeDocument: createSavedDocument({ isDirty: true }) });
    vi.mocked(requestConfirmation).mockReturnValue(decision.promise);

    const confirmation = confirmDiscardActiveDocumentChanges();
    await vi.waitFor(() => expect(requestConfirmation).toHaveBeenCalledOnce());

    useSessionStore.getState().setActiveDocument(createSavedDocument({ isDirty: true }));
    decision.resolve(true);

    await expect(confirmation).resolves.toBe(false);
  });
});
