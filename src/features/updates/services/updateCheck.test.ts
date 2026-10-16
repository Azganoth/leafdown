import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";

import { toastManager } from "@/lib/toast";
import { countTauriApiCalls, mockTauriApiCommand } from "@/test/utils/tauriApi";

import { checkForNewerRelease } from "./updateCheck";
import type { CheckForUpdatesError } from "./updateCheckApi";

const RELEASE_URL = "https://github.com/Azganoth/leafdown/releases/tag/v0.1.0-alpha.4";

const lastUpdate = () => {
  const [toastId, updates] = vi.mocked(toastManager.update).mock.lastCall ?? [];

  return { toastId, updates };
};

const clickToastAction = () => {
  const { updates } = lastUpdate();
  const onClick = typeof updates === "object" ? updates.actionProps?.onClick : undefined;

  expect(onClick).toBeDefined();
  (onClick as () => void)();
};

const spyOnToastUpdates = () => {
  vi.spyOn(toastManager, "update").mockImplementation(() => undefined);
  vi.spyOn(toastManager, "close").mockImplementation(() => undefined);
};

describe("checkForNewerRelease", () => {
  it("sends nothing with the check and reports an up-to-date build", async () => {
    spyOnToastUpdates();
    mockTauriApiCommand("checkForUpdates", () => ({
      kind: "upToDate",
      currentVersion: "0.1.0-alpha.3",
    }));

    await checkForNewerRelease();

    expect(toastManager.add).toHaveBeenCalledWith({
      title: "Checking for updates…",
      type: "loading",
    });
    expect(vi.mocked(invoke).mock.calls).toEqual([["check_for_updates"]]);
    expect(lastUpdate()).toEqual({
      toastId: "test-toast",
      updates: {
        description: "You have 0.1.0-alpha.3.",
        title: "Leafdown is up to date.",
        type: "success",
      },
    });
  });

  it("offers a newer release until it is dismissed or opened", async () => {
    spyOnToastUpdates();
    mockTauriApiCommand("checkForUpdates", () => ({
      kind: "available",
      currentVersion: "0.1.0-alpha.3",
      version: "0.1.0-alpha.4",
      releaseUrl: RELEASE_URL,
    }));

    await checkForNewerRelease();

    const { updates } = lastUpdate();

    expect(updates).toMatchObject({
      description: "You have 0.1.0-alpha.3.",
      timeout: 0,
      title: "Leafdown 0.1.0-alpha.4 is available.",
      type: "info",
      actionProps: { children: "View release" },
    });
    expect(openUrl).not.toHaveBeenCalled();

    clickToastAction();

    expect(toastManager.close).toHaveBeenCalledWith("test-toast");
    await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith(RELEASE_URL));
  });

  it("reports a release page that could not be opened", async () => {
    spyOnToastUpdates();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(openUrl).mockRejectedValue(new Error("Browser unavailable"));
    mockTauriApiCommand("checkForUpdates", () => ({
      kind: "available",
      currentVersion: "0.1.0-alpha.3",
      version: "0.1.0-alpha.4",
      releaseUrl: RELEASE_URL,
    }));

    await checkForNewerRelease();
    clickToastAction();

    await vi.waitFor(() =>
      expect(toastManager.add).toHaveBeenCalledWith({
        description: "Browser unavailable",
        title: "Could not open the release page.",
        type: "error",
      }),
    );
  });

  it.each<[CheckForUpdatesError["kind"], string]>([
    ["network", "Leafdown could not reach GitHub. Check the connection and try again."],
    ["timeout", "GitHub did not respond in time. Try again later."],
    ["rateLimited", "GitHub is limiting requests from this network. Try again later."],
    ["unexpectedResponse", "GitHub sent a response Leafdown could not read."],
  ])("reports a %s failure without retrying", async (kind, description) => {
    spyOnToastUpdates();
    mockTauriApiCommand("checkForUpdates", () => {
      throw { kind };
    });

    await checkForNewerRelease();

    expect(lastUpdate().updates).toEqual({
      description,
      title: "Could not check for updates.",
      type: "error",
    });
    expect(countTauriApiCalls("checkForUpdates")).toBe(1);
  });

  it("reports an unclassified failure as unexpected", async () => {
    spyOnToastUpdates();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockTauriApiCommand("checkForUpdates", () => {
      throw new Error("Command not found");
    });

    await checkForNewerRelease();

    expect(lastUpdate().updates).toEqual({
      description: "Command not found",
      title: "Could not check for updates.",
      type: "error",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (updates.check).",
      expect.any(Error),
    );
  });

  it("joins a check already in progress instead of starting another", async () => {
    spyOnToastUpdates();
    let finish = () => undefined as void;
    mockTauriApiCommand(
      "checkForUpdates",
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ kind: "upToDate", currentVersion: "0.1.0-alpha.3" });
        }),
    );

    const first = checkForNewerRelease();
    const second = checkForNewerRelease();

    await vi.waitFor(() => expect(countTauriApiCalls("checkForUpdates")).toBe(1));
    finish();
    await Promise.all([first, second]);

    expect(toastManager.add).toHaveBeenCalledTimes(1);
    expect(toastManager.update).toHaveBeenCalledTimes(1);

    const third = checkForNewerRelease();

    finish();
    await third;

    expect(countTauriApiCalls("checkForUpdates")).toBe(2);
  });
});
