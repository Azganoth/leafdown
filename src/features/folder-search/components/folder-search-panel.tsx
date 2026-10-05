import {
  CaseSensitiveIcon,
  ChevronRightIcon,
  SearchIcon,
  WholeWordIcon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  VirtualList,
  VirtualListContent,
  VirtualListItem,
  VirtualListItems,
  type VirtualItem,
  type VirtualListHandle,
} from "@/components/ui/virtual-list";
import { useLocalization, type Localization } from "@/lib/i18n";
import { getRelativePath } from "@/lib/path";
import { cn } from "@/lib/utils";

import type { FolderSearchResults } from "../services/folderSearchEngine";
import { useFolderSearchStore, type FolderSearchMatchKey } from "../stores/folderSearch";
import {
  getFolderSearchRows,
  getFolderSearchTraversalAction,
  getMatchSnippet,
  isFolderSearchTraversalKey,
  type FolderSearchFileRow,
  type FolderSearchMatchRow,
  type FolderSearchRow,
} from "../utils/folderSearchRows";

const ROW_HEIGHT = 26;
const SKIPPED_FILES_SHOWN = 100;

export interface FolderSearchPanelProps {
  folderName: string;
  folderPath: string;
  onActivateMatch: (match: FolderSearchMatchKey) => void;
  onCancel: () => void;
  onClose: () => void;
  onSearchFurther: () => void;
  onSubmit: () => void;
}

const isComposing = (event: KeyboardEvent) => event.nativeEvent.isComposing;

export function FolderSearchPanel({
  folderName,
  folderPath,
  onActivateMatch,
  onCancel,
  onClose,
  onSearchFurther,
  onSubmit,
}: FolderSearchPanelProps) {
  const localization = useLocalization();
  const { t } = localization;
  const panelRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const resultRowsRef = useRef<FolderSearchResultRowsHandle>(null);
  const query = useFolderSearchStore((state) => state.query);
  const caseSensitive = useFolderSearchStore((state) => state.caseSensitive);
  const wholeWord = useFolderSearchStore((state) => state.wholeWord);
  const results = useFolderSearchStore((state) => state.results);
  const focusRequestId = useFolderSearchStore((state) => state.focusRequestId);
  const setQuery = useFolderSearchStore((state) => state.setQuery);
  const setCaseSensitive = useFolderSearchStore((state) => state.setCaseSensitive);
  const setWholeWord = useFolderSearchStore((state) => state.setWholeWord);
  const title = t("folderSearch.title", { folder: folderName || folderPath });

  useEffect(() => {
    if (focusRequestId === 0) {
      return undefined;
    }

    const focusQuery = () => {
      queryRef.current?.focus();
      queryRef.current?.select();
    };

    focusQuery();

    // A menu that ran the command hands focus back to its trigger as it closes, after this effect.
    const frame = window.requestAnimationFrame(() => {
      if (!panelRef.current?.contains(document.activeElement)) {
        focusQuery();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestId]);

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !isComposing(event) && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  };

  const handleQueryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(event)) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    } else if (event.key === "ArrowDown" && results && results.files.length > 0) {
      event.preventDefault();
      resultRowsRef.current?.focusFirstRow();
    }
  };

  return (
    <Card
      aria-label={title}
      className="min-h-0 min-w-0 flex-1"
      data-testid="folder-search-panel"
      onKeyDown={handlePanelKeyDown}
      ref={panelRef}
      role="search"
      size="sm"
    >
      <CardHeader className="shrink-0">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate" title={folderPath}>
            {title}
          </span>
          <PanelButton label={t("folderSearch.close")} onClick={onClose}>
            <XIcon />
          </PanelButton>
        </CardTitle>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 gap-2">
        <InputGroup className="h-7 shrink-0">
          <InputGroupAddon align="inline-start">
            <SearchIcon className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t("folderSearch.query")}
            autoComplete="off"
            className="text-xs md:text-xs"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleQueryKeyDown}
            placeholder={t("folderSearch.placeholder")}
            ref={queryRef}
            spellCheck={false}
            type="text"
            value={query}
          />
          <InputGroupAddon align="inline-end" className="gap-0.5">
            <PanelToggle
              label={t("folderSearch.matchCase")}
              onPressedChange={setCaseSensitive}
              pressed={caseSensitive}
            >
              <CaseSensitiveIcon />
            </PanelToggle>
            <PanelToggle
              label={t("folderSearch.wholeWord")}
              onPressedChange={setWholeWord}
              pressed={wholeWord}
            >
              <WholeWordIcon />
            </PanelToggle>
          </InputGroupAddon>
        </InputGroup>

        <FolderSearchStatus
          localization={localization}
          onCancel={onCancel}
          onSearchFurther={onSearchFurther}
          query={query}
          results={results}
        />

        {results && results.skipped.length > 0 && (
          <SkippedFiles folderPath={folderPath} results={results} />
        )}

        {results && results.files.length > 0 && (
          <FolderSearchResultRows
            onActivateMatch={onActivateMatch}
            ref={resultRowsRef}
            results={results}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface FolderSearchStatusProps {
  localization: Localization;
  onCancel: () => void;
  onSearchFurther: () => void;
  query: string;
  results: FolderSearchResults | null;
}

const describeResults = ({ formatNumber, t }: Localization, results: FolderSearchResults) => {
  const summary = t("folderSearch.summary", {
    files: results.files.length,
    matches: results.matchCount,
  });

  switch (results.status) {
    case "searching":
      return {
        text: t("folderSearch.searching", {
          searched: formatNumber(results.searchedFileCount),
          total: results.articleCount,
        }),
        detail: results.matchCount > 0 ? summary : null,
        announcement: t("folderSearch.searchingAnnouncement"),
      };
    case "cancelled":
      return {
        text: t("folderSearch.cancelled"),
        detail: summary,
        announcement: `${t("folderSearch.cancelled")} ${summary}`,
      };
    case "limited":
      return {
        text: t("folderSearch.limited", { matches: results.matchCount }),
        detail: summary,
        announcement: t("folderSearch.limited", { matches: results.matchCount }),
      };
    case "completed":
      return results.matchCount === 0
        ? {
            text: t("folderSearch.noResults"),
            detail: null,
            announcement: t("folderSearch.noResults"),
          }
        : { text: summary, detail: null, announcement: summary };
  }
};

function FolderSearchStatus({
  localization,
  onCancel,
  onSearchFurther,
  query,
  results,
}: FolderSearchStatusProps) {
  const { t } = localization;

  if (query === "" || !results) {
    return (
      <p className="shrink-0 px-1 text-xs leading-5 text-muted-foreground">
        {t("folderSearch.hint")}
      </p>
    );
  }

  const { announcement, detail, text } = describeResults(localization, results);

  return (
    <div className="flex shrink-0 items-start gap-2 px-1 text-xs leading-5 text-muted-foreground">
      <div className="min-w-0 flex-1">
        <p data-testid="folder-search-status">{text}</p>
        {detail && <p>{detail}</p>}
        {/* Progress changes the visible text continually; only the outcome is announced. */}
        <p aria-live="polite" className="sr-only" role="status">
          {announcement}
        </p>
      </div>
      {results.status === "searching" && (
        <Button
          className="h-5 px-1.5 text-xs"
          onClick={onCancel}
          size="xs"
          type="button"
          variant="ghost"
        >
          {t("folderSearch.cancel")}
        </Button>
      )}
      {results.status === "limited" && (
        <Button
          className="h-5 px-1.5 text-xs"
          onClick={onSearchFurther}
          size="xs"
          type="button"
          variant="ghost"
        >
          {t("folderSearch.searchFurther")}
        </Button>
      )}
    </div>
  );
}

function SkippedFiles({
  folderPath,
  results,
}: {
  folderPath: string;
  results: FolderSearchResults;
}) {
  const { t } = useLocalization();
  const shown = results.skipped.slice(0, SKIPPED_FILES_SHOWN);
  const hiddenCount = results.skipped.length - shown.length;

  return (
    <Collapsible className="shrink-0 px-1 text-xs leading-5 text-muted-foreground">
      <CollapsibleTrigger className="group flex items-center gap-1 rounded-sm hover:text-foreground">
        <ChevronRightIcon className="size-3 transition-transform group-data-panel-open:rotate-90" />
        {t("folderSearch.skipped", { count: results.skipped.length })}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 max-h-32 overflow-y-auto pl-4" data-testid="folder-search-skipped">
          {shown.map(({ path, reason }) => (
            <li className="truncate" key={path} title={path}>
              {t("folderSearch.skippedFile", {
                path: getRelativePath(folderPath, path) ?? path,
                reason,
              })}
            </li>
          ))}
          {hiddenCount > 0 && <li>{t("folderSearch.skippedMore", { count: hiddenCount })}</li>}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface FolderSearchResultRowsHandle {
  focusFirstRow: () => void;
}

interface FolderSearchResultRowsProps {
  onActivateMatch: (match: FolderSearchMatchKey) => void;
  ref?: Ref<FolderSearchResultRowsHandle>;
  results: FolderSearchResults;
}

function FolderSearchResultRows({ onActivateMatch, ref, results }: FolderSearchResultRowsProps) {
  const { t } = useLocalization();
  const collapsedPaths = useFolderSearchStore((state) => state.collapsedPaths);
  const unavailableMatches = useFolderSearchStore((state) => state.unavailableMatches);
  const chosenMatch = useFolderSearchStore((state) => state.chosenMatch);
  const toggleFileCollapsed = useFolderSearchStore((state) => state.toggleFileCollapsed);
  const virtualListRef = useRef<VirtualListHandle>(null);
  const rowElementsRef = useRef(new Map<string, HTMLLIElement>());
  const hasRowFocusRef = useRef(false);
  // The index keeps the tab stop near where it was when results replace the focused row.
  const [focus, setFocus] = useState<{ index: number; key: string | null; requestId: number }>({
    index: 0,
    key: null,
    requestId: 0,
  });
  // React Compiler leaves this unmemoized, which would rebuild every row on each focus change.
  const rows = useMemo(
    () => getFolderSearchRows({ chosenMatch, collapsedPaths, results, unavailableMatches }),
    [chosenMatch, collapsedPaths, results, unavailableMatches],
  );
  const keyedIndex = focus.key === null ? -1 : rows.findIndex((row) => row.key === focus.key);
  const focusedIndex = keyedIndex === -1 ? Math.min(focus.index, rows.length - 1) : keyedIndex;
  const focusedKey = rows[focusedIndex]?.key;

  // A requested row may sit outside the rendered window, so it is pinned first and focused once
  // that render commits.
  useEffect(() => {
    if (focus.requestId === 0 || focus.key === null) {
      return;
    }

    rowElementsRef.current.get(focus.key)?.focus();
  }, [focus]);

  // Results arriving or being refreshed can replace the focused row, which leaves focus on the body.
  useEffect(() => {
    if (
      focusedKey === undefined ||
      !hasRowFocusRef.current ||
      document.activeElement !== document.body
    ) {
      return;
    }

    rowElementsRef.current.get(focusedKey)?.focus();
  }, [focusedKey]);

  const focusRow = (index: number) => {
    const key = rows[index]?.key;

    if (key === undefined) {
      return;
    }

    virtualListRef.current?.scrollToIndex(index, { align: "auto" });
    setFocus((current) => ({ index, key, requestId: current.requestId + 1 }));
  };

  useImperativeHandle(ref, () => ({ focusFirstRow: () => focusRow(0) }));

  const activateRow = (index: number) => {
    const row = rows[index];

    if (row?.kind === "match" && !row.unavailable) {
      onActivateMatch({ path: row.path, ordinal: row.match.ordinal });
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !isFolderSearchTraversalKey(event.key)) {
      return;
    }

    event.preventDefault();

    const action = getFolderSearchTraversalAction(rows, focusedIndex, event.key);

    switch (action?.type) {
      case "activateMatch":
        activateRow(action.index);
        break;
      case "focusRow":
        focusRow(action.index);
        break;
      case "toggleFile":
        toggleFileCollapsed(action.path);
        break;
    }
  };

  return (
    <VirtualList
      className="-mx-1 min-h-0 flex-1"
      estimateHeight={ROW_HEIGHT}
      getItemKey={(row) => row.key}
      items={rows}
      pinnedIndexes={[focusedIndex]}
      virtualListRef={virtualListRef}
    >
      <VirtualListContent
        aria-label={t("folderSearch.results")}
        className="mx-1"
        onBlur={() => {
          hasRowFocusRef.current = false;
        }}
        onKeyDown={handleKeyDown}
        role="tree"
      >
        <VirtualListItems<FolderSearchRow>>
          {(row, virtualRow, index) => (
            <FolderSearchTreeItem
              isTabStop={index === focusedIndex}
              key={row.key}
              onActivate={() => {
                focusRow(index);

                if (row.kind === "file") {
                  toggleFileCollapsed(row.path);
                } else {
                  activateRow(index);
                }
              }}
              onFocus={() => {
                hasRowFocusRef.current = true;
                setFocus((current) => ({ ...current, index, key: row.key }));
              }}
              registerElement={(element) => {
                if (element) {
                  rowElementsRef.current.set(row.key, element);
                } else {
                  rowElementsRef.current.delete(row.key);
                }
              }}
              row={row}
              virtualRow={virtualRow}
            />
          )}
        </VirtualListItems>
      </VirtualListContent>
    </VirtualList>
  );
}

interface FolderSearchTreeItemProps {
  isTabStop: boolean;
  onActivate: () => void;
  onFocus: () => void;
  registerElement: (element: HTMLLIElement | null) => void;
  row: FolderSearchRow;
  virtualRow: VirtualItem;
}

function FolderSearchTreeItem({
  isTabStop,
  onActivate,
  onFocus,
  registerElement,
  row,
  virtualRow,
}: FolderSearchTreeItemProps) {
  const { formatNumber, t } = useLocalization();
  const isFile = row.kind === "file";

  return (
    <VirtualListItem
      aria-disabled={row.kind === "match" && row.unavailable ? true : undefined}
      aria-expanded={isFile ? row.expanded : undefined}
      aria-label={
        isFile
          ? t("folderSearch.fileLabel", { count: row.matchCount, path: row.relativePath })
          : undefined
      }
      aria-level={isFile ? 1 : 2}
      aria-posinset={row.posInSet}
      aria-selected={row.kind === "match" && row.chosen}
      aria-setsize={row.setSize}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "h-[26px] w-full justify-start gap-1 rounded-md pr-2 text-xs font-normal hover:bg-muted/70 aria-expanded:bg-transparent aria-expanded:text-inherit dark:aria-expanded:bg-transparent",
        "aria-selected:bg-accent/80 aria-selected:text-foreground aria-selected:hover:bg-accent",
        "aria-disabled:text-muted-foreground aria-disabled:line-through aria-disabled:opacity-70",
      )}
      data-testid={isFile ? "folder-search-file" : "folder-search-match"}
      onClick={onActivate}
      onFocus={onFocus}
      ref={registerElement}
      role="treeitem"
      style={{ paddingLeft: isFile ? "6px" : "28px" }}
      tabIndex={isTabStop ? 0 : -1}
      title={
        isFile ? row.relativePath : row.unavailable ? t("folderSearch.unavailable") : undefined
      }
      virtualRow={virtualRow}
    >
      {isFile ? (
        <FileRowContent formatCount={formatNumber} row={row} />
      ) : (
        <MatchRowContent row={row} />
      )}
    </VirtualListItem>
  );
}

function FileRowContent({
  formatCount,
  row,
}: {
  formatCount: (value: number) => string;
  row: FolderSearchFileRow;
}) {
  return (
    <>
      <ChevronRightIcon
        className={cn(
          "size-3 shrink-0 text-muted-foreground transition-transform",
          row.expanded && "rotate-90",
        )}
      />
      <span className="min-w-0 truncate font-medium">{row.name}</span>
      {row.directory && (
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.directory}</span>
      )}
      <Badge className="ml-auto shrink-0 tabular-nums" variant="secondary">
        {formatCount(row.matchCount)}
        {row.clipped && "+"}
      </Badge>
    </>
  );
}

function MatchRowContent({ row }: { row: FolderSearchMatchRow }) {
  const snippet = getMatchSnippet(row.match.context);

  return (
    <span className="min-w-0 truncate whitespace-pre">
      {snippet.clippedBefore && "…"}
      {snippet.before}
      <mark className="rounded-[0.125rem] bg-[oklch(0.88_0.12_90)] text-inherit dark:bg-[oklch(0.5_0.09_90)]">
        {snippet.match}
      </mark>
      {snippet.after}
      {snippet.clippedAfter && "…"}
    </span>
  );
}

interface PanelControlProps {
  children: ReactNode;
  label: string;
}

function PanelButton({
  children,
  label,
  ...props
}: PanelControlProps & Omit<ComponentProps<typeof Button>, "children">) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="size-6"
            size="icon-sm"
            type="button"
            variant="ghost"
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function PanelToggle({
  children,
  label,
  ...props
}: PanelControlProps & Omit<ComponentProps<typeof Toggle>, "children">) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Toggle aria-label={label} className="size-6 min-w-6 px-0" size="sm" {...props} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
