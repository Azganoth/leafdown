import { Button } from "@/components/ui/Button";
import { Separator } from "@/components/ui/Separator";
import {
  VirtualList,
  VirtualListContent,
  VirtualListEmpty,
  VirtualListItem,
  VirtualListItems,
  type VirtualListHandle,
} from "@/components/ui/VirtualList";
import { cn } from "@/lib/cn";
import type { FolderContextState } from "../types";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderTreeIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useArticleNavigatorStore } from "../stores/articleNavigator";
import {
  buildArticleNavigatorRows,
  getArticleAncestorDirectoryPaths,
  type ArticleNavigatorArticleRow,
  type ArticleNavigatorDirectoryRow,
  type ArticleNavigatorRow,
} from "../utils/articleNavigatorRows";

interface ArticleNavigatorProps {
  activeArticlePath: string | null;
  folderContext: FolderContextState | null;
  onOpenArticle: (path: string) => void;
}

const articleNavigatorRowHeight = 30;
const pathSignatureSeparator = "\u0000";

export function ArticleNavigator({
  activeArticlePath,
  folderContext,
  onOpenArticle,
}: ArticleNavigatorProps) {
  const expandedDirectoryPaths = useArticleNavigatorStore((state) => state.expandedDirectoryPaths);
  const expandDirectories = useArticleNavigatorStore((state) => state.expandDirectories);
  const revealArticlePath = useArticleNavigatorStore((state) => state.revealArticlePath);
  const revealRequestId = useArticleNavigatorStore((state) => state.revealRequestId);
  const toggleDirectory = useArticleNavigatorStore((state) => state.toggleDirectory);
  const virtualListRef = useRef<VirtualListHandle>(null);
  const activeFileAncestorDirectoryPaths =
    folderContext && activeArticlePath
      ? getArticleAncestorDirectoryPaths(folderContext.tree, activeArticlePath)
      : null;
  const activeFileAncestorDirectoryPathSignature =
    activeFileAncestorDirectoryPaths?.join(pathSignatureSeparator) ?? "";
  const rows = folderContext
    ? buildArticleNavigatorRows({
        activeArticlePath,
        expandedDirectoryPaths,
        tree: folderContext.tree,
      })
    : [];
  const revealRowIndex = rows.findIndex(
    (row) => row.kind === "file" && row.path === revealArticlePath,
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

  const handleOpenArticle = (path: string) => {
    if (path === activeArticlePath) {
      return;
    }

    onOpenArticle(path);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FolderTreeIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <span>Articles</span>
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
            estimateHeight={articleNavigatorRowHeight}
            getItemKey={(row) => row.path}
            items={rows}
            virtualListRef={virtualListRef}
          >
            <VirtualListEmpty>
              <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">
                No visible folder entries.
              </p>
            </VirtualListEmpty>
            <VirtualListContent aria-label="Article navigator" className="mx-1" role="list">
              <VirtualListItems<ArticleNavigatorRow>>
                {(row, virtualRow) => (
                  <VirtualListItem key={row.path} virtualRow={virtualRow}>
                    {row.kind === "directory" && (
                      <DirectoryRow row={row} onToggleDirectory={toggleDirectory} />
                    )}
                    {row.kind === "file" && (
                      <ArticleRow row={row} onOpenArticle={handleOpenArticle} />
                    )}
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
  row: ArticleNavigatorDirectoryRow;
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

interface ArticleRowProps {
  onOpenArticle: (path: string) => void;
  row: ArticleNavigatorArticleRow;
}

function ArticleRow({ onOpenArticle, row }: ArticleRowProps) {
  return (
    <Button
      aria-current={row.isActive ? "page" : undefined}
      className={cn(
        "h-[30px] w-full justify-start gap-1 rounded-md pr-2 text-xs font-normal",
        "data-active:bg-accent data-active:text-foreground data-active:shadow-[inset_2px_0_0_var(--primary)]",
      )}
      data-active={row.isActive}
      onClick={() => onOpenArticle(row.path)}
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
