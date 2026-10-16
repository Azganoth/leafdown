// @vitest-environment happy-dom

import { openUrl } from "@tauri-apps/plugin-opener";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { getBundledChangelog, getReleaseNotesPages } from "../services/bundledChangelog";
import { useReleaseNotesStore } from "../stores/releaseNotes";
import { ReleaseNotesDialog } from "./release-notes-dialog";

const releaseList = () => screen.getByRole("combobox", { name: "Release" });
const newerButton = () => screen.getByRole("button", { name: /^Newer/u });
const olderButton = () => screen.getByRole("button", { name: /^Older/u });
const bundledVersions = (development: boolean) =>
  getReleaseNotesPages(getBundledChangelog(), development).map((page) => page.version);

const openWhatsNew = (currentVersion: string, development: boolean) => {
  vi.stubEnv("DEV", development);
  useReleaseNotesStore.setState({ currentVersion, surface: "whatsNew" });
  return renderWithUser(<ReleaseNotesDialog />);
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ReleaseNotesDialog", () => {
  it("shows the running version's bundled notes in the Help renderer and closes by keyboard", async () => {
    const { user } = openWhatsNew("0.1.0-alpha.1", false);

    expect(screen.getByRole("dialog", { name: "What's new" })).toBeInTheDocument();
    expect(screen.getByText("Changes in Leafdown 0.1.0-alpha.1")).toBeInTheDocument();
    expect(screen.getByText("July 10, 2026")).toHaveAttribute("datetime", "2026-07-10");
    expect(screen.getByRole("article")).toHaveTextContent("Initial internal alpha release.");
    expect(releaseList()).toHaveTextContent("0.1.0-alpha.1");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(useReleaseNotesStore.getState().surface).toBeNull());
  });

  it("lists every bundled release with notes, newest first, without Unreleased in release builds", async () => {
    const { user } = openWhatsNew("0.1.0-alpha.1", false);

    await user.click(releaseList());
    const versions = screen.getAllByRole("option").map((option) => option.textContent);
    expect(versions).toEqual(bundledVersions(false));
    expect(versions.slice(-3)).toEqual(["0.1.0-alpha.3", "0.1.0-alpha.2", "0.1.0-alpha.1"]);
    expect(versions).not.toContain("Unreleased");
  });

  it("lists the same pages in development builds, with Unreleased first when it has notes", async () => {
    const { user } = openWhatsNew("0.1.0-alpha.1", true);

    await user.click(releaseList());
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(
      bundledVersions(true),
    );
  });

  it("steps between releases from both ends without leaving the dialog", async () => {
    const { user } = openWhatsNew("0.1.0-alpha.2", false);
    const dialog = screen.getByRole("dialog", { name: "What's new" });

    expect(newerButton()).toHaveAccessibleName("Newer release: 0.1.0-alpha.3");
    expect(olderButton()).toHaveAccessibleName("Older release: 0.1.0-alpha.1");

    await user.click(olderButton());
    expect(screen.getByText("Changes in Leafdown 0.1.0-alpha.1")).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveTextContent("Initial internal alpha release.");
    expect(olderButton()).toHaveAccessibleName("Older");
    expect(olderButton()).toHaveAttribute("aria-disabled", "true");
    expect(olderButton()).toHaveFocus();

    await user.click(olderButton());
    expect(screen.getByText("Changes in Leafdown 0.1.0-alpha.1")).toBeInTheDocument();

    newerButton().focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Changes in Leafdown 0.1.0-alpha.2")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Changes in Leafdown 0.1.0-alpha.3")).toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.click(releaseList());
    await user.click(screen.getAllByRole("option")[0]);
    expect(newerButton()).toHaveAccessibleName("Newer");
    expect(newerButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("jumps to a release from the version list and starts its page at the top", async () => {
    const { user } = openWhatsNew("0.1.0-alpha.3", false);
    const firstArticle = screen.getByRole("article");

    await user.click(releaseList());
    await user.click(screen.getByRole("option", { name: "0.1.0-alpha.1" }));

    expect(screen.getByText("Changes in Leafdown 0.1.0-alpha.1")).toBeInTheDocument();
    expect(screen.getByRole("article")).not.toBe(firstArticle);
    await waitFor(() => expect(releaseList()).toHaveFocus());
  });

  it("says when the running release has no notes and offers the earlier releases", async () => {
    const { user } = openWhatsNew("9.9.9", false);

    expect(screen.getByText("Changes in Leafdown 9.9.9")).toBeInTheDocument();
    expect(
      screen.getByText("No release notes are available for this version."),
    ).toBeInTheDocument();
    expect(newerButton()).toHaveAttribute("aria-disabled", "true");
    expect(olderButton()).toHaveAccessibleName(`Older release: ${bundledVersions(false)[0]}`);

    await user.click(olderButton());
    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("reopens on the running version and leaves seen state alone while browsing", async () => {
    useReleaseNotesStore.setState({
      lastVersion: "0.1.0-alpha.3",
      seenVersions: ["0.1.0-alpha.3"],
    });
    const { user } = openWhatsNew("0.1.0-alpha.3", false);

    await user.click(olderButton());
    expect(screen.getByText("Changes in Leafdown 0.1.0-alpha.2")).toBeInTheDocument();
    expect(useReleaseNotesStore.getState()).toMatchObject({
      lastVersion: "0.1.0-alpha.3",
      seenVersions: ["0.1.0-alpha.3"],
    });

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    useReleaseNotesStore.getState().setSurface("whatsNew");
    expect(await screen.findByText("Changes in Leafdown 0.1.0-alpha.3")).toBeInTheDocument();
  });

  it("shows the complete changelog and sends its external link through the opener", async () => {
    useReleaseNotesStore.setState({ surface: "changelog" });
    const { user } = renderWithUser(<ReleaseNotesDialog />);

    expect(screen.getByRole("dialog", { name: "Changelog" })).toBeInTheDocument();
    const article = screen.getByRole("article");
    expect(article).toHaveTextContent("Initial internal alpha release.");
    expect(article).toHaveTextContent("0.1.0-alpha.3");
    expect(within(article).queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    await user.click(within(article).getByRole("button", { name: "Keep a Changelog" }));
    expect(openUrl).toHaveBeenCalledWith("https://keepachangelog.com/en/1.1.0/");
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
