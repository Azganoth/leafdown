import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type Ref } from "react";

import { buttonVariants } from "@/components/ui/Button";
import { Separator } from "@/components/ui/Separator";
import {
  VirtualList,
  VirtualListContent,
  VirtualListItem,
  VirtualListItems,
  type VirtualItem,
  type VirtualListHandle,
} from "@/components/ui/VirtualList";
import { cn } from "@/lib/cn";
import { hasNoShortcutModifier } from "@/lib/input";
import { isSameOrParentPath, isSamePath } from "@/lib/path";

import type { FolderContextState } from "../services/folderContext";
import { useArticleNavigatorStore } from "../stores/articleNavigator";
import {
  buildArticleNavigatorRows,
  getArticleAncestorDirectoryPaths,
  type ArticleNavigatorArticleRow,
  type ArticleNavigatorDirectoryRow,
  type ArticleNavigatorRow,
} from "../utils/articleNavigatorRows";

const PATH_SIGNATURE_SEPARATOR = "\u0000";
const ARTICLE_NAVIGATOR_ROW_HEIGHT = 30;

interface ArticleNavigatorProps {
  activeArticlePath: string | null;
  folderContext: FolderContextState | null;
  onOpenArticle: (path: string) => void;
}

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
    activeFileAncestorDirectoryPaths?.join(PATH_SIGNATURE_SEPARATOR) ?? "";
  const activeDocumentIsDetached =
    folderContext && activeArticlePath
      ? !isSameOrParentPath(folderContext.path, activeArticlePath)
      : false;
  const scanWarningCount = folderContext?.warnings.length ?? 0;
  const emptyFolderMessage =
    scanWarningCount > 0
      ? "No supported Markdown files found in scanned entries."
      : "No supported Markdown files found.";
  const rows = folderContext
    ? buildArticleNavigatorRows({
        activeArticlePath,
        expandedDirectoryPaths,
        tree: folderContext.tree,
      })
    : [];
  const hasRows = rows.length > 0;
  const revealRowIndex = rows.findIndex(
    (row) =>
      row.kind === "file" && revealArticlePath !== null && isSamePath(row.path, revealArticlePath),
  );

  useEffect(() => {
    if (!activeFileAncestorDirectoryPathSignature) {
      return;
    }

    expandDirectories(activeFileAncestorDirectoryPathSignature.split(PATH_SIGNATURE_SEPARATOR));
  }, [activeFileAncestorDirectoryPathSignature, expandDirectories]);

  useEffect(() => {
    if (revealRequestId === 0 || revealRowIndex < 0) {
      return;
    }

    virtualListRef.current?.scrollToIndex(revealRowIndex, { align: "center" });
  }, [revealRequestId, revealRowIndex]);

  const handleOpenArticle = (path: string) => {
    if (activeArticlePath && isSamePath(path, activeArticlePath)) {
      return;
    }

    onOpenArticle(path);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FolderTreeIcon className="size-4 text-muted-foreground" />
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
          {activeDocumentIsDetached && <DetachedDocumentNotice />}
          {scanWarningCount > 0 && <FolderScanWarningNotice warningCount={scanWarningCount} />}
          {folderContext.isEmpty && (
            <p className="shrink-0 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {emptyFolderMessage}
            </p>
          )}
          {hasRows && (
            <ArticleNavigatorRows
              onOpenArticle={handleOpenArticle}
              onToggleDirectory={toggleDirectory}
              rows={rows}
              virtualListRef={virtualListRef}
            />
          )}
          {!folderContext.isEmpty && !hasRows && (
            <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">
              No visible folder entries.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function DetachedDocumentNotice() {
  return (
    <div className="shrink-0 px-3 py-2 text-xs leading-5 text-muted-foreground">
      <div className="flex gap-2 rounded-md border border-border bg-card/65 px-2 py-1.5">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
        <span>Current document is outside this folder context.</span>
      </div>
    </div>
  );
}

interface FolderScanWarningNoticeProps {
  warningCount: number;
}

function FolderScanWarningNotice({ warningCount }: FolderScanWarningNoticeProps) {
  return (
    <div className="shrink-0 px-3 py-2 text-xs leading-5 text-muted-foreground">
      <div className="flex gap-2 rounded-md border border-border bg-card/65 px-2 py-1.5">
        <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Some folder entries could not be scanned. {getScanWarningIssueText(warningCount)}
        </span>
      </div>
    </div>
  );
}

const getScanWarningIssueText = (warningCount: number) =>
  warningCount === 1 ? "1 issue found." : `${warningCount} issues found.`;

function NoFolderContext() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <FolderOpenIcon className="size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">No folder open</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Open a Markdown file or folder to browse nearby documents.
      </p>
    </div>
  );
}

interface ArticleNavigatorRowsProps {
  onOpenArticle: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  rows: ArticleNavigatorRow[];
  virtualListRef: Ref<VirtualListHandle>;
}

function ArticleNavigatorRows({
  onOpenArticle,
  onToggleDirectory,
  rows,
  virtualListRef,
}: ArticleNavigatorRowsProps) {
  return (
    <VirtualList
      className="min-h-0 flex-1"
      estimateHeight={ARTICLE_NAVIGATOR_ROW_HEIGHT}
      getItemKey={(row) => row.path}
      items={rows}
      virtualListRef={virtualListRef}
    >
      <VirtualListContent aria-label="Articles" className="mx-1" role="tree">
        <VirtualListItems<ArticleNavigatorRow>>
          {(row, virtualRow) => (
            <ArticleNavigatorTreeItem
              key={row.path}
              onOpenArticle={onOpenArticle}
              onToggleDirectory={onToggleDirectory}
              row={row}
              virtualRow={virtualRow}
            />
          )}
        </VirtualListItems>
      </VirtualListContent>
    </VirtualList>
  );
}

interface ArticleNavigatorTreeItemProps {
  onOpenArticle: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  row: ArticleNavigatorRow;
  virtualRow: VirtualItem;
}

function ArticleNavigatorTreeItem({
  onOpenArticle,
  onToggleDirectory,
  row,
  virtualRow,
}: ArticleNavigatorTreeItemProps) {
  const activate = () =>
    row.kind === "directory" ? onToggleDirectory(row.path) : onOpenArticle(row.path);

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if ((event.key !== "Enter" && event.key !== " ") || !hasNoShortcutModifier(event.nativeEvent)) {
      return;
    }

    event.preventDefault();
    activate();
  };

  return (
    <VirtualListItem
      aria-expanded={row.kind === "directory" && row.hasChildren ? row.isExpanded : undefined}
      aria-level={row.depth + 1}
      aria-posinset={row.posInSet}
      aria-selected={row.kind === "file" && row.isActive}
      aria-setsize={row.setSize}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "h-[30px] w-full justify-start gap-1 rounded-md pr-2 text-xs font-normal",
        "data-active:bg-accent data-active:text-foreground data-active:shadow-[inset_2px_0_0_var(--primary)]",
      )}
      data-active={row.kind === "file" ? row.isActive : undefined}
      onClick={activate}
      onKeyDown={handleKeyDown}
      role="treeitem"
      style={{ paddingLeft: `${row.depth * 14 + (row.kind === "directory" ? 6 : 23)}px` }}
      tabIndex={0}
      title={row.path}
      virtualRow={virtualRow}
    >
      {row.kind === "directory" ? (
        <DirectoryRowContent row={row} />
      ) : (
        <ArticleRowContent row={row} />
      )}
    </VirtualListItem>
  );
}

function DirectoryRowContent({ row }: { row: ArticleNavigatorDirectoryRow }) {
  const Icon = row.isExpanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <>
      {row.hasChildren ? (
        <Icon className="size-3 text-muted-foreground" />
      ) : (
        <span className="size-3 shrink-0" />
      )}
      <FolderIcon className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 truncate">{row.name}</span>
    </>
  );
}

function ArticleRowContent({ row }: { row: ArticleNavigatorArticleRow }) {
  return (
    <>
      <FileTextIcon className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 truncate">{row.name}</span>
    </>
  );
}
