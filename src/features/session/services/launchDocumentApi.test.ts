import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import { TAKE_LAUNCH_DOCUMENT_PATH_COMMAND, takeLaunchDocumentPath } from "./launchDocumentApi";

describe("launch document API", () => {
  it("takes the path the process was launched with", async () => {
    vi.mocked(invoke).mockResolvedValue("C:\\Notes\\Reunião de equipe.md");

    await expect(takeLaunchDocumentPath()).resolves.toBe("C:\\Notes\\Reunião de equipe.md");
    expect(invoke).toHaveBeenCalledWith(TAKE_LAUNCH_DOCUMENT_PATH_COMMAND);
  });
});
