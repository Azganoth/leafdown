import { describe, expect, it, vi } from "vitest";

import { documentEditorBridge } from "@/features/session";
import { toastManager } from "@/lib/toast";
import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { mockInvokeCommands } from "@/test/utils/tauri";

import { INSPECT_DROPPED_PATH_COMMAND } from "./dropApi";
import { getRelativePath, handleDroppedPaths } from "./dropWorkflows";

const openSessionMocks = vi.hoisted(() => ({
  openFolderContextAtPath: vi.fn(async () => true),
  openMarkdownFileAtPath: vi.fn(async () => true),
}));

vi.mock("./openSession", () => openSessionMocks);

const inspectAs = (result: { kind: "folder" | "markdownFile" | "unsupported"; path: string }) => {
  mockInvokeCommands({
    [INSPECT_DROPPED_PATH_COMMAND]: () => result,
  });
};

describe("dropped path workflows", () => {
  it("opens dropped Markdown files and folders under the default settings", async () => {
    inspectAs({ kind: "markdownFile", path: "C:/Notes/guide.md" });

    await expect(handleDroppedPaths(["C:\\Notes\\guide.md"])).resolves.toBe(true);
    expect(openSessionMocks.openMarkdownFileAtPath).toHaveBeenCalledWith("C:/Notes/guide.md");

    inspectAs({ kind: "folder", path: "C:/Notes/Guides" });

    await expect(handleDroppedPaths(["C:\\Notes\\Guides"])).resolves.toBe(true);
    expect(openSessionMocks.openFolderContextAtPath).toHaveBeenCalledWith("C:/Notes/Guides");
  });

  it("inserts relative file links into saved documents", async () => {
    const insertLink = vi.fn(() => true);
    const document = createSavedDocument({ path: "C:/Notes/drafts/readme.md" });
    setDefaultSettings({ whenDroppingMarkdownFile: "insertLink" });
    setDefaultSession({ activeDocument: document });
    documentEditorBridge.set(document.path, createMilkdownEditorBridge({ insertLink }));
    inspectAs({ kind: "markdownFile", path: "C:/Notes/guides/setup.md" });

    await expect(handleDroppedPaths(["C:/Notes/guides/setup.md"])).resolves.toBe(true);
    expect(insertLink).toHaveBeenCalledWith("setup.md", "../guides/setup.md");
  });

  it("inserts absolute folder links into untitled documents", async () => {
    const insertLink = vi.fn(() => true);
    const document = createUntitledDocument();
    setDefaultSettings({ whenDroppingFolder: "insertLink" });
    setDefaultSession({ activeDocument: document });
    documentEditorBridge.set(document.id, createMilkdownEditorBridge({ insertLink }));
    inspectAs({ kind: "folder", path: "C:/Notes/Guides" });

    await expect(handleDroppedPaths(["C:/Notes/Guides"])).resolves.toBe(true);
    expect(insertLink).toHaveBeenCalledWith("Guides", "C:/Notes/Guides");
  });

  it("rejects insert drops without an active document", async () => {
    setDefaultSettings({ whenDroppingMarkdownFile: "insertLink" });
    inspectAs({ kind: "markdownFile", path: "C:/Notes/guide.md" });

    await expect(handleDroppedPaths(["C:/Notes/guide.md"])).resolves.toBe(false);
    expect(toastManager.add).toHaveBeenCalledWith({
      title: "Open a document before inserting a dropped link.",
      type: "warning",
    });
  });

  it("rejects multi-item and unsupported drops", async () => {
    await expect(handleDroppedPaths(["C:/one.md", "C:/two.md"])).resolves.toBe(false);
    expect(toastManager.add).toHaveBeenCalledWith({
      title: "Drop one item at a time.",
      type: "warning",
    });

    inspectAs({ kind: "unsupported", path: "C:/Notes/image.png" });

    await expect(handleDroppedPaths(["C:/Notes/image.png"])).resolves.toBe(false);
    expect(toastManager.add).toHaveBeenCalledWith({
      description: "C:/Notes/image.png",
      title: "Drop a Markdown file or folder.",
      type: "warning",
    });
  });

  it("derives portable relative targets without crossing path roots", () => {
    expect(getRelativePath("C:/Notes/drafts", "c:\\Notes\\guides\\setup.md")).toBe(
      "../guides/setup.md",
    );
    expect(getRelativePath("C:/Notes", "D:/Guides/setup.md")).toBeNull();
    expect(getRelativePath("/home/notes", "/home/notes/guide.md")).toBe("guide.md");
    expect(getRelativePath("//server/share/notes", "//SERVER/SHARE/guides")).toBe("../guides");
  });
});
