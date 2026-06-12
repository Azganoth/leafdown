import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStore } from "@/stores/session";
import { resetAppStores, setDefaultSession } from "@/test/fixtures/appStores";
import { openMarkdownFilePath } from "./openMarkdownFile";
import { openMarkdownFolderPath } from "./openMarkdownFolder";

describe("open Markdown dirty transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockReset();
    vi.mocked(confirm).mockReset();
    vi.mocked(confirm).mockResolvedValue(false);
    resetAppStores();
  });

  it("cancels open-file transitions before reading a new target", async () => {
    setDefaultSession({
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Local",
        isDirty: true,
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1 },
      },
    });

    await expect(openMarkdownFilePath("C:/Notes/other.md")).resolves.toBe(false);

    expect(invoke).not.toHaveBeenCalled();
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "saved",
      path: "C:/Notes/readme.md",
      content: "# Local",
      isDirty: true,
    });
  });

  it("cancels open-folder transitions before scanning a new folder", async () => {
    setDefaultSession({
      activeDocument: {
        status: "untitled",
        id: "untitled:test",
        content: "Draft",
        isDirty: true,
        lineEnding: "lf",
      },
    });

    await expect(openMarkdownFolderPath("C:/Other")).resolves.toBe(false);

    expect(invoke).not.toHaveBeenCalled();
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      status: "untitled",
      id: "untitled:test",
      content: "Draft",
      isDirty: true,
    });
  });
});
