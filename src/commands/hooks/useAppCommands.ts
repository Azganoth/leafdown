import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import { getActiveDocumentKey } from "@/features/document";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import { documentEditorBridge, useSessionStore } from "@/features/session";
import { handleUnexpectedError, notifyOperationFailure } from "@/lib/errors";
import { localizer } from "@/lib/i18n";
import { isPrimaryModifierEvent, normalizeKeyboardKey } from "@/lib/input";

import {
  getReopenedEncodingName,
  getReopenWithEncodingState,
  reopenWithEncoding,
} from "../actions/edit";
import { openRecentFolderContext, openRecentMarkdownFile } from "../actions/file";
import type { AppCommandContext, ReopenWithEncodingControl } from "../context";
import { dispatchAppCommand, type AppCommandId } from "../dispatch";
import {
  COMMAND_DEFINITIONS,
  DOCUMENT_SEARCH_COMMAND_IDS,
  matchesShortcut,
  WINDOW_SHORTCUT_COMMAND_IDS,
} from "../metadata";
import { getCommandState } from "../state";
import { useCommandUIStore } from "../stores/commandUi";

const SUPPRESSED_DISABLED_SHORTCUT_COMMAND_IDS: readonly AppCommandId[] = [
  "file.save",
  "file.saveAs",
  "file.closeDocument",
  // Left unclaimed, `Mod+F` and `F3` open the webview's own find bar over the application.
  ...DOCUMENT_SEARCH_COMMAND_IDS,
];

const isSuppressedWebviewShortcut = (event: KeyboardEvent) => {
  const key = normalizeKeyboardKey(event.key);

  return (
    (isPrimaryModifierEvent(event) && key === "r") ||
    key === "f5" ||
    (event.altKey && (key === "arrowleft" || key === "arrowright"))
  );
};

const shouldSuppressDisabledShortcut = (commandId: AppCommandId) =>
  SUPPRESSED_DISABLED_SHORTCUT_COMMAND_IDS.includes(commandId);

const subscribeToCommandStateChanges = (listener: () => void) => {
  const listenerDisposable = documentEditorBridge.onDidChangeCommandState(listener);

  return () => listenerDisposable.dispose();
};

export const useAppCommands = () => {
  const aboutOpen = useCommandUIStore((state) => state.aboutOpen);
  const commandPaletteOpen = useCommandUIStore((state) => state.commandPaletteOpen);
  const diagnosticsOpen = useCommandUIStore((state) => state.diagnosticsOpen);
  const helpPage = useCommandUIStore((state) => state.helpPage);
  const keyboardShortcutsOpen = useCommandUIStore((state) => state.keyboardShortcutsOpen);
  const fullscreen = useCommandUIStore((state) => state.fullscreen);
  const pendingSortOrder = useCommandUIStore((state) => state.pendingSortOrder);
  const preferencesOpen = useCommandUIStore((state) => state.preferencesOpen);
  const zoom = useCommandUIStore((state) => state.zoom);
  const setAboutOpen = useCommandUIStore((state) => state.setAboutOpen);
  const setCommandPaletteOpen = useCommandUIStore((state) => state.setCommandPaletteOpen);
  const setDiagnosticsOpen = useCommandUIStore((state) => state.setDiagnosticsOpen);
  const setHelpPage = useCommandUIStore((state) => state.setHelpPage);
  const setKeyboardShortcutsOpen = useCommandUIStore((state) => state.setKeyboardShortcutsOpen);
  const setPreferencesOpen = useCommandUIStore((state) => state.setPreferencesOpen);
  const setFullscreen = useCommandUIStore((state) => state.setFullscreen);

  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);
  const folderContextLoading = useSessionStore((state) => state.folderContextLoad !== null);
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop);
  const articleSortOrder = useSettingsStore((state) => state.articleSortOrder);
  const insertFinalNewline = useSettingsStore((state) => state.insertFinalNewline);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);
  const statusBarVisible = useSettingsStore((state) => state.statusBarVisible);
  const theme = useSettingsStore((state) => state.theme);
  const recentFiles = useRecentItemsStore((state) => state.recentFiles);
  const recentFolders = useRecentItemsStore((state) => state.recentFolders);
  const activeDocumentKey = activeDocument ? getActiveDocumentKey(activeDocument) : null;
  const getEditorCommandState = () => documentEditorBridge.getCommandState(activeDocumentKey ?? "");
  const editor = useSyncExternalStore(
    subscribeToCommandStateChanges,
    getEditorCommandState,
    getEditorCommandState,
  );

  const context: AppCommandContext = {
    activeDocument,
    editor,
    folderContext,
    folderContextLoading,
    recentItems: {
      recentFiles,
      recentFolders,
    },
    settings: {
      alwaysOnTop,
      articleSortOrder,
      insertFinalNewline,
      sidebarVisible,
      statusBarVisible,
      theme,
    },
    ui: {
      fullscreen,
      pendingSortOrder,
      zoom,
    },
  };

  useEffect(() => {
    const checkFullscreen = async () => {
      try {
        setFullscreen(await getCurrentWindow().isFullscreen());
      } catch (error) {
        handleUnexpectedError(error, "checkFullscreen");
      }
    };

    void checkFullscreen();
  }, [setFullscreen]);

  const commandState = (commandId: AppCommandId) => getCommandState(commandId, context);

  const executeCommand = (commandId: AppCommandId) => {
    if (!commandState(commandId).enabled) {
      return;
    }

    void dispatchAppCommand(commandId, context).catch((error) => {
      notifyOperationFailure(localizer.current.t("commands.failed"), error, {
        source: "commands",
        operation: commandId,
      });
    });
  };

  const commandHandlersRef = useRef({ commandState, executeCommand });
  useLayoutEffect(() => {
    commandHandlersRef.current = { commandState, executeCommand };
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { commandState: getState, executeCommand: execute } = commandHandlersRef.current;

      if (event.defaultPrevented) {
        return;
      }

      if (isSuppressedWebviewShortcut(event)) {
        event.preventDefault();
        return;
      }

      const shortcutCommandId = WINDOW_SHORTCUT_COMMAND_IDS.find((commandId) =>
        COMMAND_DEFINITIONS[commandId].shortcuts?.some((shortcut) =>
          matchesShortcut(event, shortcut),
        ),
      );

      if (!shortcutCommandId) {
        return;
      }

      if (!getState(shortcutCommandId).enabled) {
        if (shouldSuppressDisabledShortcut(shortcutCommandId)) {
          event.preventDefault();
        }
        return;
      }

      event.preventDefault();
      execute(shortcutCommandId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    aboutOpen,
    commandPaletteOpen,
    commandState,
    diagnosticsOpen,
    helpPage,
    keyboardShortcutsOpen,
    executeCommand,
    recentItems: {
      recentFiles,
      recentFolders,
    },
    openRecentFile: openRecentMarkdownFile,
    openRecentFolder: openRecentFolderContext,
    reopenWithEncoding: {
      state: getReopenWithEncodingState(context),
      checkedEncoding: getReopenedEncodingName(context),
      reopen: (encoding) => void reopenWithEncoding(context, encoding),
    } satisfies ReopenWithEncodingControl,
    preferencesOpen,
    setAboutOpen,
    setCommandPaletteOpen,
    setDiagnosticsOpen,
    setHelpPage,
    setKeyboardShortcutsOpen,
    setPreferencesOpen,
  };
};
