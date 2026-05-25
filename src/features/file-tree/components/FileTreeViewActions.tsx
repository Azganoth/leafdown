import { Button } from "@/components/ui/Button";
import {
  getOpenMarkdownFolderErrorMessage,
  showDocumentIoErrorToast,
} from "@/lib/documentIoErrors";
import { scanMarkdownFolder } from "@/lib/openMarkdownFolder";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore, type FileTreeSortOrder } from "@/stores/settings";
import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  LocateFixedIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useFileTreeViewStore } from "../stores/fileTreeView";
import { getDirectoryPaths, getFileAncestorDirectoryPaths } from "../utils/fileTreeRows";

const fileTreeSortOptions = [
  { label: "Name", value: "name" },
  { label: "Modified date", value: "modifiedDate" },
  { label: "Type", value: "type" },
] satisfies { label: string; value: FileTreeSortOrder }[];

const isPrimaryModifierEvent = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;

export function FileTreeViewActions() {
  const [pendingSortOrder, setPendingSortOrder] = useState<FileTreeSortOrder | null>(null);
  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);
  const setFolderContext = useSessionStore((state) => state.setFolderContext);
  const fileTreeSortOrder = useSettingsStore((state) => state.fileTreeSortOrder);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const collapseAll = useFileTreeViewStore((state) => state.collapseAll);
  const expandDirectories = useFileTreeViewStore((state) => state.expandDirectories);
  const requestRevealFile = useFileTreeViewStore((state) => state.requestRevealFile);
  const activeFilePath = activeDocument?.status === "saved" ? activeDocument.path : null;
  const activeFileAncestorDirectoryPaths =
    folderContext && activeFilePath
      ? getFileAncestorDirectoryPaths(folderContext.tree, activeFilePath)
      : null;
  const canUseFileTreeCommands = Boolean(folderContext);
  const canRevealActiveFile = Boolean(
    folderContext && activeFilePath && activeFileAncestorDirectoryPaths,
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !isPrimaryModifierEvent(event) ||
        !event.shiftKey ||
        event.altKey ||
        event.key.toLowerCase() !== "e"
      ) {
        return;
      }

      event.preventDefault();

      const settings = useSettingsStore.getState();
      settings.updateSetting("sidebarVisible", !settings.sidebarVisible);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSortOrderChange = (sortOrder: FileTreeSortOrder) => {
    if (!folderContext || sortOrder === fileTreeSortOrder || pendingSortOrder) {
      return;
    }

    const previousSortOrder = useSettingsStore.getState().fileTreeSortOrder;
    const folderPath = folderContext.path;

    setPendingSortOrder(sortOrder);
    updateSetting("fileTreeSortOrder", sortOrder);

    void scanMarkdownFolder(folderPath)
      .then((nextFolderContext) => {
        if (useSessionStore.getState().folderContext?.path === folderPath) {
          setFolderContext(nextFolderContext);
        }
      })
      .catch((error: unknown) => {
        updateSetting("fileTreeSortOrder", previousSortOrder);
        showDocumentIoErrorToast(
          toast.error,
          getOpenMarkdownFolderErrorMessage({ kind: "scanFailed", error }),
        );
      })
      .finally(() => {
        setPendingSortOrder(null);
      });
  };

  const handleExpandAll = () => {
    if (!folderContext) {
      return;
    }

    expandDirectories(getDirectoryPaths(folderContext.tree));
  };

  const handleRevealActiveFile = () => {
    if (!activeFilePath || !activeFileAncestorDirectoryPaths) {
      return;
    }

    updateSetting("sidebarVisible", true);
    requestRevealFile(activeFilePath, activeFileAncestorDirectoryPaths);
  };

  return (
    <div aria-label="View actions" className="flex min-w-0 items-center gap-1">
      <Button
        aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
        onClick={() => updateSetting("sidebarVisible", !sidebarVisible)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {sidebarVisible ? (
          <PanelLeftCloseIcon aria-hidden="true" className="size-4" />
        ) : (
          <PanelLeftOpenIcon aria-hidden="true" className="size-4" />
        )}
        Sidebar
      </Button>

      <div aria-label="Sort file tree by" className="flex items-center gap-0.5" role="group">
        {fileTreeSortOptions.map((option) => (
          <Button
            aria-label={`Sort file tree by ${option.label.toLowerCase()}`}
            aria-pressed={fileTreeSortOrder === option.value}
            disabled={!canUseFileTreeCommands || Boolean(pendingSortOrder)}
            key={option.value}
            onClick={() => handleSortOrderChange(option.value)}
            size="sm"
            type="button"
            variant={fileTreeSortOrder === option.value ? "secondary" : "ghost"}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <Button
        disabled={!canUseFileTreeCommands}
        onClick={collapseAll}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ChevronsDownUpIcon aria-hidden="true" className="size-4" />
        Collapse all
      </Button>
      <Button
        disabled={!canUseFileTreeCommands}
        onClick={handleExpandAll}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ChevronsUpDownIcon aria-hidden="true" className="size-4" />
        Expand all
      </Button>
      <Button
        disabled={!canRevealActiveFile}
        onClick={handleRevealActiveFile}
        size="sm"
        type="button"
        variant="ghost"
      >
        <LocateFixedIcon aria-hidden="true" className="size-4" />
        Reveal active file
      </Button>
    </div>
  );
}
