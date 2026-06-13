import { settingsStoreTauriHandler, useSettingsStore } from "@/features/preferences";

import { sessionHistoryStoreTauriHandler, useSessionHistoryStore } from "../stores/history";

export const migrateLegacyPersistedState = async () => {
  const settings = useSettingsStore.getState();
  const history = useSessionHistoryStore.getState();

  if (settings.persistenceVersion >= 1 && history.persistenceVersion >= 1) {
    return;
  }

  history.migrateLegacyHistory(settings.recentFiles, settings.recentFolders);
  settings.completeLegacyMigration();

  await Promise.all([
    settingsStoreTauriHandler.saveNow(),
    sessionHistoryStoreTauriHandler.saveNow(),
  ]);
};
