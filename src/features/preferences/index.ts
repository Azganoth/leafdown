export { PreferencesDialog } from "./components/PreferencesDialog";
export {
  RECENT_ITEM_LIMIT,
  RECENT_ITEMS_VERSION,
  recentItemsStoreTauriHandler,
  useRecentItemsStore,
  type RecentItemsState,
  type RecentItemsStore,
} from "./stores/recentItems";
export {
  createDefaultSettingsState,
  DEFAULT_IGNORED_DIRECTORIES,
  DEFAULT_INDEX_FILE_NAMES,
  getSystemDefaultLineEnding,
  SETTINGS_VERSION,
  settingsStoreTauriHandler,
  useSettingsStore,
  type AppearanceTheme,
  type SettingsPersistedState,
  type SettingsState,
  type SettingsStore,
} from "./stores/settings";
