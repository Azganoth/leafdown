import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import { INSPECT_DROPPED_PATH_COMMAND, inspectDroppedPath } from "./dropApi";

describe("drop API", () => {
  it("inspects a dropped native path", async () => {
    vi.mocked(invoke).mockResolvedValue({ kind: "folder", path: "C:/Notes" });

    await expect(inspectDroppedPath({ path: "C:\\Notes" })).resolves.toEqual({
      kind: "folder",
      path: "C:/Notes",
    });
    expect(invoke).toHaveBeenCalledWith(INSPECT_DROPPED_PATH_COMMAND, {
      path: "C:\\Notes",
    });
  });
});
