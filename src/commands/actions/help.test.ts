import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { useCommandUIStore } from "../stores/commandUi";
import { openAbout, openDevTools } from "./help";

describe("help actions", () => {
  it("opens webview DevTools through the backend command", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await openDevTools();

    expect(invoke).toHaveBeenCalledWith("open_webview_devtools");
  });

  it("reports DevTools opening failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(invoke).mockRejectedValue(new Error("DevTools unavailable"));

    await openDevTools();

    expect(toast.error).toHaveBeenCalledWith("Could not open DevTools.", {
      description: "DevTools unavailable",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (help.openDevTools).",
      expect.any(Error),
    );
  });

  it("opens about dialog through UI store", () => {
    useCommandUIStore.getState().setAboutOpen(false);
    openAbout();
    expect(useCommandUIStore.getState().aboutOpen).toBe(true);
  });
});
