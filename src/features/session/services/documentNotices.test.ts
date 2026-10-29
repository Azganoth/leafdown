import { afterEach, describe, expect, it, vi } from "vitest";

import { toastManager } from "@/lib/toast";
import { createSavedDocument, createFileMetadata } from "@/test/factories/document";
import { setDefaultSession } from "@/test/utils/appStores";

import { useSessionStore } from "../stores/session";
import { followDocumentNotices } from "./documentNotices";
import { openMarkdownFileAtPath } from "./documentOpenWorkflows";
import { saveDocumentTabAs } from "./documentWorkflows";

vi.mock("./documentOpenWorkflows", async (original) => ({
  ...(await original<typeof import("./documentOpenWorkflows")>()),
  openMarkdownFileAtPath: vi.fn(async () => false),
}));
vi.mock("./documentWorkflows", async (original) => ({
  ...(await original<typeof import("./documentWorkflows")>()),
  saveDocumentTabAs: vi.fn(async () => false),
}));

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
});
const missingDocument = () => createSavedDocument({ externalChange: { kind: "missing" } });
const lastOptions = () => vi.mocked(toastManager.add).mock.calls.at(-1)![0];

describe("document notices", () => {
  it("groups affected documents, updates in place and closes once resolved", () => {
    const first = missingDocument();
    setDefaultSession({ documents: [first] });
    stop = followDocumentNotices();
    expect(lastOptions()).toMatchObject({
      type: "warning",
      timeout: 0,
      title: "File no longer found",
    });
    const second = createSavedDocument({
      path: "C:/notes/second.md",
      externalChange: { kind: "missing" },
    });
    useSessionStore.getState().openTab(second);
    expect(toastManager.add).toHaveBeenCalledOnce();
    expect(toastManager.update).toHaveBeenCalledWith(
      "test-toast",
      expect.objectContaining({ title: "2 documents need attention" }),
    );
    useSessionStore
      .getState()
      .setDocumentFileState(first.path, { metadata: first.metadata, externalChange: null });
    useSessionStore.getState().closeTabs([useSessionStore.getState().activeTabId!]);
    expect(toastManager.close).toHaveBeenCalledWith("test-toast");
  });

  it("acknowledges dismissal until a different disk version arrives", () => {
    const document = createSavedDocument({
      isDirty: true,
      externalChange: {
        kind: "modified",
        fingerprint: "version-a",
        metadata: createFileMetadata(),
      },
    });
    setDefaultSession({ documents: [document] });
    stop = followDocumentNotices();
    lastOptions().onClose?.();
    useSessionStore.getState().setDocumentFileState(document.path, {
      metadata: document.metadata,
      externalChange: document.externalChange,
    });
    expect(toastManager.add).toHaveBeenCalledOnce();
    useSessionStore.getState().setDocumentFileState(document.path, {
      metadata: document.metadata,
      externalChange: {
        kind: "modified",
        fingerprint: "version-b",
        metadata: createFileMetadata(),
      },
    });
    expect(toastManager.add).toHaveBeenCalledTimes(2);
  });

  it("targets the original tab after switching and keeps a cancelled save notice", async () => {
    setDefaultSession({ documents: [missingDocument()] });
    const original = useSessionStore.getState().activeTabId!;
    stop = followDocumentNotices();
    const items = lastOptions().data!.actionMenu!.items;
    useSessionStore.getState().openTab(createSavedDocument({ path: "C:/notes/other.md" }));
    items[1].run();
    await Promise.resolve();
    expect(saveDocumentTabAs).toHaveBeenCalledWith(original);
    expect(toastManager.close).not.toHaveBeenCalled();
    items[0].run();
    expect(useSessionStore.getState().activeTabId).toBe(original);
    useSessionStore.getState().closeTabs([original]);
    items[1].run();
    expect(saveDocumentTabAs).toHaveBeenCalledOnce();
  });

  it("reloads only the affected file and retires stale actions", () => {
    const document = createSavedDocument({
      isDirty: true,
      externalChange: { kind: "modified", fingerprint: "changed", metadata: createFileMetadata() },
    });
    setDefaultSession({ documents: [document] });
    stop = followDocumentNotices();
    const items = lastOptions().data!.actionMenu!.items;
    items[2].run();
    expect(openMarkdownFileAtPath).toHaveBeenCalledWith(document.path, {
      reload: true,
      activate: false,
    });
    useSessionStore
      .getState()
      .setDocumentFileState(document.path, { metadata: document.metadata, externalChange: null });
    items[2].run();
    expect(openMarkdownFileAtPath).toHaveBeenCalledOnce();
  });

  it("allows a missing file to notify again after it returns, and disposes subscriptions", () => {
    const document = missingDocument();
    setDefaultSession({ documents: [document] });
    stop = followDocumentNotices();
    lastOptions().onClose?.();
    useSessionStore
      .getState()
      .setDocumentFileState(document.path, { metadata: document.metadata, externalChange: null });
    useSessionStore.getState().setDocumentFileState(document.path, {
      metadata: document.metadata,
      externalChange: { kind: "missing" },
    });
    expect(toastManager.add).toHaveBeenCalledTimes(2);
    stop();
    stop = undefined;
    useSessionStore.getState().openTab(missingDocument());
    expect(toastManager.add).toHaveBeenCalledTimes(2);
  });
});
