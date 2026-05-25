import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/Menubar";
import { PreferencesDialog } from "@/features/preferences/components/PreferencesDialog";
import { getSaveMarkdownFileErrorMessage, showDocumentIoErrorToast } from "@/lib/documentIoErrors";
import {
  closeActiveMarkdownDocument,
  createNewMarkdownDocument,
  saveActiveMarkdownDocument,
  saveActiveMarkdownDocumentAs,
} from "@/lib/documentWorkflows";
import {
  getOpenMarkdownFileErrorMessage,
  getOpenMarkdownFolderErrorMessage,
} from "@/lib/documentIoErrors";
import {
  getActiveDocumentEditorCommandStateVersion,
  getActiveDocumentEditorCommandState,
  runActiveDocumentEditorCommand,
  subscribeActiveDocumentEditorCommandState,
} from "@/lib/documentEditorBridge";
import { openMarkdownFile, openMarkdownFilePath } from "@/lib/openMarkdownFile";
import {
  openMarkdownFolder,
  openMarkdownFolderPath,
  scanMarkdownFolder,
} from "@/lib/openMarkdownFolder";
import { getActiveDocumentKey, useSessionStore } from "@/stores/session";
import { useSettingsStore, type AppearanceTheme, type FileTreeSortOrder } from "@/stores/settings";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useFileTreeViewStore } from "@/features/file-tree/stores/fileTreeView";
import {
  getDirectoryPaths,
  getFileAncestorDirectoryPaths,
} from "@/features/file-tree/utils/fileTreeRows";

import {
  commandDefinitions,
  commandMenuLabels,
  getCommandShortcuts,
  shortcutCommandIds,
} from "../commandDefinitions";
import { getCommandState } from "../commandState";
import type { AppCommandId, CommandShortcut, CommandStateContext } from "../types";
import { AboutDialog } from "./AboutDialog";

const zoomStep = 0.1;
const minimumZoom = 0.5;
const maximumZoom = 2;

const isPrimaryModifierEvent = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;

const formatShortcut = ({ alt, key, mod, shift }: CommandShortcut) =>
  [
    mod ? "Mod" : null,
    alt ? "Alt" : null,
    shift ? "Shift" : null,
    key.length === 1 ? key.toUpperCase() : key,
  ]
    .filter(Boolean)
    .join("+");

const matchesShortcut = (event: KeyboardEvent, shortcut: CommandShortcut) => {
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const shortcutKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;

  return (
    eventKey === shortcutKey &&
    Boolean(shortcut.mod) === isPrimaryModifierEvent(event) &&
    Boolean(shortcut.alt) === event.altKey &&
    Boolean(shortcut.shift) === event.shiftKey
  );
};

const isSuppressedWebviewShortcut = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase();

  return (
    (isPrimaryModifierEvent(event) && key === "r") ||
    key === "f5" ||
    (event.altKey && (key === "arrowleft" || key === "arrowright"))
  );
};

export function CommandMenuBar() {
  useSyncExternalStore(
    subscribeActiveDocumentEditorCommandState,
    getActiveDocumentEditorCommandStateVersion,
    getActiveDocumentEditorCommandStateVersion,
  );

  const [aboutOpen, setAboutOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pendingSortOrder, setPendingSortOrder] = useState<FileTreeSortOrder | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);
  const setActiveDocumentLineEnding = useSessionStore((state) => state.setActiveDocumentLineEnding);
  const setFolderContext = useSessionStore((state) => state.setFolderContext);
  const settings = useSettingsStore();
  const collapseAll = useFileTreeViewStore((state) => state.collapseAll);
  const expandDirectories = useFileTreeViewStore((state) => state.expandDirectories);
  const requestRevealFile = useFileTreeViewStore((state) => state.requestRevealFile);
  const activeFilePath = activeDocument?.status === "saved" ? activeDocument.path : null;
  const activeDocumentKey = activeDocument ? getActiveDocumentKey(activeDocument) : null;
  const activeFileAncestorDirectoryPaths =
    folderContext && activeFilePath
      ? getFileAncestorDirectoryPaths(folderContext.tree, activeFilePath)
      : null;
  const canRevealActiveFile = Boolean(
    folderContext && activeFilePath && activeFileAncestorDirectoryPaths,
  );
  const editor = activeDocumentKey
    ? getActiveDocumentEditorCommandState(activeDocumentKey)
    : getActiveDocumentEditorCommandState("");
  const context: CommandStateContext = {
    activeDocument,
    editor,
    fileTree: {
      canRevealActiveFile,
      pendingSortOrder,
    },
    folderContext,
    fullscreen,
    settings,
  };

  useEffect(() => {
    void getCurrentWindow().isFullscreen().then(setFullscreen).catch(console.error);
  }, []);

  const commandState = (commandId: AppCommandId) => getCommandState(commandId, context);

  const executeCommand = (commandId: AppCommandId) => {
    if (!commandState(commandId).enabled) {
      return;
    }

    switch (commandId) {
      case "file.new":
        void createNewMarkdownDocument();
        return;

      case "file.open":
        void openMarkdownFile().catch((error: unknown) => {
          showDocumentIoErrorToast(toast.error, getOpenMarkdownFileErrorMessage(error));
        });
        return;

      case "file.openFolder":
        void openMarkdownFolder().catch((error: unknown) => {
          showDocumentIoErrorToast(toast.error, getOpenMarkdownFolderErrorMessage(error));
        });
        return;

      case "file.clearRecentItems":
        settings.clearRecentItems();
        return;

      case "file.save":
        void saveActiveMarkdownDocument()
          .then((saved) => {
            if (saved) toast.success("Document saved.");
          })
          .catch((error: unknown) => {
            showDocumentIoErrorToast(toast.error, getSaveMarkdownFileErrorMessage(error));
          });
        return;

      case "file.saveAs":
        void saveActiveMarkdownDocumentAs()
          .then((saved) => {
            if (saved) toast.success("Document saved.");
          })
          .catch((error: unknown) => {
            showDocumentIoErrorToast(toast.error, getSaveMarkdownFileErrorMessage(error));
          });
        return;

      case "file.openLocation":
        if (activeFilePath) {
          void revealItemInDir(activeFilePath).catch((error: unknown) => {
            toast.error("Could not open file location.", { description: String(error) });
          });
        }
        return;

      case "file.revealInSidebar":
        if (activeFilePath && activeFileAncestorDirectoryPaths) {
          settings.updateSetting("sidebarVisible", true);
          requestRevealFile(activeFilePath, activeFileAncestorDirectoryPaths);
        }
        return;

      case "file.preferences":
        setPreferencesOpen(true);
        return;

      case "file.closeDocument":
        void closeActiveMarkdownDocument();
        return;

      case "file.closeWindow":
        void getCurrentWindow().close();
        return;

      case "edit.lineEnding.crlf":
        if (activeDocumentKey) setActiveDocumentLineEnding(activeDocumentKey, "crlf");
        return;

      case "edit.lineEnding.lf":
        if (activeDocumentKey) setActiveDocumentLineEnding(activeDocumentKey, "lf");
        return;

      case "edit.insertFinalNewline":
        settings.updateSetting("insertFinalNewline", !settings.insertFinalNewline);
        return;

      case "view.toggleSidebar":
        settings.updateSetting("sidebarVisible", !settings.sidebarVisible);
        return;

      case "view.zoomIn":
        void updateZoom(Math.min(maximumZoom, zoom + zoomStep));
        return;

      case "view.zoomOut":
        void updateZoom(Math.max(minimumZoom, zoom - zoomStep));
        return;

      case "view.resetZoom":
        void updateZoom(1);
        return;

      case "view.fullscreen":
        void getCurrentWindow()
          .setFullscreen(!fullscreen)
          .then(() => setFullscreen(!fullscreen))
          .catch(console.error);
        return;

      case "view.appearance.system":
        settings.updateSetting("theme", "system" satisfies AppearanceTheme);
        return;

      case "view.appearance.light":
        settings.updateSetting("theme", "light" satisfies AppearanceTheme);
        return;

      case "view.appearance.dark":
        settings.updateSetting("theme", "dark" satisfies AppearanceTheme);
        return;

      case "view.sort.name":
        handleSortOrderChange("name");
        return;

      case "view.sort.modifiedDate":
        handleSortOrderChange("modifiedDate");
        return;

      case "view.sort.type":
        handleSortOrderChange("type");
        return;

      case "view.collapseAllFolders":
        collapseAll();
        return;

      case "view.expandAllFolders":
        if (folderContext) expandDirectories(getDirectoryPaths(folderContext.tree));
        return;

      case "help.about":
        setAboutOpen(true);
        return;
    }

    if (activeDocumentKey) {
      void Promise.resolve(runActiveDocumentEditorCommand(activeDocumentKey, commandId)).catch(
        console.error,
      );
    }
  };

  const updateZoom = async (nextZoom: number) => {
    await getCurrentWebview().setZoom(nextZoom);
    setZoom(nextZoom);
  };

  const handleSortOrderChange = (sortOrder: FileTreeSortOrder) => {
    if (!folderContext || sortOrder === settings.fileTreeSortOrder || pendingSortOrder) {
      return;
    }

    const previousSortOrder = settings.fileTreeSortOrder;
    const folderPath = folderContext.path;

    setPendingSortOrder(sortOrder);
    settings.updateSetting("fileTreeSortOrder", sortOrder);

    void scanMarkdownFolder(folderPath)
      .then((nextFolderContext) => {
        if (useSessionStore.getState().folderContext?.path === folderPath) {
          setFolderContext(nextFolderContext);
        }
      })
      .catch((error: unknown) => {
        settings.updateSetting("fileTreeSortOrder", previousSortOrder);
        showDocumentIoErrorToast(
          toast.error,
          getOpenMarkdownFolderErrorMessage({ kind: "scanFailed", error }),
        );
      })
      .finally(() => {
        setPendingSortOrder(null);
      });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSuppressedWebviewShortcut(event)) {
        event.preventDefault();
        return;
      }

      const shortcutCommandId = shortcutCommandIds.find((commandId) => {
        const shortcuts = getCommandShortcuts(commandDefinitions[commandId]);
        return shortcuts.some((shortcut) => matchesShortcut(event, shortcut));
      });

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

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  function openRecentFile(path: string) {
    void openMarkdownFilePath(path).catch((error: unknown) =>
      showDocumentIoErrorToast(
        toast.error,
        getOpenMarkdownFileErrorMessage(error, {
          title: "Could not open recent Markdown file.",
        }),
      ),
    );
  }

  function openRecentFolder(path: string) {
    void openMarkdownFolderPath(path).catch((error: unknown) =>
      showDocumentIoErrorToast(
        toast.error,
        getOpenMarkdownFolderErrorMessage(error, {
          title: "Could not open recent folder.",
        }),
      ),
    );
  }

  return (
    <>
      <Menubar className="border-0 bg-transparent p-0">
        <MenubarMenu>
          <MenubarTrigger>{commandMenuLabels.file}</MenubarTrigger>
          <MenubarContent>
            <CommandMenuItem
              commandId="file.new"
              onExecute={executeCommand}
              state={commandState("file.new")}
            />
            <MenubarSeparator />
            <CommandMenuItem
              commandId="file.open"
              onExecute={executeCommand}
              state={commandState("file.open")}
            />
            <CommandMenuItem
              commandId="file.openFolder"
              onExecute={executeCommand}
              state={commandState("file.openFolder")}
            />
            <RecentItemsSubmenu
              commandState={commandState}
              recentFiles={settings.recentFiles}
              recentFolders={settings.recentFolders}
              onExecute={executeCommand}
              onOpenRecentFile={openRecentFile}
              onOpenRecentFolder={openRecentFolder}
            />
            <MenubarSeparator />
            <CommandMenuItem
              commandId="file.save"
              onExecute={executeCommand}
              state={commandState("file.save")}
            />
            <CommandMenuItem
              commandId="file.saveAs"
              onExecute={executeCommand}
              state={commandState("file.saveAs")}
            />
            <MenubarSeparator />
            <CommandMenuItem
              commandId="file.openLocation"
              onExecute={executeCommand}
              state={commandState("file.openLocation")}
            />
            <CommandMenuItem
              commandId="file.revealInSidebar"
              onExecute={executeCommand}
              state={commandState("file.revealInSidebar")}
            />
            <MenubarSeparator />
            <CommandMenuItem
              commandId="file.preferences"
              onExecute={executeCommand}
              state={commandState("file.preferences")}
            />
            <MenubarSeparator />
            <CommandMenuItem
              commandId="file.closeDocument"
              onExecute={executeCommand}
              state={commandState("file.closeDocument")}
            />
            <CommandMenuItem
              commandId="file.closeWindow"
              onExecute={executeCommand}
              state={commandState("file.closeWindow")}
            />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{commandMenuLabels.edit}</MenubarTrigger>
          <MenubarContent>
            <CommandMenuItem
              commandId="edit.undo"
              onExecute={executeCommand}
              state={commandState("edit.undo")}
            />
            <CommandMenuItem
              commandId="edit.redo"
              onExecute={executeCommand}
              state={commandState("edit.redo")}
            />
            <MenubarSeparator />
            <CommandMenuItem
              commandId="edit.cut"
              onExecute={executeCommand}
              state={commandState("edit.cut")}
            />
            <CommandMenuItem
              commandId="edit.copy"
              onExecute={executeCommand}
              state={commandState("edit.copy")}
            />
            <CopyAsSubmenu commandState={commandState} onExecute={executeCommand} />
            <CommandMenuItem
              commandId="edit.paste"
              onExecute={executeCommand}
              state={commandState("edit.paste")}
            />
            <PasteAsSubmenu commandState={commandState} onExecute={executeCommand} />
            <MenubarSeparator />
            <DeleteSubmenu commandState={commandState} onExecute={executeCommand} />
            <SelectSubmenu commandState={commandState} onExecute={executeCommand} />
            <JumpSubmenu commandState={commandState} onExecute={executeCommand} />
            <MenubarSeparator />
            <LineEndingSubmenu commandState={commandState} onExecute={executeCommand} />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{commandMenuLabels.insert}</MenubarTrigger>
          <MenubarContent>
            <CommandMenuItem
              commandId="insert.paragraph"
              onExecute={executeCommand}
              state={commandState("insert.paragraph")}
            />
            <HeadingSubmenu
              commandState={commandState}
              onExecute={executeCommand}
              prefix="insert"
            />
            <MenubarSeparator />
            {insertCommandIds.map((commandId) => (
              <CommandMenuItem
                commandId={commandId}
                key={commandId}
                onExecute={executeCommand}
                state={commandState(commandId)}
              />
            ))}
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{commandMenuLabels.format}</MenubarTrigger>
          <MenubarContent>
            {inlineFormatCommandIds.map((commandId) => (
              <CommandMenuItem
                commandId={commandId}
                key={commandId}
                onExecute={executeCommand}
                state={commandState(commandId)}
              />
            ))}
            <MenubarSeparator />
            <CommandMenuItem
              commandId="format.paragraph"
              onExecute={executeCommand}
              state={commandState("format.paragraph")}
            />
            <HeadingSubmenu
              commandState={commandState}
              onExecute={executeCommand}
              prefix="format"
            />
            <CommandMenuItem
              commandId="format.increaseHeading"
              onExecute={executeCommand}
              state={commandState("format.increaseHeading")}
            />
            <CommandMenuItem
              commandId="format.decreaseHeading"
              onExecute={executeCommand}
              state={commandState("format.decreaseHeading")}
            />
            <MenubarSeparator />
            {blockFormatCommandIds.map((commandId) => (
              <CommandMenuItem
                commandId={commandId}
                key={commandId}
                onExecute={executeCommand}
                state={commandState(commandId)}
              />
            ))}
            <TableSubmenu commandState={commandState} onExecute={executeCommand} />
            <CommandMenuItem
              commandId="format.clearBlock"
              onExecute={executeCommand}
              state={commandState("format.clearBlock")}
            />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{commandMenuLabels.view}</MenubarTrigger>
          <MenubarContent>
            <CommandCheckboxItem
              commandId="view.toggleSidebar"
              onExecute={executeCommand}
              state={commandState("view.toggleSidebar")}
            />
            <MenubarSeparator />
            <CommandMenuItem
              commandId="view.zoomIn"
              onExecute={executeCommand}
              state={commandState("view.zoomIn")}
            />
            <CommandMenuItem
              commandId="view.zoomOut"
              onExecute={executeCommand}
              state={commandState("view.zoomOut")}
            />
            <CommandMenuItem
              commandId="view.resetZoom"
              onExecute={executeCommand}
              state={commandState("view.resetZoom")}
            />
            <CommandCheckboxItem
              commandId="view.fullscreen"
              onExecute={executeCommand}
              state={commandState("view.fullscreen")}
            />
            <MenubarSeparator />
            <AppearanceSubmenu commandState={commandState} onExecute={executeCommand} />
            <SortSubmenu commandState={commandState} onExecute={executeCommand} />
            <CommandMenuItem
              commandId="view.collapseAllFolders"
              onExecute={executeCommand}
              state={commandState("view.collapseAllFolders")}
            />
            <CommandMenuItem
              commandId="view.expandAllFolders"
              onExecute={executeCommand}
              state={commandState("view.expandAllFolders")}
            />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{commandMenuLabels.help}</MenubarTrigger>
          <MenubarContent>
            <CommandMenuItem
              commandId="help.about"
              onExecute={executeCommand}
              state={commandState("help.about")}
            />
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      <PreferencesDialog
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
        showTrigger={false}
      />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
}

const insertCommandIds: AppCommandId[] = [
  "insert.link",
  "insert.image",
  "insert.orderedList",
  "insert.unorderedList",
  "insert.taskList",
  "insert.blockquote",
  "insert.codeBlock",
  "insert.table",
  "insert.horizontalRule",
];

const inlineFormatCommandIds: AppCommandId[] = [
  "format.strong",
  "format.emphasis",
  "format.strikethrough",
  "format.inlineCode",
  "format.clearInline",
];

const blockFormatCommandIds: AppCommandId[] = [
  "format.orderedList",
  "format.unorderedList",
  "format.taskList",
  "format.increaseListIndent",
  "format.decreaseListIndent",
  "format.toggleTaskChecked",
  "format.blockquote",
  "format.codeBlock",
];

const tableCommandIds: AppCommandId[] = [
  "format.table.delete",
  "format.table.addRowAbove",
  "format.table.addRowBelow",
  "format.table.addColumnBefore",
  "format.table.addColumnAfter",
  "format.table.moveRowUp",
  "format.table.moveRowDown",
  "format.table.moveColumnLeft",
  "format.table.moveColumnRight",
  "format.table.deleteRow",
  "format.table.deleteColumn",
];

interface CommandItemProps {
  commandId: AppCommandId;
  onExecute: (commandId: AppCommandId) => void;
  state: ReturnType<typeof getCommandState>;
}

function CommandMenuItem({ commandId, onExecute, state }: CommandItemProps) {
  const command = commandDefinitions[commandId];
  const primaryShortcut = getCommandShortcuts(command)[0];

  return (
    <MenubarItem disabled={!state.enabled} onSelect={() => onExecute(commandId)}>
      {command.label}
      {primaryShortcut && <MenubarShortcut>{formatShortcut(primaryShortcut)}</MenubarShortcut>}
    </MenubarItem>
  );
}

function CommandCheckboxItem({ commandId, onExecute, state }: CommandItemProps) {
  const command = commandDefinitions[commandId];
  const primaryShortcut = getCommandShortcuts(command)[0];

  return (
    <MenubarCheckboxItem
      checked={Boolean(state.checked)}
      disabled={!state.enabled}
      onSelect={() => onExecute(commandId)}
    >
      {command.label}
      {primaryShortcut && <MenubarShortcut>{formatShortcut(primaryShortcut)}</MenubarShortcut>}
    </MenubarCheckboxItem>
  );
}

interface CommandRadioItemProps {
  commandId: AppCommandId;
  state: ReturnType<typeof getCommandState>;
}

function CommandRadioItem({ commandId, state }: CommandRadioItemProps) {
  const command = commandDefinitions[commandId];

  return (
    <MenubarRadioItem value={commandId} disabled={!state.enabled}>
      {command.label}
    </MenubarRadioItem>
  );
}

interface SubmenuProps {
  commandState: (commandId: AppCommandId) => ReturnType<typeof getCommandState>;
  onExecute: (commandId: AppCommandId) => void;
}

function RecentItemsSubmenu({
  commandState,
  onExecute,
  onOpenRecentFile,
  onOpenRecentFolder,
  recentFiles,
  recentFolders,
}: SubmenuProps & {
  onOpenRecentFile: (path: string) => void;
  onOpenRecentFolder: (path: string) => void;
  recentFiles: string[];
  recentFolders: string[];
}) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Open recent</MenubarSubTrigger>
      <MenubarSubContent className="min-w-64">
        <MenubarLabel>Recent files</MenubarLabel>
        {recentFiles.length === 0 ? (
          <MenubarItem disabled>No recent files.</MenubarItem>
        ) : (
          recentFiles.map((path) => (
            <MenubarItem key={`file:${path}`} onSelect={() => onOpenRecentFile(path)}>
              <span className="max-w-80 truncate">{path}</span>
            </MenubarItem>
          ))
        )}
        <MenubarSeparator />
        <MenubarLabel>Recent folders</MenubarLabel>
        {recentFolders.length === 0 ? (
          <MenubarItem disabled>No recent folders.</MenubarItem>
        ) : (
          recentFolders.map((path) => (
            <MenubarItem key={`folder:${path}`} onSelect={() => onOpenRecentFolder(path)}>
              <span className="max-w-80 truncate">{path}</span>
            </MenubarItem>
          ))
        )}
        <MenubarSeparator />
        <CommandMenuItem
          commandId="file.clearRecentItems"
          onExecute={onExecute}
          state={commandState("file.clearRecentItems")}
        />
      </MenubarSubContent>
    </MenubarSub>
  );
}

function CopyAsSubmenu({ commandState, onExecute }: SubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Copy as</MenubarSubTrigger>
      <MenubarSubContent>
        <CommandMenuItem
          commandId="edit.copyAsPlainText"
          onExecute={onExecute}
          state={commandState("edit.copyAsPlainText")}
        />
        <CommandMenuItem
          commandId="edit.copyAsMarkdown"
          onExecute={onExecute}
          state={commandState("edit.copyAsMarkdown")}
        />
      </MenubarSubContent>
    </MenubarSub>
  );
}

function PasteAsSubmenu({ commandState, onExecute }: SubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Paste as</MenubarSubTrigger>
      <MenubarSubContent>
        {(["edit.pasteAsPlainText", "edit.pasteAsMarkdown", "edit.pasteAsRichText"] as const).map(
          (commandId) => (
            <CommandMenuItem
              commandId={commandId}
              key={commandId}
              onExecute={onExecute}
              state={commandState(commandId)}
            />
          ),
        )}
      </MenubarSubContent>
    </MenubarSub>
  );
}

function DeleteSubmenu({ commandState, onExecute }: SubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Delete</MenubarSubTrigger>
      <MenubarSubContent>
        {(["edit.delete", "edit.deleteWordBackward", "edit.deleteWordForward"] as const).map(
          (commandId) => (
            <CommandMenuItem
              commandId={commandId}
              key={commandId}
              onExecute={onExecute}
              state={commandState(commandId)}
            />
          ),
        )}
      </MenubarSubContent>
    </MenubarSub>
  );
}

function SelectSubmenu({ commandState, onExecute }: SubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Select</MenubarSubTrigger>
      <MenubarSubContent>
        <CommandMenuItem
          commandId="edit.selectAll"
          onExecute={onExecute}
          state={commandState("edit.selectAll")}
        />
        <CommandMenuItem
          commandId="edit.selectWord"
          onExecute={onExecute}
          state={commandState("edit.selectWord")}
        />
      </MenubarSubContent>
    </MenubarSub>
  );
}

function JumpSubmenu({ commandState, onExecute }: SubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Jump</MenubarSubTrigger>
      <MenubarSubContent>
        {[
          "edit.jumpToTop",
          "edit.jumpToBottom",
          "edit.jumpToSelection",
          "edit.jumpToLineStart",
          "edit.jumpToLineEnd",
        ].map((commandId) => (
          <CommandMenuItem
            commandId={commandId as AppCommandId}
            key={commandId}
            onExecute={onExecute}
            state={commandState(commandId as AppCommandId)}
          />
        ))}
      </MenubarSubContent>
    </MenubarSub>
  );
}

function LineEndingSubmenu({ commandState, onExecute }: SubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Line ending</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarRadioGroup
          value={lineEndingRadioValue(commandState)}
          onValueChange={(commandId) => onExecute(commandId as AppCommandId)}
        >
          <CommandRadioItem
            commandId="edit.lineEnding.crlf"
            state={commandState("edit.lineEnding.crlf")}
          />
          <CommandRadioItem
            commandId="edit.lineEnding.lf"
            state={commandState("edit.lineEnding.lf")}
          />
        </MenubarRadioGroup>
        <CommandCheckboxItem
          commandId="edit.insertFinalNewline"
          onExecute={onExecute}
          state={commandState("edit.insertFinalNewline")}
        />
      </MenubarSubContent>
    </MenubarSub>
  );
}

function HeadingSubmenu({
  commandState,
  onExecute,
  prefix,
}: SubmenuProps & {
  prefix: "format" | "insert";
}) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Heading</MenubarSubTrigger>
      <MenubarSubContent>
        {[1, 2, 3, 4, 5, 6].map((level) => {
          const commandId = `${prefix}.heading${level}` as AppCommandId;

          return (
            <CommandMenuItem
              commandId={commandId}
              key={commandId}
              onExecute={onExecute}
              state={commandState(commandId)}
            />
          );
        })}
      </MenubarSubContent>
    </MenubarSub>
  );
}

function TableSubmenu({ commandState, onExecute }: SubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Table</MenubarSubTrigger>
      <MenubarSubContent>
        {tableCommandIds.map((commandId) => (
          <CommandMenuItem
            commandId={commandId}
            key={commandId}
            onExecute={onExecute}
            state={commandState(commandId)}
          />
        ))}
      </MenubarSubContent>
    </MenubarSub>
  );
}

function AppearanceSubmenu({ commandState, onExecute }: SubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Appearance</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarRadioGroup
          value={appearanceRadioValue(commandState)}
          onValueChange={(commandId) => onExecute(commandId as AppCommandId)}
        >
          {(
            ["view.appearance.system", "view.appearance.light", "view.appearance.dark"] as const
          ).map((commandId) => (
            <CommandRadioItem
              commandId={commandId}
              key={commandId}
              state={commandState(commandId)}
            />
          ))}
        </MenubarRadioGroup>
      </MenubarSubContent>
    </MenubarSub>
  );
}

function SortSubmenu({ commandState, onExecute }: SubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Sort file tree by</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarRadioGroup
          value={sortRadioValue(commandState)}
          onValueChange={(commandId) => onExecute(commandId as AppCommandId)}
        >
          {(["view.sort.name", "view.sort.modifiedDate", "view.sort.type"] as const).map(
            (commandId) => (
              <CommandRadioItem
                commandId={commandId}
                key={commandId}
                state={commandState(commandId)}
              />
            ),
          )}
        </MenubarRadioGroup>
      </MenubarSubContent>
    </MenubarSub>
  );
}

const lineEndingRadioValue = (commandState: SubmenuProps["commandState"]) => {
  if (commandState("edit.lineEnding.crlf").checked) return "edit.lineEnding.crlf";
  if (commandState("edit.lineEnding.lf").checked) return "edit.lineEnding.lf";
  return "";
};

const appearanceRadioValue = (commandState: SubmenuProps["commandState"]) => {
  if (commandState("view.appearance.system").checked) return "view.appearance.system";
  if (commandState("view.appearance.light").checked) return "view.appearance.light";
  if (commandState("view.appearance.dark").checked) return "view.appearance.dark";
  return "";
};

const sortRadioValue = (commandState: SubmenuProps["commandState"]) => {
  if (commandState("view.sort.name").checked) return "view.sort.name";
  if (commandState("view.sort.modifiedDate").checked) return "view.sort.modifiedDate";
  if (commandState("view.sort.type").checked) return "view.sort.type";
  return "";
};
