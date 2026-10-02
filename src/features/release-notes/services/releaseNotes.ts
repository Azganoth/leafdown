import { getVersion } from "@tauri-apps/api/app";

import { releaseNotesStoreTauriHandler, useReleaseNotesStore } from "../stores/releaseNotes";
import { getCurrentReleaseNotes } from "./bundledChangelog";

export const initializeReleaseNotes = async () => {
  await releaseNotesStoreTauriHandler.start();
  const version = await getVersion();
  const state = useReleaseNotesStore.getState();
  const shouldOpen =
    state.lastVersion !== "" &&
    state.lastVersion !== version &&
    !state.seenVersions.includes(version) &&
    getCurrentReleaseNotes(version) !== null;

  state.recordLaunch(version);
  if (shouldOpen) {
    useReleaseNotesStore.getState().markSeen(version);
    useReleaseNotesStore.getState().setSurface("whatsNew");
  }
};

export const showWhatsNew = async () => {
  const state = useReleaseNotesStore.getState();
  const version = state.currentVersion || (await getVersion());
  state.setCurrentVersion(version);
  useReleaseNotesStore.getState().markSeen(version);
  useReleaseNotesStore.getState().setSurface("whatsNew");
};

export const showChangelog = () => {
  useReleaseNotesStore.getState().setSurface("changelog");
};
