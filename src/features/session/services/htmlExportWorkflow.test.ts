import { save } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveDocumentKey, type ActiveDocumentState } from "@/features/document";
import { renderHtmlExport, type HtmlExportSnapshot } from "@/features/editor";
import { useSessionStore } from "@/features/session";
import {
  createSavedDocument,
  createUntitledDocument,
  TEST_UNTITLED_DOCUMENT_ID,
} from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { createFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH } from "@/test/fixtures/paths";
import { setDefaultSession } from "@/test/utils/appStores";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { documentEditorBridge } from "./documentEditorBridge";
import {
  exportActiveMarkdownDocumentAsHtml,
  HtmlExportUnavailableError,
} from "./htmlExportWorkflow";

vi.mock("@/features/editor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/editor")>()),
  renderHtmlExport: vi.fn(async () => ({ html: "<!doctype html>\n<html></html>\n", warnings: [] })),
}));

const SNAPSHOT = {
  doc: {},
  imageGrants: { outsideFolderTargets: new Set(), remoteImages: new Map() },
} as unknown as HtmlExportSnapshot;

const setExportableDocument = (
  document: ActiveDocumentState = createSavedDocument({ isDirty: true }),
) => {
  setDefaultSession({ folderContext: createFolderContext(), activeDocument: document });
  const getHtmlExportSnapshot = vi.fn(() => SNAPSHOT);
  documentEditorBridge.set(
    getActiveDocumentKey(document),
    createMilkdownEditorBridge({ getHtmlExportSnapshot }),
  );
  return { getHtmlExportSnapshot };
};

describe("HTML export workflow", () => {
  beforeEach(() => {
    documentEditorBridge.clear();
    mockTauriApi({ writeHtmlExport: () => undefined });
  });

  it("exports a dirty saved document beside it without saving or changing the session", async () => {
    const { getHtmlExportSnapshot } = setExportableDocument();
    const sessionBefore = useSessionStore.getState();
    vi.mocked(save).mockResolvedValue("C:/Notes/out/readme.html");

    await expect(exportActiveMarkdownDocumentAsHtml()).resolves.toEqual({
      status: "exported",
      path: "C:/Notes/out/readme.html",
      warnings: [],
    });

    expect(save).toHaveBeenCalledWith({
      title: "Export as HTML",
      filters: [{ name: "HTML", extensions: ["html", "htm"] }],
      defaultPath: "C:/Notes/readme.html",
    });
    expect(getHtmlExportSnapshot).toHaveBeenCalledTimes(1);
    expect(renderHtmlExport).toHaveBeenCalledWith(SNAPSHOT, {
      documentPath: TEST_MARKDOWN_FILE_PATH,
      folderContextPath: "C:/Notes",
      outputPath: "C:/Notes/out/readme.html",
      title: "readme",
    });
    expect(getLastTauriApiArgs("writeHtmlExport")).toEqual({
      path: "C:/Notes/out/readme.html",
      content: "<!doctype html>\n<html></html>\n",
      sourceDocumentPath: TEST_MARKDOWN_FILE_PATH,
    });
    expect(countTauriApiCalls("saveMarkdownFile")).toBe(0);
    const sessionAfter = useSessionStore.getState();
    expect(sessionAfter.activeDocument).toBe(sessionBefore.activeDocument);
    expect(sessionAfter.activeDocument?.isDirty).toBe(true);
    expect(sessionAfter.folderContext).toBe(sessionBefore.folderContext);
    expect(sessionAfter.activeDocumentGeneration).toBe(sessionBefore.activeDocumentGeneration);
  });

  it.each(["Guide.mdown", "Guide.MKD"])(
    "names the export of %s after the document without its Markdown extension",
    async (fileName) => {
      setExportableDocument(createSavedDocument({ path: `C:/Notes/${fileName}` }));
      vi.mocked(save).mockResolvedValue("C:/Notes/Guide.html");

      await exportActiveMarkdownDocumentAsHtml();

      expect(vi.mocked(save).mock.calls[0][0]?.defaultPath).toBe("C:/Notes/Guide.html");
      expect(vi.mocked(renderHtmlExport).mock.calls[0][1]).toMatchObject({ title: "Guide" });
    },
  );

  it("names an untitled export after Untitled and adds the HTML extension", async () => {
    setExportableDocument(createUntitledDocument());
    vi.mocked(save).mockResolvedValue("C:/Notes/page");

    await expect(exportActiveMarkdownDocumentAsHtml()).resolves.toMatchObject({
      status: "exported",
      path: "C:/Notes/page.html",
    });

    expect(vi.mocked(save).mock.calls[0][0]?.defaultPath).toBe("C:/Notes/Untitled.html");
    expect(renderHtmlExport).toHaveBeenCalledWith(SNAPSHOT, {
      documentPath: null,
      folderContextPath: "C:/Notes",
      outputPath: "C:/Notes/page.html",
      title: "Untitled",
    });
    expect(getLastTauriApiArgs("writeHtmlExport")).toMatchObject({ sourceDocumentPath: null });
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      id: TEST_UNTITLED_DOCUMENT_ID,
    });
  });

  it("writes nothing when the picker is cancelled", async () => {
    const { getHtmlExportSnapshot } = setExportableDocument();
    vi.mocked(save).mockResolvedValue(null);

    await expect(exportActiveMarkdownDocumentAsHtml()).resolves.toEqual({ status: "cancelled" });

    expect(getHtmlExportSnapshot).not.toHaveBeenCalled();
    expect(renderHtmlExport).not.toHaveBeenCalled();
    expect(countTauriApiCalls("writeHtmlExport")).toBe(0);
  });

  it("writes nothing when the document changed while the picker was open", async () => {
    setExportableDocument();
    vi.mocked(save).mockImplementation(async () => {
      useSessionStore.getState().setActiveDocument(createUntitledDocument());
      return "C:/Notes/readme.html";
    });

    await expect(exportActiveMarkdownDocumentAsHtml()).resolves.toEqual({ status: "cancelled" });

    expect(countTauriApiCalls("writeHtmlExport")).toBe(0);
  });

  it("reports a write failure without changing the document", async () => {
    setExportableDocument();
    const sessionBefore = useSessionStore.getState();
    const failure = { kind: "permissionDenied", path: "C:/Locked/readme.html", message: "denied" };
    vi.mocked(save).mockResolvedValue("C:/Locked/readme.html");
    mockTauriApi({ writeHtmlExport: () => Promise.reject(failure) });

    await expect(exportActiveMarkdownDocumentAsHtml()).rejects.toEqual(failure);

    expect(useSessionStore.getState().activeDocument).toBe(sessionBefore.activeDocument);
  });

  it("fails without writing when the editor cannot provide the document", async () => {
    setDefaultSession({ activeDocument: createSavedDocument() });
    vi.mocked(save).mockResolvedValue("C:/Notes/readme.html");

    await expect(exportActiveMarkdownDocumentAsHtml()).rejects.toBeInstanceOf(
      HtmlExportUnavailableError,
    );

    expect(countTauriApiCalls("writeHtmlExport")).toBe(0);
  });

  it("does nothing without an active document", async () => {
    setDefaultSession({ activeDocument: null });

    await expect(exportActiveMarkdownDocumentAsHtml()).resolves.toEqual({ status: "cancelled" });

    expect(save).not.toHaveBeenCalled();
  });
});
