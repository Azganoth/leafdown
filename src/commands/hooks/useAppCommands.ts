import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

import { getActiveDocumentKey } from "@/features/document";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import { documentEditorBridge, useSessionStore } from "@/features/session";
import { handleUnexpectedError, notifyOperationFailure } from "@/lib/errors";
import { isPrimaryModifierEvent, normalizeKeyboardKey } from "@/lib/input";

import { openRecentFolderContext, openRecentMarkdownFile } from "../actions/file";
import type { AppCommandContext } from "../context";
import { dispatchAppCommand, type AppCommandId } from "../dispatch";
import { COMMAND_DEFINITIONS, SHORTCUT_COMMAND_IDS, matchesShortcut } from "../metadata";
import { getCommandState } from "../state";
import { useCommandUIStore } from "../stores/commandUi";

const SUPPRESSED_DISABLED_SHORTCUT_COMMAND_IDS: readonly AppCommandId[] = [
  "file.save",
  "file.saveAs",
  "file.closeDocument",
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
  useSyncExternalStore(
    subscribeToCommandStateChanges,
    documentEditorBridge.getCommandStateVersion,
    documentEditorBridge.getCommandStateVersion,
  );

  const aboutOpen = useCommandUIStore((state) => state.aboutOpen);
  const diagnosticsOpen = useCommandUIStore((state) => state.diagnosticsOpen);
  const fullscreen = useCommandUIStore((state) => state.fullscreen);
  const pendingSortOrder = useCommandUIStore((state) => state.pendingSortOrder);
  const preferencesOpen = useCommandUIStore((state) => state.preferencesOpen);
  const zoom = useCommandUIStore((state) => state.zoom);
  const setAboutOpen = useCommandUIStore((state) => state.setAboutOpen);
  const setDiagnosticsOpen = useCommandUIStore((state) => state.setDiagnosticsOpen);
  const setPreferencesOpen = useCommandUIStore((state) => state.setPreferencesOpen);
  const setFullscreen = useCommandUIStore((state) => state.setFullscreen);

  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);
  const articleSortOrder = useSettingsStore((state) => state.articleSortOrder);
  const insertFinalNewline = useSettingsStore((state) => state.insertFinalNewline);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);
  const theme = useSettingsStore((state) => state.theme);
  const recentFiles = useRecentItemsStore((state) => state.recentFiles);
  const recentFolders = useRecentItemsStore((state) => state.recentFolders);
  const activeDocumentKey = activeDocument ? getActiveDocumentKey(activeDocument) : null;
  const editor = documentEditorBridge.getCommandState(activeDocumentKey ?? "");

  const context: AppCommandContext = {
    activeDocument,
    editor,
    folderContext,
    recentItems: {
      recentFiles,
      recentFolders,
    },
    settings: {
      articleSortOrder,
      insertFinalNewline,
      sidebarVisible,
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
      notifyOperationFailure("Command failed.", error, {
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

      const shortcutCommandId = SHORTCUT_COMMAND_IDS.find((commandId) =>
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
    commandState,
    diagnosticsOpen,
    executeCommand,
    recentItems: {
      recentFiles,
      recentFolders,
    },
    openRecentFile: openRecentMarkdownFile,
    openRecentFolder: openRecentFolderContext,
    preferencesOpen,
    setAboutOpen,
    setDiagnosticsOpen,
    setPreferencesOpen,
  };
};
