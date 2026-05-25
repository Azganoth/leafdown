import {
  VirtualList,
  VirtualListContent,
  VirtualListEmpty,
  VirtualListItem,
  VirtualListItems,
  type VirtualListHandle,
} from "@/components/ui/VirtualList";
import { Button } from "@/components/ui/Button";
import { Separator } from "@/components/ui/Separator";
import { getOpenMarkdownFileErrorMessage, showDocumentIoErrorToast } from "@/lib/documentIoErrors";
import { cn } from "@/lib/cn";
import { openMarkdownFilePath } from "@/lib/openMarkdownFile";
import type { ActiveDocumentState, FolderContextState } from "@/stores/session";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderTreeIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useFileTreeViewStore } from "../stores/fileTreeView";
import {
  buildFileTreeRows,
  getFileAncestorDirectoryPaths,
  type FileTreeDirectoryRow,
  type FileTreeFileRow,
  type FileTreeRow,
} from "../utils/fileTreeRows";

interface FileTreeSidebarProps {
  activeDocument: ActiveDocumentState | null;
  folderContext: FolderContextState | null;
}

const fileTreeRowHeight = 30;
const pathSignatureSeparator = "\u0000";

export function FileTreeSidebar({ activeDocument, folderContext }: FileTreeSidebarProps) {
  const expandedDirectoryPaths = useFileTreeViewStore((state) => state.expandedDirectoryPaths);
  const expandDirectories = useFileTreeViewStore((state) => state.expandDirectories);
  const revealFilePath = useFileTreeViewStore((state) => state.revealFilePath);
  const revealRequestId = useFileTreeViewStore((state) => state.revealRequestId);
  const toggleDirectory = useFileTreeViewStore((state) => state.toggleDirectory);
  const virtualListRef = useRef<VirtualListHandle>(null);
  const activeFilePath = activeDocument?.status === "saved" ? activeDocument.path : null;
  const activeFileAncestorDirectoryPaths =
    folderContext && activeFilePath
      ? getFileAncestorDirectoryPaths(folderContext.tree, activeFilePath)
      : null;
  const activeFileAncestorDirectoryPathSignature =
    activeFileAncestorDirectoryPaths?.join(pathSignatureSeparator) ?? "";
  const rows = folderContext
    ? buildFileTreeRows({
        activeFilePath,
        expandedDirectoryPaths,
        tree: folderContext.tree,
      })
    : [];
  const revealRowIndex = rows.findIndex(
    (row) => row.kind === "file" && row.path === revealFilePath,
  );

  useEffect(() => {
    if (!activeFileAncestorDirectoryPathSignature) {
      return;
    }

    expandDirectories(activeFileAncestorDirectoryPathSignature.split(pathSignatureSeparator));
  }, [activeFileAncestorDirectoryPathSignature, expandDirectories]);

  useEffect(() => {
    if (revealRequestId === 0 || revealRowIndex < 0) {
      return;
    }

    virtualListRef.current?.scrollToIndex(revealRowIndex, { align: "center" });
  }, [revealRequestId, revealRowIndex]);

  const handleOpenFile = (path: string) => {
    if (path === activeFilePath) {
      return;
    }

    void openMarkdownFilePath(path).catch((error: unknown) => {
      showDocumentIoErrorToast(toast.error, getOpenMarkdownFileErrorMessage(error));
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FolderTreeIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <span>Files</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={folderContext?.path}>
          {folderContext ? folderContext.tree.name || folderContext.path : "No folder context"}
        </p>
      </header>
      <Separator />

      {!folderContext && <NoFolderContext />}
      {folderContext && (
        <>
          {folderContext.isEmpty && (
            <p className="shrink-0 px-3 py-2 text-xs leading-5 text-muted-foreground">
              No supported Markdown files found.
            </p>
          )}
          <VirtualList
            className="min-h-0 flex-1"
            estimateHeight={fileTreeRowHeight}
            getItemKey={(row) => row.path}
            items={rows}
            virtualListRef={virtualListRef}
          >
            <VirtualListEmpty>
              <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">
                No visible folder entries.
              </p>
            </VirtualListEmpty>
            <VirtualListContent aria-label="Markdown file tree" className="mx-1" role="list">
              <VirtualListItems<FileTreeRow>>
                {(row, virtualRow) => (
                  <VirtualListItem key={row.path} virtualRow={virtualRow}>
                    {row.kind === "directory" && (
                      <DirectoryRow row={row} onToggleDirectory={toggleDirectory} />
                    )}
                    {row.kind === "file" && <FileRow row={row} onOpenFile={handleOpenFile} />}
                  </VirtualListItem>
                )}
              </VirtualListItems>
            </VirtualListContent>
          </VirtualList>
        </>
      )}
    </div>
  );
}

function NoFolderContext() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <FolderOpenIcon aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">No folder open</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Open a Markdown file or folder to browse nearby documents.
      </p>
    </div>
  );
}

interface DirectoryRowProps {
  onToggleDirectory: (path: string) => void;
  row: FileTreeDirectoryRow;
}

function DirectoryRow({ onToggleDirectory, row }: DirectoryRowProps) {
  const Icon = row.isExpanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <Button
      aria-expanded={row.hasChildren ? row.isExpanded : undefined}
      className="h-[30px] w-full justify-start gap-1 rounded-md pr-2 text-xs font-normal"
      disabled={!row.hasChildren}
      onClick={() => onToggleDirectory(row.path)}
      style={{ paddingLeft: `${row.depth * 14 + 6}px` }}
      title={row.path}
      type="button"
      variant="ghost"
    >
      {row.hasChildren ? (
        <Icon aria-hidden="true" className="size-3 text-muted-foreground" />
      ) : (
        <span className="size-3 shrink-0" />
      )}
      <FolderIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 truncate">{row.name}</span>
    </Button>
  );
}

interface FileRowProps {
  onOpenFile: (path: string) => void;
  row: FileTreeFileRow;
}

function FileRow({ onOpenFile, row }: FileRowProps) {
  return (
    <Button
      aria-current={row.isActive ? "page" : undefined}
      className={cn(
        "h-[30px] w-full justify-start gap-1 rounded-md pr-2 text-xs font-normal",
        "data-active:bg-accent data-active:text-foreground data-active:shadow-[inset_2px_0_0_var(--primary)]",
      )}
      data-active={row.isActive}
      onClick={() => onOpenFile(row.path)}
      style={{ paddingLeft: `${row.depth * 14 + 23}px` }}
      title={row.path}
      type="button"
      variant="ghost"
    >
      <FileTextIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 truncate">{row.name}</span>
    </Button>
  );
}
