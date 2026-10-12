import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { describe, expect, it, vi } from "vitest";

import {
  LAUNCH_DOCUMENTS_EVENT,
  listenForLaunchDocuments,
  TAKE_LAUNCH_DOCUMENT_PATHS_COMMAND,
  takeLaunchDocumentPaths,
} from "./launchDocumentApi";

describe("launch document API", () => {
  it("takes the paths launches asked this window to open", async () => {
    vi.mocked(invoke).mockResolvedValue(["C:\\Notes\\Reunião de equipe.md"]);

    await expect(takeLaunchDocumentPaths()).resolves.toEqual(["C:\\Notes\\Reunião de equipe.md"]);
    expect(invoke).toHaveBeenCalledWith(TAKE_LAUNCH_DOCUMENT_PATHS_COMMAND);
  });

  it("listens on this window for documents a later launch routes here", async () => {
    const handler = vi.fn();

    await listenForLaunchDocuments(handler);

    expect(getCurrentWindow().listen).toHaveBeenCalledWith(LAUNCH_DOCUMENTS_EVENT, handler);
  });
});
