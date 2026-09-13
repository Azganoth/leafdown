import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  InfoIcon,
  SearchIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  VirtualList,
  VirtualListContent,
  VirtualListItem,
  VirtualListItems,
  type VirtualItem,
  type VirtualListHandle,
} from "@/components/ui/virtual-list";
import { hasNoShortcutModifier } from "@/lib/input";
import { isSameOrParentPath, isSamePath } from "@/lib/path";
import { cn } from "@/lib/utils";

import type { FolderContextState } from "../services/folderContext";
import { useArticleNavigatorStore } from "../stores/articleNavigator";
import {
  buildArticleNavigatorRows,
  filterArticleTreeByArticleName,
  getArticleAncestorDirectoryPaths,
  getArticleDirectoryPaths,
  getArticleFileCount,
  type ArticleNavigatorArticleRow,
  type ArticleNavigatorDirectoryRow,
  type ArticleNavigatorRow,
} from "../utils/articleNavigatorRows";
import {
  ARTICLE_NAVIGATOR_TYPEAHEAD_RESET_MS,
  getArticleNavigatorFocusedIndex,
  getArticleNavigatorTraversalAction,
  getArticleNavigatorTypeaheadIndex,
  isArticleNavigatorTraversalKey,
  isArticleNavigatorTypeaheadKey,
} from "../utils/articleNavigatorTraversal";

const PATH_SIGNATURE_SEPARATOR = "\u0000";
const ARTICLE_NAVIGATOR_ROW_HEIGHT = 30;

interface ArticleNavigatorProps {
  activeArticlePath: string | null;
  folderContext: FolderContextState;
  onOpenArticle: (path: string) => void;
}

export function ArticleNavigator({
  activeArticlePath,
  folderContext,
  onOpenArticle,
}: ArticleNavigatorProps) {
  const expandedDirectoryPaths = useArticleNavigatorStore((state) => state.expandedDirectoryPaths);
  const expandDirectories = useArticleNavigatorStore((state) => state.expandDirectories);
  const toggleDirectory = useArticleNavigatorStore((state) => state.toggleDirectory);
  const [filterQuery, setFilterQuery] = useState("");
  const isFiltering = filterQuery.trim().length > 0;
  const filteredTree = filterArticleTreeByArticleName(folderContext.tree, filterQuery);
  const expandedPaths = isFiltering
    ? getArticleDirectoryPaths(filteredTree)
    : expandedDirectoryPaths;
  const articleCount = getArticleFileCount(folderContext.tree);
  const articleCountLabel = getArticleCountLabel(articleCount);
  const activeFileAncestorDirectoryPaths = activeArticlePath
    ? getArticleAncestorDirectoryPaths(folderContext.tree, activeArticlePath)
    : null;
  const activeFileAncestorDirectoryPathSignature =
    activeFileAncestorDirectoryPaths?.join(PATH_SIGNATURE_SEPARATOR) ?? "";
  const activeDocumentIsDetached = activeArticlePath
    ? !isSameOrParentPath(folderContext.path, activeArticlePath)
    : false;
  const scanWarningCount = folderContext.warnings.length;
  const emptyFolderMessage =
    scanWarningCount > 0
      ? "No supported Markdown files found in scanned entries."
      : "No supported Markdown files found.";
  const rows = buildArticleNavigatorRows({
    activeArticlePath,
    expandedDirectoryPaths: expandedPaths,
    tree: filteredTree,
  });
  const hasRows = rows.length > 0;

  useEffect(() => {
    if (!activeFileAncestorDirectoryPathSignature) {
      return;
    }

    expandDirectories(activeFileAncestorDirectoryPathSignature.split(PATH_SIGNATURE_SEPARATOR));
  }, [activeFileAncestorDirectoryPathSignature, expandDirectories]);

  const handleOpenArticle = (path: string) => {
    if (activeArticlePath && isSamePath(path, activeArticlePath)) {
      return;
    }

    onOpenArticle(path);
  };

  return (
    <Card size="sm" className="min-h-0 min-w-0 flex-1">
      <CardHeader className="shrink-0">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate" title={folderContext.path}>
            {folderContext.tree.name || folderContext.path}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge
                  aria-label={articleCountLabel}
                  className="tabular-nums"
                  variant="secondary"
                />
              }
            >
              {articleCount}
            </TooltipTrigger>
            <TooltipContent side="bottom">{articleCountLabel}</TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 gap-2">
        {!folderContext.isEmpty && (
          <InputGroup className="h-7 border-transparent bg-muted/50 shadow-none dark:bg-muted/50">
            <InputGroupInput
              aria-label="Filter articles"
              className="text-xs md:text-xs"
              onChange={(event) => setFilterQuery(event.target.value)}
              placeholder="Filter…"
              type="text"
              value={filterQuery}
            />
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-3.5" />
            </InputGroupAddon>
            {filterQuery && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Clear article filter"
                  onClick={() => setFilterQuery("")}
                  size="icon-xs"
                >
                  <XIcon data-icon="inline-end" />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        )}
        {activeDocumentIsDetached && <DetachedDocumentNotice />}
        {scanWarningCount > 0 && <FolderScanWarningNotice warningCount={scanWarningCount} />}
        {folderContext.isEmpty && <EmptyFolderMessage message={emptyFolderMessage} />}
        {hasRows && (
          <ArticleNavigatorRows
            onOpenArticle={handleOpenArticle}
            onToggleDirectory={toggleDirectory}
            rows={rows}
          />
        )}
        {!folderContext.isEmpty && !hasRows && (
          <p className="py-3 text-xs leading-5 text-muted-foreground">
            {isFiltering ? "No matching articles." : "No visible folder entries."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const getArticleCountLabel = (articleCount: number) =>
  articleCount === 1 ? "1 article" : `${articleCount} articles`;

function EmptyFolderMessage({ message }: { message: string }) {
  return <p className="shrink-0 py-2 text-xs leading-5 text-muted-foreground">{message}</p>;
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

interface ArticleNavigatorRowsProps {
  onOpenArticle: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  rows: ArticleNavigatorRow[];
}

interface ArticleNavigatorFocus {
  path: string | null;
  requestId: number;
}

function ArticleNavigatorRows({
  onOpenArticle,
  onToggleDirectory,
  rows,
}: ArticleNavigatorRowsProps) {
  const virtualListRef = useRef<VirtualListHandle>(null);
  const revealArticlePath = useArticleNavigatorStore((state) => state.revealArticlePath);
  const revealRequestId = useArticleNavigatorStore((state) => state.revealRequestId);
  const [focus, setFocus] = useState<ArticleNavigatorFocus>({ path: null, requestId: 0 });
  const rowElementsRef = useRef(new Map<string, HTMLLIElement>());
  const hasRowFocusRef = useRef(false);
  const typeaheadRef = useRef({ buffer: "", lastKeyAtMs: 0 });
  const focusedIndex = getArticleNavigatorFocusedIndex(rows, focus.path);
  const focusedRowPath = rows[focusedIndex]?.path;
  const handledRevealRequestIdRef = useRef(0);
  const revealRowIndex = rows.findIndex(
    (row) =>
      row.kind === "file" && revealArticlePath !== null && isSamePath(row.path, revealArticlePath),
  );
  const revealRowPath = revealRowIndex < 0 ? null : rows[revealRowIndex].path;

  // A requested row may sit outside the rendered window, so it is pinned first and
  // focused once that render commits.
  useEffect(() => {
    if (focus.requestId === 0 || focus.path === null) {
      return;
    }

    rowElementsRef.current.get(focus.path)?.focus();
  }, [focus]);

  // The revealed row is pinned, so it is mounted by the time this reaches for it.
  useEffect(() => {
    // Expanding a directory renumbers the revealed row and re-runs this, which
    // must not pull focus back a second time.
    if (revealRequestId === handledRevealRequestIdRef.current || revealRowPath === null) {
      return;
    }

    handledRevealRequestIdRef.current = revealRequestId;
    virtualListRef.current?.scrollToIndex(revealRowIndex, { align: "center" });
    rowElementsRef.current.get(revealRowPath)?.focus();
  }, [revealRequestId, revealRowIndex, revealRowPath]);

  useEffect(() => {
    if (
      focusedRowPath === undefined ||
      !hasRowFocusRef.current ||
      document.activeElement !== document.body
    ) {
      return;
    }

    rowElementsRef.current.get(focusedRowPath)?.focus();
  }, [focusedRowPath]);

  const focusRow = (index: number) => {
    const path = rows[index]?.path;

    if (path === undefined) {
      return;
    }

    setFocus((currentFocus) => ({ path, requestId: currentFocus.requestId + 1 }));
  };

  const activateRow = (index: number) => {
    const row = rows[index];

    if (!row) {
      return;
    }

    if (row.kind === "directory") {
      onToggleDirectory(row.path);
    } else {
      onOpenArticle(row.path);
    }
  };

  // Nothing reads the buffer between keystrokes, so it expires by elapsed time
  // rather than on a timer.
  const readTypeaheadBuffer = () =>
    Date.now() - typeaheadRef.current.lastKeyAtMs > ARTICLE_NAVIGATOR_TYPEAHEAD_RESET_MS
      ? ""
      : typeaheadRef.current.buffer;

  const searchByTypeahead = (character: string) => {
    const typeaheadBuffer = readTypeaheadBuffer() + character;
    typeaheadRef.current = { buffer: typeaheadBuffer, lastKeyAtMs: Date.now() };

    const matchIndex = getArticleNavigatorTypeaheadIndex({ focusedIndex, rows, typeaheadBuffer });

    if (matchIndex !== null) {
      focusRow(matchIndex);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!hasNoShortcutModifier(event.nativeEvent)) {
      return;
    }

    if (isArticleNavigatorTypeaheadKey(event.key, readTypeaheadBuffer())) {
      event.preventDefault();
      searchByTypeahead(event.key);

      return;
    }

    if (!isArticleNavigatorTraversalKey(event.key)) {
      return;
    }

    event.preventDefault();

    const action = getArticleNavigatorTraversalAction({ focusedIndex, key: event.key, rows });

    switch (action?.type) {
      case "activateRow":
        activateRow(action.index);
        break;
      case "focusRow":
        focusRow(action.index);
        break;
      case "toggleDirectory":
        onToggleDirectory(action.path);
        break;
    }
  };

  return (
    <VirtualList
      className="min-h-0 flex-1"
      estimateHeight={ARTICLE_NAVIGATOR_ROW_HEIGHT}
      getItemKey={(row) => row.path}
      items={rows}
      pinnedIndexes={[focusedIndex, revealRowIndex]}
      virtualListRef={virtualListRef}
    >
      <VirtualListContent
        aria-label="Articles"
        className="mx-1"
        onBlur={() => {
          hasRowFocusRef.current = false;
        }}
        onKeyDown={handleKeyDown}
        role="tree"
      >
        <VirtualListItems<ArticleNavigatorRow>>
          {(row, virtualRow, index) => (
            <ArticleNavigatorTreeItem
              key={row.path}
              isTabStop={index === focusedIndex}
              onActivate={() => activateRow(index)}
              onFocus={() => {
                hasRowFocusRef.current = true;
                setFocus((currentFocus) => ({ ...currentFocus, path: row.path }));
              }}
              registerElement={(element) =>
                registerRowElement(rowElementsRef.current, row, element)
              }
              row={row}
              virtualRow={virtualRow}
            />
          )}
        </VirtualListItems>
      </VirtualListContent>
    </VirtualList>
  );
}

const registerRowElement = (
  rowElements: Map<string, HTMLLIElement>,
  row: ArticleNavigatorRow,
  element: HTMLLIElement | null,
) => {
  if (element) {
    rowElements.set(row.path, element);
  } else {
    rowElements.delete(row.path);
  }
};

interface ArticleNavigatorTreeItemProps {
  isTabStop: boolean;
  onActivate: () => void;
  onFocus: () => void;
  registerElement: (element: HTMLLIElement | null) => void;
  row: ArticleNavigatorRow;
  virtualRow: VirtualItem;
}

function ArticleNavigatorTreeItem({
  isTabStop,
  onActivate,
  onFocus,
  registerElement,
  row,
  virtualRow,
}: ArticleNavigatorTreeItemProps) {
  return (
    <VirtualListItem
      aria-expanded={row.kind === "directory" && row.hasChildren ? row.isExpanded : undefined}
      aria-level={row.depth + 1}
      aria-posinset={row.posInSet}
      aria-selected={row.kind === "file" && row.isActive}
      aria-setsize={row.setSize}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "h-[30px] w-full justify-start gap-1 rounded-md pr-2 text-xs font-normal hover:bg-muted/70 aria-expanded:bg-transparent aria-expanded:text-inherit dark:aria-expanded:bg-transparent",
        "data-active:bg-accent/80 data-active:font-medium data-active:text-foreground data-active:shadow-[inset_2px_0_0_var(--primary)] data-active:hover:bg-accent",
      )}
      data-active={row.kind === "file" ? row.isActive : undefined}
      onClick={onActivate}
      onFocus={onFocus}
      ref={registerElement}
      role="treeitem"
      style={{ paddingLeft: `${row.depth * 14 + (row.kind === "directory" ? 6 : 23)}px` }}
      tabIndex={isTabStop ? 0 : -1}
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
  const DisclosureIcon = row.isExpanded ? ChevronDownIcon : ChevronRightIcon;
  const DirectoryIcon = row.isExpanded ? FolderOpenIcon : FolderIcon;

  return (
    <>
      {row.hasChildren ? (
        <DisclosureIcon className="size-3 text-muted-foreground" />
      ) : (
        <span className="size-3 shrink-0" />
      )}
      <DirectoryIcon className="size-3.5 text-muted-foreground" />
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
