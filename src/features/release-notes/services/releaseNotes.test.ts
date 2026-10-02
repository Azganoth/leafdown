import { getVersion } from "@tauri-apps/api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RELEASE_NOTES_STATE_VERSION,
  releaseNotesStoreTauriHandler,
  sanitizeReleaseNotesPersistedState,
  useReleaseNotesStore,
} from "../stores/releaseNotes";
import { getCurrentReleaseNotes } from "./bundledChangelog";
import { initializeReleaseNotes, showChangelog, showWhatsNew } from "./releaseNotes";

describe("release notes lifecycle", () => {
  beforeEach(() => {
    vi.mocked(getVersion).mockResolvedValue("0.1.0-alpha.1");
  });

  it("records the first installation without automatically opening notes", async () => {
    await initializeReleaseNotes();

    expect(useReleaseNotesStore.getState()).toMatchObject({
      currentVersion: "0.1.0-alpha.1",
      lastVersion: "0.1.0-alpha.1",
      seenVersions: [],
      surface: null,
    });
  });

  it("opens once on an upgrade with usable notes, then persists seen state", async () => {
    useReleaseNotesStore.setState({ lastVersion: "0.0.1" });

    await initializeReleaseNotes();
    expect(useReleaseNotesStore.getState()).toMatchObject({
      lastVersion: "0.1.0-alpha.1",
      seenVersions: ["0.1.0-alpha.1"],
      surface: "whatsNew",
    });

    useReleaseNotesStore.getState().setSurface(null);
    await initializeReleaseNotes();
    expect(useReleaseNotesStore.getState().surface).toBeNull();
  });

  it("keeps a previously seen version dismissed across another transition", async () => {
    useReleaseNotesStore.setState({
      lastVersion: "0.0.1",
      seenVersions: ["0.1.0-alpha.1"],
    });

    await initializeReleaseNotes();
    expect(useReleaseNotesStore.getState().surface).toBeNull();
  });

  it("does not automatically open an upgrade without usable notes", async () => {
    vi.stubEnv("DEV", false);
    vi.mocked(getVersion).mockResolvedValue("9.9.9");
    useReleaseNotesStore.setState({ lastVersion: "0.0.1" });

    try {
      await initializeReleaseNotes();
      expect(getCurrentReleaseNotes("9.9.9")).toBeNull();
      expect(useReleaseNotesStore.getState()).toMatchObject({
        lastVersion: "9.9.9",
        seenVersions: [],
        surface: null,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("marks manual What's new as seen and allows reopening", async () => {
    await showWhatsNew();
    expect(useReleaseNotesStore.getState()).toMatchObject({
      seenVersions: ["0.1.0-alpha.1"],
      surface: "whatsNew",
    });

    useReleaseNotesStore.getState().setSurface(null);
    await showWhatsNew();
    expect(useReleaseNotesStore.getState().seenVersions).toEqual(["0.1.0-alpha.1"]);
    expect(useReleaseNotesStore.getState().surface).toBe("whatsNew");

    showChangelog();
    expect(useReleaseNotesStore.getState().surface).toBe("changelog");
  });

  it("sanitizes persisted history and persists only its contracted fields", () => {
    expect(
      sanitizeReleaseNotesPersistedState({
        lastVersion: "1.0.0",
        seenVersions: ["1.0.0"],
        version: RELEASE_NOTES_STATE_VERSION,
        surface: "whatsNew",
      } as never),
    ).toEqual({
      changed: true,
      state: {
        lastVersion: "1.0.0",
        seenVersions: ["1.0.0"],
        version: RELEASE_NOTES_STATE_VERSION,
      },
    });
    expect(
      sanitizeReleaseNotesPersistedState({
        lastVersion: 42,
        seenVersions: "1.0.0",
        version: RELEASE_NOTES_STATE_VERSION,
      } as never),
    ).toEqual({ changed: true, state: { version: RELEASE_NOTES_STATE_VERSION } });
    expect(releaseNotesStoreTauriHandler).toBeDefined();
  });
});
