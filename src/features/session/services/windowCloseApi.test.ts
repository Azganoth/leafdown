import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import { DECLINE_WINDOW_CLOSE_COMMAND, declineWindowClose } from "./windowCloseApi";

describe("window close API", () => {
  it("declines the calling window's close request", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await declineWindowClose();

    expect(invoke).toHaveBeenCalledWith(DECLINE_WINDOW_CLOSE_COMMAND);
  });
});
