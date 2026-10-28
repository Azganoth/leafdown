// @vitest-environment happy-dom

import { getCurrentWindow } from "@tauri-apps/api/window";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MARKDOWN_DOCUMENT_CHANGED_EVENT,
  type MarkdownDocumentChangedEventPayload,
} from "@/features/document";
import { toastManager } from "@/lib/toast";
import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import { createFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH } from "@/test/fixtures/paths";
import { closeActiveTab, replaceActiveDocument, setDefaultSession } from "@/test/utils/appStores";
import { findDiagnosticPayload } from "@/test/utils/diagnostics";
import { act, renderHook } from "@/test/utils/react";
import { getWindowListenHandler } from "@/test/utils/tauri";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { useSessionStore } from "../stores/session";
import {
  DOCUMENT_WATCH_CHECK_DELAY_MS,
  resetDocumentWatcherScopeGenerationForTests,
  useDocumentWatchers,
} from "./useDocumentWatchers";

const OUTSIDE_MARKDOWN_PATH = "C:/Elsewhere/outside.md";
const RENAMED_MARKDOWN_PATH = "C:/Notes/intro.md";

const mockWatcherCommands = (handlers: Parameters<typeof mockTauriApi>[0] = {}) => {
  mockTauriApi({
    watchMarkdownDocument: () => undefined,
    unwatchMarkdownDocument: () => undefined,
    inspectMarkdownFile: () => ({ kind: "unchanged" }),
    ...handlers,
  });
};

const emitDocumentChanged = (path: string) => {
  getWindowListenHandler<MarkdownDocumentChangedEventPayload>(MARKDOWN_DOCUMENT_CHANGED_EVENT)({
    payload: { path },
  });
};

const settle = async (delayMs = DOCUMENT_WATCH_CHECK_DELAY_MS) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(delayMs);
  });
};

describe("useDocumentWatchers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDocumentWatcherScopeGenerationForTests();
    mockWatcherCommands();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not watch without a saved document", async () => {
    setDefaultSession({ activeDocument: createUntitledDocument() });

    renderHook(() => useDocumentWatchers());
    await settle();

    expect(getCurrentWindow().listen).not.toHaveBeenCalled();
    expect(countTauriApiCalls("watchMarkdownDocument")).toBe(0);
    expect(countTauriApiCalls("inspectMarkdownFile")).toBe(0);
  });

  it.each([
    ["inside the folder context", TEST_MARKDOWN_FILE_PATH, createFolderContext()],
    ["outside the folder context", OUTSIDE_MARKDOWN_PATH, createFolderContext()],
    ["without a folder context", OUTSIDE_MARKDOWN_PATH, null],
  ])("watches a saved document %s and checks it once watching", async (_, path, folderContext) => {
    setDefaultSession({ activeDocument: createSavedDocument({ path }), folderContext });

    renderHook(() => useDocumentWatchers());
    await settle();

    expect(getCurrentWindow().listen).toHaveBeenCalledWith(
      MARKDOWN_DOCUMENT_CHANGED_EVENT,
      expect.any(Function),
    );
    expect(getLastTauriApiArgs("watchMarkdownDocument")).toEqual({
      path,
      scopeId: "document-watch:1",
    });
    expect(getLastTauriApiArgs("inspectMarkdownFile")).toMatchObject({ path });
    expect(
      findDiagnosticPayload("info", "operationLifecycle", {
        documentPath: path,
        feature: "document",
        operation: "documentWatcher",
        phase: "started",
      }),
    ).toBeDefined();
  });

  it("checks the document once for a burst of change events", async () => {
    setDefaultSession({ activeDocument: createSavedDocument() });
    renderHook(() => useDocumentWatchers());
    await settle();

    emitDocumentChanged(TEST_MARKDOWN_FILE_PATH);
    emitDocumentChanged("c:\\notes\\README.md");
    await settle(DOCUMENT_WATCH_CHECK_DELAY_MS / 2);
    emitDocumentChanged(TEST_MARKDOWN_FILE_PATH);

    expect(countTauriApiCalls("inspectMarkdownFile")).toBe(1);

    await settle();

    expect(countTauriApiCalls("inspectMarkdownFile")).toBe(2);
  });

  it("ignores change events for another document", async () => {
    setDefaultSession({ activeDocument: createSavedDocument() });
    renderHook(() => useDocumentWatchers());
    await settle();

    emitDocumentChanged(OUTSIDE_MARKDOWN_PATH);
    await settle();

    expect(countTauriApiCalls("inspectMarkdownFile")).toBe(1);
  });

  it("moves the watch when the document's path changes and stops it on close", async () => {
    const unlisten = vi.fn();
    vi.mocked(getCurrentWindow().listen).mockResolvedValue(unlisten);
    setDefaultSession({ activeDocument: createSavedDocument() });
    const { rerender } = renderHook(() => useDocumentWatchers());
    await settle();

    act(() => replaceActiveDocument(createSavedDocument({ path: RENAMED_MARKDOWN_PATH })));
    rerender();
    await settle();

    expect(unlisten).toHaveBeenCalledOnce();
    expect(getLastTauriApiArgs("unwatchMarkdownDocument")).toEqual({
      scopeId: "document-watch:1",
    });
    expect(getLastTauriApiArgs("watchMarkdownDocument")).toEqual({
      path: RENAMED_MARKDOWN_PATH,
      scopeId: "document-watch:2",
    });

    act(() => closeActiveTab());
    rerender();
    await settle();

    expect(unlisten).toHaveBeenCalledTimes(2);
    expect(getLastTauriApiArgs("unwatchMarkdownDocument")).toEqual({
      scopeId: "document-watch:2",
    });
  });

  it("watches each open saved document and stops only the one whose tab closes", async () => {
    setDefaultSession({
      documents: [
        createSavedDocument(),
        createUntitledDocument(),
        createSavedDocument({ path: OUTSIDE_MARKDOWN_PATH }),
      ],
    });
    renderHook(() => useDocumentWatchers());
    await settle();

    expect(countTauriApiCalls("watchMarkdownDocument")).toBe(2);
    expect(countTauriApiCalls("inspectMarkdownFile")).toBe(2);

    emitDocumentChanged(OUTSIDE_MARKDOWN_PATH);
    await settle();

    expect(getLastTauriApiArgs("inspectMarkdownFile")).toMatchObject({
      path: OUTSIDE_MARKDOWN_PATH,
    });

    act(() => useSessionStore.getState().closeTabs([useSessionStore.getState().tabs[2].id]));
    await settle();

    expect(countTauriApiCalls("unwatchMarkdownDocument")).toBe(1);
    expect(getLastTauriApiArgs("unwatchMarkdownDocument")).toEqual({
      scopeId: "document-watch:2",
    });

    act(() => useSessionStore.getState().activateTab(useSessionStore.getState().tabs[1].id));
    await settle();

    expect(countTauriApiCalls("watchMarkdownDocument")).toBe(2);
    expect(countTauriApiCalls("unwatchMarkdownDocument")).toBe(1);
  });

  it("does not stop a watch it closed before asking to start", async () => {
    const listener = Promise.withResolvers<() => void>();
    vi.mocked(getCurrentWindow().listen).mockReturnValue(listener.promise);
    setDefaultSession({ activeDocument: createSavedDocument() });
    const { rerender } = renderHook(() => useDocumentWatchers());

    act(() => closeActiveTab());
    rerender();
    listener.resolve(vi.fn<() => void>());
    await settle();

    expect(countTauriApiCalls("watchMarkdownDocument")).toBe(0);
    expect(countTauriApiCalls("unwatchMarkdownDocument")).toBe(0);
  });

  it("stops a watch whose start failed", async () => {
    setDefaultSession({ activeDocument: createSavedDocument() });
    mockWatcherCommands({
      watchMarkdownDocument: () =>
        Promise.reject({ kind: "watcherStateFailed", message: "poisoned" }),
    });
    const { unmount } = renderHook(() => useDocumentWatchers());
    await settle();

    unmount();

    expect(getLastTauriApiArgs("unwatchMarkdownDocument")).toEqual({
      scopeId: "document-watch:1",
    });
  });

  it("drops a pending check when the document closes", async () => {
    setDefaultSession({ activeDocument: createSavedDocument() });
    const { rerender } = renderHook(() => useDocumentWatchers());
    await settle();

    emitDocumentChanged(TEST_MARKDOWN_FILE_PATH);
    act(() => closeActiveTab());
    rerender();
    await settle();

    expect(countTauriApiCalls("inspectMarkdownFile")).toBe(1);
  });

  it("logs a watch that cannot start and still checks the document", async () => {
    setDefaultSession({ activeDocument: createSavedDocument() });
    mockWatcherCommands({
      watchMarkdownDocument: () =>
        Promise.reject({
          kind: "watchFailed",
          path: TEST_MARKDOWN_FILE_PATH,
          message: "The system cannot find the path specified.",
        }),
      inspectMarkdownFile: () => ({ kind: "missing" }),
    });

    renderHook(() => useDocumentWatchers());
    await settle();

    expect(
      findDiagnosticPayload("warn", "operationFailed", {
        errorKind: "watchFailed",
        feature: "document",
        operation: "documentWatcher",
        phase: "starting",
      }),
    ).toBeDefined();
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      externalChange: { kind: "missing" },
    });
    expect(toastManager.add).not.toHaveBeenCalled();
  });
});
