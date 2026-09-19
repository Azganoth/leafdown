export { PreferencesDialog } from "./components/preferences-dialog";
export {
  RECENT_ITEM_LIMIT,
  RECENT_ITEMS_VERSION,
  recentItemsStoreTauriHandler,
  useRecentItemsStore,
  type RecentItem,
  type RecentItemsState,
  type RecentItemsStore,
} from "./stores/recentItems";
export {
  APPEARANCE_ACCENT_COLORS,
  createDefaultSettingsState,
  DEFAULT_IGNORED_DIRECTORIES,
  DEFAULT_INDEX_FILE_NAMES,
  getSystemDefaultLineEnding,
  SETTINGS_VERSION,
  settingsStoreTauriHandler,
  useSettingsStore,
  type AppearanceAccentColor,
  type AppearanceTheme,
  type DropBehavior,
  type SettingsPersistedState,
  type SettingsState,
  type SettingsStore,
} from "./stores/settings";
