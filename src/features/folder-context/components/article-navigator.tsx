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
import type { LucideIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
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
import { getRelativePath, isSameOrParentPath, isSamePath, type PathMap } from "@/lib/path";
import { cn } from "@/lib/utils";

import type { FolderContextState } from "../services/folderContext";
import { useArticleNavigatorStore } from "../stores/articleNavigator";
import {
  buildArticleNavigatorRows,
  filterArticleTreeByArticleName,
  getArticleAncestorDirectoryPaths,
  getArticleDirectoryPaths,
  getArticleFileCount,
  getArticleNavigatorRowIndexes,
  type ArticleNavigatorDirectoryRow,
  type ArticleNavigatorDraft,
  type ArticleNavigatorEntryKind,
  type ArticleNavigatorFileRow,
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
const ROW_PATH_ATTRIBUTE = "data-navigator-path";
const ROW_MENU_KEYBOARD_OFFSET_X = 16;

export type { ArticleNavigatorEntryKind } from "../utils/articleNavigatorRows";

export type ArticleNavigatorEntryActionResult =
  | { outcome: "applied"; path: string }
  | { outcome: "cancelled" }
  | { outcome: "failed" };

export interface ArticleNavigatorEntryActions {
  copyPath: (path: string) => void;
  createEntry: (
    parentPath: string,
    entryKind: ArticleNavigatorEntryKind,
    name: string,
  ) => Promise<ArticleNavigatorEntryActionResult>;
  deleteEntry: (path: string, entryKind: ArticleNavigatorEntryKind) => void;
  renameEntry: (path: string, name: string) => Promise<ArticleNavigatorEntryActionResult>;
  revealEntry: (path: string) => void;
}

interface ArticleNavigatorProps {
  actions?: ArticleNavigatorEntryActions;
  activeArticlePath: string | null;
  folderContext: FolderContextState;
  onOpenArticle: (path: string) => void;
}

type ArticleNavigatorMenuTarget =
  | { kind: "root"; path: string }
  | { kind: ArticleNavigatorEntryKind; parentPath: string; path: string };

type ArticleNavigatorEdit =
  | (ArticleNavigatorDraft & { kind: "create"; originPath: string | null })
  | { kind: "rename"; entryKind: ArticleNavigatorEntryKind; name: string; path: string };

export function ArticleNavigator({
  actions,
  activeArticlePath,
  folderContext,
  onOpenArticle,
}: ArticleNavigatorProps) {
  const expandedDirectoryPaths = useArticleNavigatorStore((state) => state.expandedDirectoryPaths);
  const expandDirectories = useArticleNavigatorStore((state) => state.expandDirectories);
  const requestFocus = useArticleNavigatorStore((state) => state.requestFocus);
  const toggleDirectory = useArticleNavigatorStore((state) => state.toggleDirectory);
  const [filterQuery, setFilterQuery] = useState("");
  const [menuTarget, setMenuTarget] = useState<ArticleNavigatorMenuTarget>({
    kind: "root",
    path: folderContext.path,
  });
  const [edit, setEdit] = useState<ArticleNavigatorEdit | null>(null);
  const menuCloseFocusRef = useRef<"editor" | "target" | null>(null);
  const rowsHostRef = useRef<HTMLDivElement>(null);
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
    draft: edit?.kind === "create" ? edit : null,
    expandedDirectoryPaths: expandedPaths,
    tree: filteredTree,
  });
  const hasRows = rows.length > 0;
  const renamingPath = edit?.kind === "rename" ? edit.path : null;
  const isEditing =
    edit !== null &&
    (renamingPath === null || rows.some((row) => isSamePath(row.path, renamingPath)));

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

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const rowPath =
      event.target instanceof Element
        ? event.target.closest(`[${ROW_PATH_ATTRIBUTE}]`)?.getAttribute(ROW_PATH_ATTRIBUTE)
        : null;
    const row = rowPath ? rows.find((candidate) => candidate.path === rowPath) : undefined;

    if (!row || row.kind === "draft") {
      setMenuTarget({ kind: "root", path: folderContext.path });
      return;
    }

    const parentRow = row.parentIndex === null ? null : rows[row.parentIndex];

    setMenuTarget({
      kind: row.kind,
      parentPath: parentRow?.path ?? folderContext.path,
      path: row.path,
    });
  };

  const startCreate = (entryKind: ArticleNavigatorEntryKind) => {
    const parentPath = menuTarget.kind === "file" ? menuTarget.parentPath : menuTarget.path;

    if (!isSamePath(parentPath, folderContext.path)) {
      expandDirectories([parentPath]);
    }

    menuCloseFocusRef.current = "editor";
    setFilterQuery("");
    setEdit({
      entryKind,
      kind: "create",
      originPath: menuTarget.kind === "root" ? null : menuTarget.path,
      parentPath,
    });
  };

  const startRename = () => {
    if (menuTarget.kind === "root") {
      return;
    }

    const row = rows.find((candidate) => candidate.path === menuTarget.path);

    menuCloseFocusRef.current = "editor";
    setEdit({
      entryKind: menuTarget.kind,
      kind: "rename",
      name: row?.name ?? "",
      path: menuTarget.path,
    });
  };

  const commitEdit = (name: string): Promise<ArticleNavigatorEntryActionResult> => {
    if (!actions || !edit) {
      return Promise.resolve({ outcome: "cancelled" });
    }

    return edit.kind === "create"
      ? actions.createEntry(edit.parentPath, edit.entryKind, name)
      : actions.renameEntry(edit.path, name);
  };

  const finishEdit = (result: ArticleNavigatorEntryActionResult) => {
    const finishedEdit = edit;

    setEdit(null);

    if (result.outcome === "applied") {
      requestFocus(result.path);
      return;
    }

    const originPath =
      finishedEdit?.kind === "rename" ? finishedEdit.path : finishedEdit?.originPath;

    if (originPath) {
      requestFocus(originPath);
    }
  };

  const copyRelativePath = (path: string) => {
    const relativePath = getRelativePath(folderContext.path, path) ?? path;

    actions?.copyPath(
      folderContext.path.includes("\\") ? relativePath.replaceAll("/", "\\") : relativePath,
    );
  };

  // Focus returns to the row the menu was opened on, or stays with the name editor it opened.
  // This is answered once per opening; a later answer would pull focus away from a row an
  // action focused after the menu closed.
  const getMenuFinalFocus = () => {
    const closeFocus = menuCloseFocusRef.current;

    menuCloseFocusRef.current = null;

    if (closeFocus !== "target") {
      return false;
    }

    const rowElements = rowsHostRef.current?.querySelectorAll<HTMLElement>(
      `[${ROW_PATH_ATTRIBUTE}]`,
    );
    const targetRow = [...(rowElements ?? [])].find(
      (element) => element.getAttribute(ROW_PATH_ATTRIBUTE) === menuTarget.path,
    );

    return (
      targetRow ??
      rowsHostRef.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]') ??
      true
    );
  };

  const rowsContent = (
    <>
      {activeDocumentIsDetached && <DetachedDocumentNotice />}
      {scanWarningCount > 0 && <FolderScanWarningNotice warningCount={scanWarningCount} />}
      {folderContext.isEmpty && <EmptyFolderMessage message={emptyFolderMessage} />}
      {hasRows && (
        <ArticleNavigatorRows
          edit={isEditing ? edit : null}
          onCancelEdit={() => finishEdit({ outcome: "cancelled" })}
          onCommitEdit={commitEdit}
          onFinishEdit={finishEdit}
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
    </>
  );

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
        {actions ? (
          <ContextMenu
            disabled={isEditing}
            onOpenChange={(open) => {
              if (open) {
                menuCloseFocusRef.current = "target";
              }
            }}
          >
            <ContextMenuTrigger
              className="flex min-h-0 flex-1 flex-col select-auto"
              onContextMenu={handleContextMenu}
              ref={rowsHostRef}
            >
              {rowsContent}
            </ContextMenuTrigger>
            <ContextMenuContent
              aria-label={getMenuLabel(menuTarget)}
              className="min-w-48"
              finalFocus={getMenuFinalFocus}
            >
              {menuTarget.kind === "file" && (
                <>
                  <ContextMenuGroup>
                    <ContextMenuItem onClick={() => handleOpenArticle(menuTarget.path)}>
                      Open
                    </ContextMenuItem>
                  </ContextMenuGroup>
                  <ContextMenuSeparator />
                </>
              )}
              <ContextMenuGroup>
                <ContextMenuItem onClick={() => startCreate("file")}>New file</ContextMenuItem>
                <ContextMenuItem onClick={() => startCreate("directory")}>
                  New folder
                </ContextMenuItem>
              </ContextMenuGroup>
              {menuTarget.kind !== "root" && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuGroup>
                    <ContextMenuItem onClick={startRename}>Rename</ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => actions.deleteEntry(menuTarget.path, menuTarget.kind)}
                    >
                      Delete
                    </ContextMenuItem>
                  </ContextMenuGroup>
                </>
              )}
              <ContextMenuSeparator />
              <ContextMenuGroup>
                <ContextMenuItem onClick={() => actions.revealEntry(menuTarget.path)}>
                  {menuTarget.kind === "file" ? "Open file location" : "Open folder location"}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => actions.copyPath(menuTarget.path)}>
                  Copy path
                </ContextMenuItem>
                <ContextMenuItem onClick={() => copyRelativePath(menuTarget.path)}>
                  Copy relative path
                </ContextMenuItem>
              </ContextMenuGroup>
            </ContextMenuContent>
          </ContextMenu>
        ) : (
          rowsContent
        )}
      </CardContent>
    </Card>
  );
}

const getArticleCountLabel = (articleCount: number) =>
  articleCount === 1 ? "1 article" : `${articleCount} articles`;

const getMenuLabel = (target: ArticleNavigatorMenuTarget) =>
  target.kind === "file"
    ? "File actions"
    : target.kind === "directory"
      ? "Folder actions"
      : "Folder context actions";

function EmptyFolderMessage({ message }: { message: string }) {
  return <p className="shrink-0 py-2 text-xs leading-5 text-muted-foreground">{message}</p>;
}
function DetachedDocumentNotice() {
  return (
    <NavigatorNotice icon={InfoIcon}>
      Current document is outside this folder context.
    </NavigatorNotice>
  );
}

interface FolderScanWarningNoticeProps {
  warningCount: number;
}

function FolderScanWarningNotice({ warningCount }: FolderScanWarningNoticeProps) {
  return (
    <NavigatorNotice icon={TriangleAlertIcon}>
      Some folder entries could not be scanned. {getScanWarningIssueText(warningCount)}
    </NavigatorNotice>
  );
}

function NavigatorNotice({ children, icon: Icon }: { children: ReactNode; icon: LucideIcon }) {
  return (
    <div className="shrink-0 px-3 py-2 text-xs leading-5 text-muted-foreground">
      <div className="flex gap-2 rounded-md border border-border bg-card/65 px-2 py-1.5">
        <Icon className="mt-0.5 size-3.5 shrink-0" />
        <span>{children}</span>
      </div>
    </div>
  );
}

const getScanWarningIssueText = (warningCount: number) =>
  warningCount === 1 ? "1 issue found." : `${warningCount} issues found.`;

interface ArticleNavigatorRowsProps {
  edit: ArticleNavigatorEdit | null;
  onCancelEdit: () => void;
  onCommitEdit: (name: string) => Promise<ArticleNavigatorEntryActionResult>;
  onFinishEdit: (result: ArticleNavigatorEntryActionResult) => void;
  onOpenArticle: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  rows: ArticleNavigatorRow[];
}

interface ArticleNavigatorFocus {
  path: string | null;
  requestId: number;
}

function ArticleNavigatorRows({
  edit,
  onCancelEdit,
  onCommitEdit,
  onFinishEdit,
  onOpenArticle,
  onToggleDirectory,
  rows,
}: ArticleNavigatorRowsProps) {
  const virtualListRef = useRef<VirtualListHandle>(null);
  const revealPath = useArticleNavigatorStore((state) => state.revealPath);
  const revealRequestId = useArticleNavigatorStore((state) => state.revealRequestId);
  const focusRequestPath = useArticleNavigatorStore((state) => state.focusPath);
  const focusRequestId = useArticleNavigatorStore((state) => state.focusRequestId);
  const [focus, setFocus] = useState<ArticleNavigatorFocus>({ path: null, requestId: 0 });
  const rowElementsRef = useRef(new Map<string, HTMLLIElement>());
  const hasRowFocusRef = useRef(false);
  const typeaheadRef = useRef({ buffer: "", lastKeyAtMs: 0 });
  // React Compiler leaves this unmemoized, which would rebuild it, at one path key per row, on
  // every focus change.
  const rowIndexes = useMemo(() => getArticleNavigatorRowIndexes(rows), [rows]);
  const focusedIndex = getArticleNavigatorFocusedIndex({
    focusedPath: focus.path,
    rowIndexes,
    rows,
  });
  const focusedRowPath = rows[focusedIndex]?.path;
  const handledRevealRequestIdRef = useRef(0);
  const handledFocusRequestIdRef = useRef(0);
  const revealRowIndex = getRowIndex(rowIndexes, revealPath);
  const revealRowPath = revealRowIndex < 0 ? null : rows[revealRowIndex].path;
  const focusRequestRowIndex = getRowIndex(rowIndexes, focusRequestPath);
  const editRowIndex = rows.findIndex((row) =>
    edit?.kind === "rename" ? isSamePath(row.path, edit.path) : row.kind === "draft",
  );

  // A requested row may sit outside the rendered window, so it is pinned first and
  // focused once that render commits.
  useEffect(() => {
    if (focus.requestId === 0 || focus.path === null) {
      return;
    }

    const rowElement = rowElementsRef.current.get(focus.path);

    // Focus that arrives from a row's name editor bubbles here too, and must stay in the editor.
    if (rowElement && !rowElement.contains(document.activeElement)) {
      rowElement.focus();
    }
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

  // A created or renamed entry only appears once the folder refresh lands, so the request
  // waits for its row.
  useEffect(() => {
    if (focusRequestId === handledFocusRequestIdRef.current || focusRequestRowIndex < 0) {
      return;
    }

    const path = rows[focusRequestRowIndex].path;

    handledFocusRequestIdRef.current = focusRequestId;
    virtualListRef.current?.scrollToIndex(focusRequestRowIndex, { align: "auto" });
    // A mounted row takes focus now: the name editor that just closed left focus on the body,
    // and the fallback below would otherwise hand the tab stop to another row first.
    rowElementsRef.current.get(path)?.focus();
    setFocus((currentFocus) => ({ path, requestId: currentFocus.requestId + 1 }));
  }, [focusRequestId, focusRequestRowIndex, rows]);

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

    if (!row || index === editRowIndex) {
      return;
    }

    if (row.kind === "directory") {
      onToggleDirectory(row.path);
    } else if (row.kind === "file") {
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
    if (isContextMenuKey(event)) {
      // Also suppresses the native contextmenu event the key would produce, which would open
      // the menu a second time at the pointer's position.
      event.preventDefault();
      openRowContextMenu(
        event.target instanceof Element
          ? (event.target.closest<HTMLElement>('[role="treeitem"]') ?? undefined)
          : undefined,
      );

      return;
    }

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
      pinnedIndexes={[focusedIndex, revealRowIndex, editRowIndex]}
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
              nameEditor={
                index === editRowIndex && edit ? (
                  <EntryNameEditor
                    entryKind={edit.entryKind}
                    initialName={edit.kind === "rename" ? edit.name : ""}
                    onCancel={onCancelEdit}
                    onCommit={onCommitEdit}
                    onFinish={onFinishEdit}
                  />
                ) : null
              }
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

const getRowIndex = (rowIndexes: PathMap<number>, path: string | null) =>
  path === null ? -1 : (rowIndexes.get(path) ?? -1);

const isContextMenuKey = (event: KeyboardEvent) =>
  event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);

// The context menu opens from a contextmenu event, so the keyboard route raises one on the row
// with coordinates that place the menu just below it.
const openRowContextMenu = (rowElement: HTMLElement | undefined) => {
  if (!rowElement) {
    return;
  }

  const { bottom, left } = rowElement.getBoundingClientRect();

  rowElement.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      cancelable: true,
      clientX: left + ROW_MENU_KEYBOARD_OFFSET_X,
      clientY: bottom,
    }),
  );
};

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
  nameEditor: ReactNode;
  onActivate: () => void;
  onFocus: () => void;
  registerElement: (element: HTMLLIElement | null) => void;
  row: ArticleNavigatorRow;
  virtualRow: VirtualItem;
}

function ArticleNavigatorTreeItem({
  isTabStop,
  nameEditor,
  onActivate,
  onFocus,
  registerElement,
  row,
  virtualRow,
}: ArticleNavigatorTreeItemProps) {
  const isFileRow = row.kind === "file" || (row.kind === "draft" && row.entryKind === "file");

  return (
    <VirtualListItem
      aria-expanded={row.kind === "directory" && row.hasChildren ? row.isExpanded : undefined}
      aria-label={row.kind === "draft" ? getDraftRowLabel(row.entryKind) : undefined}
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
      data-navigator-path={row.kind === "draft" ? undefined : row.path}
      onClick={nameEditor ? undefined : onActivate}
      onFocus={onFocus}
      ref={registerElement}
      role="treeitem"
      style={{ paddingLeft: `${row.depth * 14 + (isFileRow ? 23 : 6)}px` }}
      tabIndex={isTabStop ? 0 : -1}
      title={row.kind === "draft" ? undefined : row.path}
      virtualRow={virtualRow}
    >
      {row.kind === "directory" ? (
        <DirectoryRowContent nameEditor={nameEditor} row={row} />
      ) : row.kind === "file" ? (
        <ArticleRowContent nameEditor={nameEditor} row={row} />
      ) : (
        <DraftRowContent entryKind={row.entryKind} nameEditor={nameEditor} />
      )}
    </VirtualListItem>
  );
}

const getDraftRowLabel = (entryKind: ArticleNavigatorEntryKind) =>
  entryKind === "file" ? "New file" : "New folder";

function DirectoryRowContent({
  nameEditor,
  row,
}: {
  nameEditor: ReactNode;
  row: ArticleNavigatorDirectoryRow;
}) {
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
      {nameEditor ?? <span className="min-w-0 truncate">{row.name}</span>}
    </>
  );
}

function ArticleRowContent({
  nameEditor,
  row,
}: {
  nameEditor: ReactNode;
  row: ArticleNavigatorFileRow;
}) {
  return (
    <>
      <FileTextIcon className="size-3.5 text-muted-foreground" />
      {nameEditor ?? <span className="min-w-0 truncate">{row.name}</span>}
    </>
  );
}

function DraftRowContent({
  entryKind,
  nameEditor,
}: {
  entryKind: ArticleNavigatorEntryKind;
  nameEditor: ReactNode;
}) {
  const Icon = entryKind === "file" ? FileTextIcon : FolderIcon;

  return (
    <>
      {entryKind === "directory" && <span className="size-3 shrink-0" />}
      <Icon className="size-3.5 text-muted-foreground" />
      {nameEditor}
    </>
  );
}

interface EntryNameEditorProps {
  entryKind: ArticleNavigatorEntryKind;
  initialName: string;
  onCancel: () => void;
  onCommit: (name: string) => Promise<ArticleNavigatorEntryActionResult>;
  onFinish: (result: ArticleNavigatorEntryActionResult) => void;
}

function EntryNameEditor({
  entryKind,
  initialName,
  onCancel,
  onCommit,
  onFinish,
}: EntryNameEditorProps) {
  const [name, setName] = useState(initialName);
  const [isPending, setIsPending] = useState(false);
  const isSettledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    const extensionIndex = entryKind === "file" ? initialName.lastIndexOf(".") : -1;

    input.focus();
    input.setSelectionRange(0, extensionIndex > 0 ? extensionIndex : initialName.length);
  }, [entryKind, initialName]);

  const settle = (result: ArticleNavigatorEntryActionResult) => {
    isSettledRef.current = true;
    onFinish(result);
  };

  const commit = async (source: "blur" | "enter") => {
    if (isPending || isSettledRef.current) {
      return;
    }

    const trimmedName = name.trim();

    if (!trimmedName || trimmedName === initialName) {
      isSettledRef.current = true;
      onCancel();
      return;
    }

    setIsPending(true);

    const result = await onCommit(trimmedName);

    if (result.outcome === "failed" && source === "enter") {
      setIsPending(false);
      inputRef.current?.focus();
      return;
    }

    settle(result);
  };

  return (
    <Input
      aria-label={entryKind === "file" ? "File name" : "Folder name"}
      className="h-6 flex-1 px-1.5 text-xs md:text-xs"
      onBlur={() => {
        // Switching to another window blurs the field too, but the edit is still in progress
        // and resumes when the window returns.
        if (document.hasFocus()) {
          void commit("blur");
        }
      }}
      onChange={(event) => setName(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();

        if (event.key === "Enter") {
          event.preventDefault();
          void commit("enter");
        } else if (event.key === "Escape") {
          event.preventDefault();

          if (!isPending && !isSettledRef.current) {
            isSettledRef.current = true;
            onCancel();
          }
        }
      }}
      readOnly={isPending}
      ref={inputRef}
      spellCheck={false}
      type="text"
      value={name}
    />
  );
}
