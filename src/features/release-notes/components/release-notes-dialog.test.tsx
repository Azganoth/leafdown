// @vitest-environment happy-dom

import { openUrl } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { useReleaseNotesStore } from "../stores/releaseNotes";
import { ReleaseNotesDialog } from "./release-notes-dialog";

describe("ReleaseNotesDialog", () => {
  it("shows the running version's bundled notes in the Help renderer and closes by keyboard", async () => {
    useReleaseNotesStore.setState({ currentVersion: "0.1.0-alpha.1", surface: "whatsNew" });
    const { user } = renderWithUser(<ReleaseNotesDialog />);

    expect(screen.getByRole("dialog", { name: "What's new" })).toBeInTheDocument();
    expect(screen.getByText("Changes in Leafdown 0.1.0-alpha.1")).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveTextContent("Initial internal alpha release.");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(useReleaseNotesStore.getState().surface).toBeNull());
  });

  it("shows the complete changelog and sends its external link through the opener", async () => {
    useReleaseNotesStore.setState({ surface: "changelog" });
    const { user } = renderWithUser(<ReleaseNotesDialog />);

    expect(screen.getByRole("dialog", { name: "Changelog" })).toBeInTheDocument();
    const article = screen.getByRole("article");
    expect(article).toHaveTextContent("Initial internal alpha release.");
    expect(within(article).queryByRole("heading", { level: 1 })).toBeNull();
    await user.click(within(article).getByRole("button", { name: "Keep a Changelog" }));
    expect(openUrl).toHaveBeenCalledWith("https://keepachangelog.com/en/1.1.0/");
  });

  it("shows a clear state when the running release has no section", () => {
    vi.stubEnv("DEV", false);
    useReleaseNotesStore.setState({ currentVersion: "9.9.9", surface: "whatsNew" });

    try {
      renderWithUser(<ReleaseNotesDialog />);
      expect(
        screen.getByText("No release notes are available for this version."),
      ).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("moves focus into the dialog and returns it to the opener when closed", async () => {
    useReleaseNotesStore.setState({ currentVersion: "0.1.0-alpha.1" });
    const { user } = renderWithUser(
      <>
        <button
          type="button"
          onClick={() => useReleaseNotesStore.getState().setSurface("changelog")}
        >
          Open changelog
        </button>
        <ReleaseNotesDialog />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Open changelog" }));
    expect(screen.getByRole("dialog", { name: "Changelog" }).contains(document.activeElement)).toBe(
      true,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Open changelog" })).toHaveFocus();
  });
});
