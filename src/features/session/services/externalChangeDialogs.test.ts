import { afterEach, describe, expect, it, vi } from "vitest";

import {
  answerConfirmation,
  cancelPendingConfirmations,
  requestConfirmation,
  useConfirmationStore,
} from "@/lib/confirmation";
import {
  createFileMetadata,
  createOpenedMarkdownDocument,
  createSavedDocument,
} from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { setDefaultSession } from "@/test/utils/appStores";
import { countTauriApiCalls, mockTauriApi } from "@/test/utils/tauriApi";

import { getActiveTab, useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { saveDocumentTabAs } from "./documentWorkflows";
import { ExternalChangeDialogs } from "./externalChangeDialogs";

vi.mock("./documentWorkflows", async (original) => ({
  ...(await original<typeof import("./documentWorkflows")>()),
  saveDocumentTabAs: vi.fn(async () => false),
}));

const modifiedDocument = (isDirty = true) =>
  createSavedDocument({
    isDirty,
    externalChange: { kind: "modified", fingerprint: "changed", metadata: createFileMetadata() },
  });
const prompt = () => useConfirmationStore.getState().current;
const answer = (decision: "confirm" | "alternate" | "cancel") =>
  answerConfirmation(prompt()!.id, decision);
let dialogs: ExternalChangeDialogs;
afterEach(() => {
  dialogs?.dispose();
  cancelPendingConfirmations();
  documentEditorBridge.clear();
});

describe("external change dialogs", () => {
  it("waits until an affected background tab is selected in a focused window", () => {
    const document = modifiedDocument(false);
    setDefaultSession({
      documents: [document, createSavedDocument({ path: "C:/notes/other.md" })],
      activeIndex: 1,
    });
    dialogs = new ExternalChangeDialogs();
    dialogs.setFocused(true);
    expect(prompt()).toBeNull();
    dialogs.setFocused(false);
    useSessionStore.getState().activateTab(useSessionStore.getState().tabs[0].id);
    expect(prompt()).toBeNull();
    dialogs.setFocused(true);
    expect(prompt()).toMatchObject({
      title: "File changed on disk",
      detail: document.path,
      confirmLabel: "Reload from disk",
      alternateLabel: "Save as",
      cancelLabel: "Keep editing",
    });
    expect(useSessionStore.getState().activeDocument).toEqual(document);
  });

  it("opens immediately when the focused active document gains an external change", () => {
    const document = createSavedDocument();
    setDefaultSession({ documents: [document] });
    dialogs = new ExternalChangeDialogs();
    dialogs.setFocused(true);
    useSessionStore.getState().setDocumentFileState(document.path, {
      metadata: document.metadata,
      externalChange: modifiedDocument().externalChange,
    });
    expect(prompt()?.title).toBe("File changed on disk");
  });

  it("acknowledges Keep editing without clearing the conflict, and asks for the next disk version", async () => {
    const document = modifiedDocument();
    setDefaultSession({ documents: [document] });
    dialogs = new ExternalChangeDialogs();
    dialogs.setFocused(true);
    expect(prompt()?.message).toContain("discard your unsaved changes");
    answer("cancel");
    await vi.waitFor(() => expect(prompt()).toBeNull());
    dialogs.setFocused(false);
    dialogs.setFocused(true);
    expect(prompt()).toBeNull();
    expect(useSessionStore.getState().activeDocument).toEqual(document);
    useSessionStore.getState().setDocumentFileState(document.path, {
      metadata: document.metadata,
      externalChange: { kind: "modified", fingerprint: "newer", metadata: createFileMetadata() },
    });
    await vi.waitFor(() => expect(prompt()?.title).toBe("File changed on disk"));
  });

  it.each([false, true])(
    "reloads with one confirmation and restores the pre-dialog caret and focus (focused: %s)",
    async (focused) => {
      const document = modifiedDocument();
      setDefaultSession({ documents: [document] });
      const viewState = { anchor: 3, head: 3, focused };
      let dialogOpen = false;
      documentEditorBridge.set(
        document.path,
        createMilkdownEditorBridge({
          getViewState: () => ({ ...viewState, focused: focused && !dialogOpen }),
        }),
      );
      mockTauriApi({
        openMarkdownFile: () =>
          createOpenedMarkdownDocument({ content: "New disk version\n", fingerprint: "changed" }),
      });
      dialogs = new ExternalChangeDialogs();
      dialogs.setFocused(true);
      dialogOpen = true;
      answer("confirm");
      await vi.waitFor(() =>
        expect(useSessionStore.getState().activeDocument).toMatchObject({
          content: "New disk version\n",
          isDirty: false,
          externalChange: null,
        }),
      );
      expect(getActiveTab(useSessionStore.getState())?.viewState).toEqual(viewState);
      expect(prompt()).toBeNull();
      expect(countTauriApiCalls("openMarkdownFile")).toBe(1);
    },
  );

  it("saves a copy of the affected document and retains a cancelled Save as conflict", async () => {
    const document = modifiedDocument();
    setDefaultSession({ documents: [document] });
    const tabId = useSessionStore.getState().activeTabId;
    dialogs = new ExternalChangeDialogs();
    dialogs.setFocused(true);
    answer("alternate");
    await vi.waitFor(() => expect(saveDocumentTabAs).toHaveBeenCalledWith(tabId));
    expect(useSessionStore.getState().activeDocument).toEqual(document);
    expect(prompt()).toBeNull();
  });

  it("offers Save as for a missing file without offering reload", async () => {
    const document = createSavedDocument({ externalChange: { kind: "missing" } });
    setDefaultSession({ documents: [document] });
    dialogs = new ExternalChangeDialogs();
    dialogs.setFocused(true);
    expect(prompt()).toMatchObject({ title: "File missing", confirmLabel: "Save as" });
    expect(prompt()?.alternateLabel).toBeUndefined();
    answer("confirm");
    await vi.waitFor(() =>
      expect(saveDocumentTabAs).toHaveBeenCalledWith(useSessionStore.getState().activeTabId),
    );
  });

  it("waits for another confirmation to finish instead of queuing a stale file dialog", async () => {
    setDefaultSession({ documents: [modifiedDocument()] });
    const other = requestConfirmation({
      title: "Other decision",
      message: "Wait",
      confirmLabel: "Yes",
      cancelLabel: "No",
    });
    dialogs = new ExternalChangeDialogs();
    dialogs.setFocused(true);
    expect(prompt()?.title).toBe("Other decision");
    expect(useConfirmationStore.getState().queued).toEqual([]);
    answer("cancel");
    await other;
    expect(prompt()?.title).toBe("File changed on disk");
  });

  it.each(["replaced", "closed", "resolved", "newer version"])(
    "retires a decision when its document is %s",
    async (change) => {
      const document = modifiedDocument();
      setDefaultSession({ documents: [document] });
      dialogs = new ExternalChangeDialogs();
      dialogs.setFocused(true);
      const oldId = prompt()!.id;
      const session = useSessionStore.getState();
      if (change === "replaced")
        session.replaceTabDocument(session.activeTabId!, createSavedDocument());
      else if (change === "closed") session.closeTabs([session.activeTabId!]);
      else
        session.setDocumentFileState(document.path, {
          metadata: document.metadata,
          externalChange:
            change === "resolved"
              ? null
              : { kind: "modified", fingerprint: "newer", metadata: createFileMetadata() },
        });
      answerConfirmation(oldId, "confirm");
      await vi.waitFor(() => expect(prompt()?.id).not.toBe(oldId));
      expect(countTauriApiCalls("openMarkdownFile")).toBe(0);
      expect(saveDocumentTabAs).not.toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(prompt()?.title).toBe(
          change === "newer version" ? "File changed on disk" : undefined,
        ),
      );
    },
  );

  it("asks again when a file returns and then disappears again", async () => {
    const document = createSavedDocument({ externalChange: { kind: "missing" } });
    setDefaultSession({ documents: [document] });
    dialogs = new ExternalChangeDialogs();
    dialogs.setFocused(true);
    answer("cancel");
    await vi.waitFor(() => expect(prompt()).toBeNull());
    useSessionStore
      .getState()
      .setDocumentFileState(document.path, { metadata: document.metadata, externalChange: null });
    useSessionStore.getState().setDocumentFileState(document.path, {
      metadata: document.metadata,
      externalChange: { kind: "missing" },
    });
    await vi.waitFor(() => expect(prompt()?.title).toBe("File missing"));
  });
});
