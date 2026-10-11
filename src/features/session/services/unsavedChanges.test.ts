import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStore } from "@/features/session";
import { requestConfirmation } from "@/lib/confirmation";
import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import { replaceActiveDocument, setDefaultSession } from "@/test/utils/appStores";

import { confirmDiscardTabChanges, confirmDiscardAllDocumentChanges } from "./unsavedChanges";

vi.mock("@/lib/confirmation", () => ({ requestConfirmation: vi.fn(async () => false) }));

const confirmDiscardActiveTabChanges = () => {
  const { activeTabId } = useSessionStore.getState();

  return confirmDiscardTabChanges(activeTabId ? [activeTabId] : []);
};

describe("confirmDiscardTabChanges", () => {
  beforeEach(() => {
    vi.mocked(requestConfirmation).mockReset().mockResolvedValue(false);
  });

  it("returns true without prompting when there is no active document", async () => {
    await expect(confirmDiscardActiveTabChanges()).resolves.toBe(true);

    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it("returns true without prompting when the active document is clean", async () => {
    setDefaultSession({
      activeDocument: createSavedDocument(),
    });

    await expect(confirmDiscardActiveTabChanges()).resolves.toBe(true);

    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it("returns false when dirty document discard is declined", async () => {
    setDefaultSession({
      activeDocument: createUntitledDocument({ isDirty: true }),
    });

    await expect(confirmDiscardActiveTabChanges()).resolves.toBe(false);

    expect(requestConfirmation).toHaveBeenCalledWith({
      title: "Unsaved changes",
      message: "Untitled has unsaved changes. Discard them and continue?",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
    });
  });

  it("returns true when dirty document discard is confirmed for the same document", async () => {
    setDefaultSession({
      activeDocument: createSavedDocument({ isDirty: true }),
    });
    vi.mocked(requestConfirmation).mockResolvedValue(true);

    await expect(confirmDiscardActiveTabChanges()).resolves.toBe(true);
  });

  it("returns false when the active document changes while confirmation is pending", async () => {
    const confirmDeferred = Promise.withResolvers<boolean>();
    setDefaultSession({
      activeDocument: createSavedDocument({ isDirty: true }),
    });
    vi.mocked(requestConfirmation).mockImplementation(() => confirmDeferred.promise);

    const confirmation = confirmDiscardActiveTabChanges();

    await vi.waitFor(() => expect(requestConfirmation).toHaveBeenCalledOnce());

    replaceActiveDocument(createUntitledDocument({ id: "untitled:next" }));
    confirmDeferred.resolve(true);

    await expect(confirmation).resolves.toBe(false);
  });

  it("does not discard a reopened document at the same path", async () => {
    const decision = Promise.withResolvers<boolean>();
    setDefaultSession({ activeDocument: createSavedDocument({ isDirty: true }) });
    vi.mocked(requestConfirmation).mockReturnValue(decision.promise);

    const confirmation = confirmDiscardActiveTabChanges();
    await vi.waitFor(() => expect(requestConfirmation).toHaveBeenCalledOnce());

    replaceActiveDocument(createSavedDocument({ isDirty: true }));
    decision.resolve(true);

    await expect(confirmation).resolves.toBe(false);
  });
});

describe("confirmDiscardAllDocumentChanges", () => {
  beforeEach(() => {
    vi.mocked(requestConfirmation).mockReset().mockResolvedValue(false);
  });

  it("names every unsaved document in one dialog offering to discard them all", async () => {
    setDefaultSession({
      documents: [
        createSavedDocument({ isDirty: true }),
        createSavedDocument({ path: "C:/Notes/clean.md" }),
        createUntitledDocument({ id: "untitled:2", isDirty: true }),
      ],
    });
    vi.mocked(requestConfirmation).mockResolvedValue(true);

    await expect(confirmDiscardAllDocumentChanges()).resolves.toBe(true);

    expect(requestConfirmation).toHaveBeenCalledExactlyOnceWith({
      title: "Unsaved changes",
      message: "2 documents have unsaved changes. Discard them and continue?",
      detail: "readme.md\nUntitled 2",
      confirmLabel: "Discard all",
      cancelLabel: "Cancel",
    });
  });

  it("asks about a single unsaved document by name", async () => {
    setDefaultSession({
      documents: [
        createSavedDocument({ path: "C:/Notes/clean.md" }),
        createSavedDocument({ isDirty: true }),
      ],
    });

    await expect(confirmDiscardAllDocumentChanges()).resolves.toBe(false);

    expect(requestConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "readme.md has unsaved changes. Discard them and continue?",
        confirmLabel: "Discard changes",
      }),
    );
  });

  it("does not prompt when no document has unsaved changes", async () => {
    setDefaultSession({
      documents: [createSavedDocument(), createUntitledDocument()],
    });

    await expect(confirmDiscardAllDocumentChanges()).resolves.toBe(true);

    expect(requestConfirmation).not.toHaveBeenCalled();
  });

  it("returns false when a document it asked about is replaced while the dialog is open", async () => {
    const decision = Promise.withResolvers<boolean>();
    setDefaultSession({
      documents: [
        createSavedDocument({ isDirty: true }),
        createUntitledDocument({ isDirty: true }),
      ],
      activeIndex: 1,
    });
    vi.mocked(requestConfirmation).mockReturnValue(decision.promise);

    const confirmation = confirmDiscardAllDocumentChanges();
    await vi.waitFor(() => expect(requestConfirmation).toHaveBeenCalledOnce());

    replaceActiveDocument(createSavedDocument({ path: "C:/Notes/saved.md" }));
    decision.resolve(true);

    await expect(confirmation).resolves.toBe(false);
  });
});
