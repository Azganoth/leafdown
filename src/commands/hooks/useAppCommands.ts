import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState, useSyncExternalStore } from "react";

import { getActiveDocumentKey } from "@/features/document";
import { getArticleAncestorDirectoryPaths, type ArticleSortOrder } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import {
  getActiveDocumentEditorCommandState,
  getActiveDocumentEditorCommandStateVersion,
  subscribeActiveDocumentEditorCommandState,
  useSessionHistoryStore,
  useSessionStore,
} from "@/features/session";

import { dispatchAppCommand, openRecentFolderContext, openRecentMarkdownFile } from "../dispatch";
import {
  commandDefinitions,
  getCommandShortcuts,
  isSuppressedWebviewShortcut,
  matchesShortcut,
  shortcutCommandIds,
} from "../registry";
import { getCommandState } from "../state";
import type { AppCommandId, CommandStateContext } from "../types";

export function useAppCommands() {
  useSyncExternalStore(
    subscribeActiveDocumentEditorCommandState,
    getActiveDocumentEditorCommandStateVersion,
    getActiveDocumentEditorCommandStateVersion,
  );

  const [aboutOpen, setAboutOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pendingSortOrder, setPendingSortOrder] = useState<ArticleSortOrder | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);
  const settings = useSettingsStore();
  const history = useSessionHistoryStore();
  const activeFilePath = activeDocument?.status === "saved" ? activeDocument.path : null;
  const activeDocumentKey = activeDocument ? getActiveDocumentKey(activeDocument) : null;
  const activeArticleAncestorPaths =
    folderContext && activeFilePath
      ? getArticleAncestorDirectoryPaths(folderContext.tree, activeFilePath)
      : null;
  const editor = getActiveDocumentEditorCommandState(activeDocumentKey ?? "");
  const stateContext: CommandStateContext = {
    activeDocument,
    editor,
    folderContext,
    fullscreen,
    history,
    navigator: {
      canRevealActiveArticle: Boolean(activeArticleAncestorPaths),
      pendingSortOrder,
    },
    settings,
  };

  useEffect(() => {
    void getCurrentWindow().isFullscreen().then(setFullscreen).catch(console.error);
  }, []);

  const commandState = (commandId: AppCommandId) => getCommandState(commandId, stateContext);
  const executeCommand = (commandId: AppCommandId) => {
    if (!commandState(commandId).enabled) {
      return;
    }

    dispatchAppCommand(commandId, {
      activeArticleAncestorPaths,
      activeDocumentKey,
      activeFilePath,
      folderContext,
      fullscreen,
      pendingSortOrder,
      setAboutOpen,
      setFullscreen,
      setPendingSortOrder,
      setPreferencesOpen,
      setZoom,
      zoom,
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (isSuppressedWebviewShortcut(event)) {
        event.preventDefault();
        return;
      }

      const shortcutCommandId = shortcutCommandIds.find((commandId) =>
        getCommandShortcuts(commandDefinitions[commandId]).some((shortcut) =>
          matchesShortcut(event, shortcut),
        ),
      );

      if (!shortcutCommandId) {
        if (event.altKey && event.key === "F4") {
          event.preventDefault();
          executeCommand("file.closeWindow");
        }
        return;
      }

      if (!commandState(shortcutCommandId).enabled && !shortcutCommandId.startsWith("file.")) {
        return;
      }

      event.preventDefault();
      executeCommand(shortcutCommandId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return {
    aboutOpen,
    commandState,
    executeCommand,
    history,
    openRecentFile: openRecentMarkdownFile,
    openRecentFolder: openRecentFolderContext,
    preferencesOpen,
    setAboutOpen,
    setPreferencesOpen,
  };
}
