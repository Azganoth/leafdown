import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";

import { useArticleNavigatorStore } from "@/features/folder-context";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import { exportActiveMarkdownDocumentAsHtml } from "@/features/session";
import { toastManager } from "@/lib/toast";
import { createAppCommandContext } from "@/test/factories/commands";
import { createSavedDocument } from "@/test/factories/document";
import { createFolderContextWithNestedReadme } from "@/test/factories/folderContext";
import {
  TEST_MARKDOWN_FILE_PATH,
  TEST_NESTED_DIRECTORY_PATH,
  TEST_NESTED_MARKDOWN_FILE_PATH,
} from "@/test/fixtures/paths";
import { setDefaultRecentItems, setDefaultSettings } from "@/test/utils/appStores";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import { useCommandUIStore } from "../stores/commandUi";
import {
  clearRecentItems,
  exportDocumentAsHtml,
  openMarkdownFile,
  openLocation,
  openPreferences,
  openRecentMarkdownFile,
  revealInSidebar,
} from "./file";

vi.mock("@/features/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/session")>()),
  exportActiveMarkdownDocumentAsHtml: vi.fn(),
}));

const OVERSIZED_MARKDOWN_FILE_PATH = "C:/Notes/large-document.md";
const OVERSIZED_MARKDOWN_FILE_ERROR = {
  kind: "oversizedFile",
  path: OVERSIZED_MARKDOWN_FILE_PATH,
  sizeBytes: 5 * 1024 * 1024 + 1024,
  maxSizeBytes: 5 * 1024 * 1024,
} as const;

const expectOversizedMarkdownFileToast = () => {
  expect(toastManager.add).toHaveBeenCalledWith({
    description: "5.0 MB selected. Files larger than 5 MB do not load.",
    title: "Markdown file is too large.",
    type: "error",
  });
};

describe("file actions", () => {
  it("clears recent items", () => {
    setDefaultRecentItems({ recentFiles: [{ path: TEST_MARKDOWN_FILE_PATH }] });
    clearRecentItems();
    expect(useRecentItemsStore.getState().recentFiles).toEqual([]);
  });

  it("reports oversized files selected through File > Open", async () => {
    vi.mocked(open).mockResolvedValueOnce(OVERSIZED_MARKDOWN_FILE_PATH);
    mockTauriApiCommand("openMarkdownFile", () => Promise.reject(OVERSIZED_MARKDOWN_FILE_ERROR));

    await openMarkdownFile();

    expectOversizedMarkdownFileToast();
    expect(useRecentItemsStore.getState().recentFiles).not.toContainEqual(
      expect.objectContaining({ path: OVERSIZED_MARKDOWN_FILE_PATH }),
    );
  });

  it("reports oversized recent files", async () => {
    mockTauriApiCommand("openMarkdownFile", () => Promise.reject(OVERSIZED_MARKDOWN_FILE_ERROR));

    await openRecentMarkdownFile(OVERSIZED_MARKDOWN_FILE_PATH);

    expectOversizedMarkdownFileToast();
    expect(useRecentItemsStore.getState().recentFiles).not.toContainEqual(
      expect.objectContaining({ path: OVERSIZED_MARKDOWN_FILE_PATH }),
    );
  });

  it("reveals the active article and opens the sidebar", () => {
    setDefaultSettings({ sidebarVisible: false });

    revealInSidebar(
      createAppCommandContext({
        activeDocument: createSavedDocument({
          path: TEST_NESTED_MARKDOWN_FILE_PATH,
        }),
        folderContext: createFolderContextWithNestedReadme(),
      }),
    );

    expect(useSettingsStore.getState().sidebarVisible).toBe(true);
    expect(useArticleNavigatorStore.getState()).toMatchObject({
      expandedDirectoryPaths: [TEST_NESTED_DIRECTORY_PATH],
      revealPath: TEST_NESTED_MARKDOWN_FILE_PATH,
      revealRequestId: 1,
    });
  });

  it("opens the active file location only when a saved path is available", async () => {
    void openLocation(createAppCommandContext());
    expect(revealItemInDir).not.toHaveBeenCalled();

    void openLocation(createAppCommandContext({ activeDocument: createSavedDocument() }));

    await vi.waitFor(() => {
      expect(revealItemInDir).toHaveBeenCalledWith(TEST_MARKDOWN_FILE_PATH);
    });
  });

  it("shows a command error when opening the active file location fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(revealItemInDir).mockRejectedValueOnce(new Error("missing folder"));

    void openLocation(createAppCommandContext({ activeDocument: createSavedDocument() }));

    await vi.waitFor(() => {
      expect(toastManager.add).toHaveBeenCalledWith({
        description: "missing folder",
        title: "Could not open file location.",
        type: "error",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Unexpected error (openLocation).",
        expect.any(Error),
      );
    });
  });

  describe("HTML export", () => {
    const EXPORT_PATH = "C:/Notes/readme.html";

    it("confirms a complete export", async () => {
      vi.mocked(exportActiveMarkdownDocumentAsHtml).mockResolvedValueOnce({
        status: "exported",
        path: EXPORT_PATH,
        warnings: [],
      });

      await exportDocumentAsHtml();

      expect(toastManager.add).toHaveBeenCalledWith({
        description: EXPORT_PATH,
        title: "Document exported as HTML.",
        type: "success",
      });
    });

    it("lists what the export left out", async () => {
      vi.mocked(exportActiveMarkdownDocumentAsHtml).mockResolvedValueOnce({
        status: "exported",
        path: EXPORT_PATH,
        warnings: [
          { kind: "image", target: "a.png", reason: "missing" },
          { kind: "image", target: "https://x.example/b.png", reason: "remote" },
          { kind: "diagram" },
          { kind: "mathFonts" },
        ],
      });

      await exportDocumentAsHtml();

      expect(toastManager.add).toHaveBeenCalledWith({
        description:
          "Image not found: a.png. Remote image was not loaded: https://x.example/b.png. A diagram that could not be rendered is shown as source. 1 more.",
        title: "Document exported as HTML with 4 items left out.",
        type: "warning",
      });
    });

    it("stays quiet when the picker is cancelled", async () => {
      vi.mocked(exportActiveMarkdownDocumentAsHtml).mockResolvedValueOnce({ status: "cancelled" });

      await exportDocumentAsHtml();

      expect(toastManager.add).not.toHaveBeenCalled();
    });

    it("reports a refused output path", async () => {
      vi.mocked(exportActiveMarkdownDocumentAsHtml).mockRejectedValueOnce({
        kind: "sourceDocument",
        path: EXPORT_PATH,
      });

      await exportDocumentAsHtml();

      expect(toastManager.add).toHaveBeenCalledWith({
        description: EXPORT_PATH,
        title: "Export cannot replace the document being exported.",
        type: "error",
      });
    });
  });

  it("opens preferences dialog through UI store", () => {
    useCommandUIStore.getState().setPreferencesOpen(false);
    openPreferences();
    expect(useCommandUIStore.getState().preferencesOpen).toBe(true);
  });
});
