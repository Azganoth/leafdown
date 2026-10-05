import {
  CaseSensitiveIcon,
  ChevronRightIcon,
  ReplaceIcon,
  SearchIcon,
  TriangleAlertIcon,
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
import { isPrimaryModifierEvent } from "@/lib/input";
import { getRelativePath } from "@/lib/path";
import { cn } from "@/lib/utils";

import type { FolderReplaceApplyState, FolderReplaceReport } from "../services/folderReplaceReport";
import {
  hasCompleteReplacementPlan,
  type FolderSearchResults,
} from "../services/folderSearchEngine";
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
  onApply: () => void;
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
  onApply,
  onCancel,
  onClose,
  onSearchFurther,
  onSubmit,
}: FolderSearchPanelProps) {
  const localization = useLocalization();
  const { t } = localization;
  const panelRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  const resultRowsRef = useRef<FolderSearchResultRowsHandle>(null);
  const query = useFolderSearchStore((state) => state.query);
  const caseSensitive = useFolderSearchStore((state) => state.caseSensitive);
  const wholeWord = useFolderSearchStore((state) => state.wholeWord);
  const results = useFolderSearchStore((state) => state.results);
  const focusRequestId = useFolderSearchStore((state) => state.focusRequestId);
  const replaceOpen = useFolderSearchStore((state) => state.replaceOpen);
  const replacement = useFolderSearchStore((state) => state.replacement);
  const apply = useFolderSearchStore((state) => state.apply);
  const setQuery = useFolderSearchStore((state) => state.setQuery);
  const setCaseSensitive = useFolderSearchStore((state) => state.setCaseSensitive);
  const setWholeWord = useFolderSearchStore((state) => state.setWholeWord);
  const setReplaceOpen = useFolderSearchStore((state) => state.setReplaceOpen);
  const setReplacement = useFolderSearchStore((state) => state.setReplacement);
  const setApplyState = useFolderSearchStore((state) => state.setApplyState);
  const canApply =
    replaceOpen &&
    apply.status !== "applying" &&
    hasCompleteReplacementPlan(results, {
      query: { caseSensitive, text: query, wholeWord },
      replacement,
    });

  // Replace all leaves while it writes, so focus that went with it returns to the replacement.
  useEffect(() => {
    if (
      apply.status === "done" &&
      (document.activeElement === null || document.activeElement === document.body)
    ) {
      replacementRef.current?.focus();
    }
  }, [apply.status]);
  const title = t("folderSearch.title", { folder: folderName || folderPath });

  useEffect(() => {
    if (focusRequestId === 0) {
      return undefined;
    }

    const focusQuery = () => {
      // The field is the one this request named, read as it is handled rather than followed.
      const field =
        useFolderSearchStore.getState().focusTarget === "replacement"
          ? replacementRef.current
          : queryRef.current;

      field?.focus();
      field?.select();
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

  const handleReplacementKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(event) || event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (isPrimaryModifierEvent(event.nativeEvent) && event.altKey) {
      if (canApply) {
        onApply();
      }
    } else {
      onSubmit();
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
        <div className="flex shrink-0 items-start gap-0.5">
          <PanelButton
            aria-expanded={replaceOpen}
            className="mt-0.5 size-6"
            label={t(replaceOpen ? "folderSearch.hideReplace" : "folderSearch.showReplace")}
            onClick={() => setReplaceOpen(!replaceOpen)}
          >
            <ChevronRightIcon className={cn("transition-transform", replaceOpen && "rotate-90")} />
          </PanelButton>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
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
            {replaceOpen && (
              <InputGroup className="h-7 shrink-0">
                <InputGroupAddon align="inline-start">
                  <ReplaceIcon className="size-3.5" />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={t("folderSearch.replacement")}
                  autoComplete="off"
                  className="text-xs md:text-xs"
                  onChange={(event) => setReplacement(event.target.value)}
                  onKeyDown={handleReplacementKeyDown}
                  placeholder={t("folderSearch.replacementPlaceholder")}
                  ref={replacementRef}
                  spellCheck={false}
                  type="text"
                  value={replacement}
                />
              </InputGroup>
            )}
          </div>
        </div>

        <FolderSearchStatus
          apply={apply}
          canApply={canApply}
          localization={localization}
          onApply={onApply}
          onCancel={onCancel}
          onSearchFurther={onSearchFurther}
          query={query}
          replaceOpen={replaceOpen}
          results={results}
        />

        {apply.status === "done" && (
          <FolderReplaceReportView
            folderPath={folderPath}
            onDismiss={() => setApplyState({ status: "idle" })}
            report={apply.report}
          />
        )}

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
  apply: FolderReplaceApplyState;
  canApply: boolean;
  localization: Localization;
  onApply: () => void;
  onCancel: () => void;
  onSearchFurther: () => void;
  query: string;
  replaceOpen: boolean;
  results: FolderSearchResults | null;
}

const describeResults = ({ formatNumber, t }: Localization, results: FolderSearchResults) => {
  const replacing = results.replacement !== null;
  const summary = replacing
    ? t("folderSearch.replaceSummary", {
        files: results.files.length,
        matches: results.matchCount,
      })
    : t("folderSearch.summary", {
        files: results.files.length,
        matches: results.matchCount,
      });
  const noResults = t(replacing ? "folderSearch.nothingToReplace" : "folderSearch.noResults");

  switch (results.status) {
    case "searching":
      return {
        text: replacing
          ? t("folderSearch.planning", {
              searched: formatNumber(results.searchedFileCount),
              total: results.articleCount,
            })
          : t("folderSearch.searching", {
              searched: formatNumber(results.searchedFileCount),
              total: results.articleCount,
            }),
        detail: results.matchCount > 0 ? summary : null,
        announcement: t(
          replacing ? "folderSearch.planningAnnouncement" : "folderSearch.searchingAnnouncement",
        ),
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
        ? { text: noResults, detail: null, announcement: noResults }
        : { text: summary, detail: null, announcement: summary };
  }
};

function FolderSearchStatus({
  apply,
  canApply,
  localization,
  onApply,
  onCancel,
  onSearchFurther,
  query,
  replaceOpen,
  results,
}: FolderSearchStatusProps) {
  const { formatNumber, t } = localization;

  if (apply.status === "applying") {
    return (
      <div className="shrink-0 px-1 text-xs leading-5 text-muted-foreground">
        <p data-testid="folder-search-status">
          {t("folderSearch.applying", {
            phase: apply.phase,
            completed: formatNumber(apply.completed),
            total: apply.total,
          })}
        </p>
        <p aria-live="polite" className="sr-only" role="status">
          {t("folderSearch.applyingAnnouncement")}
        </p>
      </div>
    );
  }

  if (query === "" || !results) {
    return (
      <p className="shrink-0 px-1 text-xs leading-5 text-muted-foreground">
        {t(replaceOpen ? "folderSearch.replaceHint" : "folderSearch.hint")}
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
      {/* Kept in place while a plan is made again, so focus is not lost with it. */}
      {replaceOpen &&
        results.replacement !== null &&
        (canApply || results.status === "searching") && (
          <Button
            aria-disabled={canApply ? undefined : true}
            className="h-5 px-1.5 text-xs aria-disabled:opacity-50"
            onClick={() => {
              if (canApply) {
                onApply();
              }
            }}
            size="xs"
            type="button"
          >
            {t("folderSearch.replaceAll")}
          </Button>
        )}
    </div>
  );
}

function FolderReplaceReportView({
  folderPath,
  onDismiss,
  report,
}: {
  folderPath: string;
  onDismiss: () => void;
  report: FolderReplaceReport;
}) {
  const { t } = useLocalization();
  const displayPath = (path: string) => getRelativePath(folderPath, path) ?? path;
  const summary = t("folderSearch.report.written", {
    files: report.written.length,
    matches: report.written.reduce((count, { matchCount }) => count + matchCount, 0),
  });

  return (
    <div
      className="flex shrink-0 items-start gap-2 rounded-md bg-muted/60 px-2 py-1 text-xs leading-5"
      data-testid="folder-replace-report"
    >
      <div className="min-w-0 flex-1">
        <p aria-live="polite" role="status">
          {summary}
        </p>
        {report.stale.length > 0 && (
          <ReportList
            items={report.stale.map(({ path, reason, unsavedInEditor }) => ({
              path,
              text: t("folderSearch.report.staleFile", {
                path: displayPath(path),
                reason,
                unsaved: unsavedInEditor ? "yes" : "no",
              }),
            }))}
            label={t("folderSearch.report.stale", { count: report.stale.length })}
            testId="folder-replace-stale"
          />
        )}
        {report.failed.length > 0 && (
          <ReportList
            items={report.failed.map(({ detail, encoding, path, reason, unsavedInEditor }) => ({
              path,
              text: t("folderSearch.report.failedFile", {
                path: displayPath(path),
                reason,
                encoding: encoding ?? "",
                detail: detail ?? "",
                unsaved: unsavedInEditor ? "yes" : "no",
              }),
              title: detail,
            }))}
            label={t("folderSearch.report.failed", { count: report.failed.length })}
            testId="folder-replace-failed"
          />
        )}
        {report.notAttempted.length > 0 && (
          <ReportList
            items={report.notAttempted.map((path) => ({ path, text: displayPath(path) }))}
            label={t("folderSearch.report.notAttempted", { count: report.notAttempted.length })}
            testId="folder-replace-not-attempted"
          />
        )}
      </div>
      <PanelButton label={t("folderSearch.report.dismiss")} onClick={onDismiss}>
        <XIcon />
      </PanelButton>
    </div>
  );
}

function ReportList({
  items,
  label,
  testId,
}: {
  items: { path: string; text: string; title?: string }[];
  label: string;
  testId: string;
}) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="group flex items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground">
        <ChevronRightIcon className="size-3 transition-transform group-data-panel-open:rotate-90" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul
          className="mt-1 max-h-32 overflow-y-auto pl-4 text-muted-foreground"
          data-testid={testId}
        >
          {items.map(({ path, text, title }) => (
            <li className="truncate" key={path} title={title ?? path}>
              {text}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
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
              replacement={results.replacement}
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
  replacement: string | null;
  row: FolderSearchRow;
  virtualRow: VirtualItem;
}

function FolderSearchTreeItem({
  isTabStop,
  onActivate,
  onFocus,
  registerElement,
  replacement,
  row,
  virtualRow,
}: FolderSearchTreeItemProps) {
  const { formatNumber, t } = useLocalization();
  const isFile = row.kind === "file";

  return (
    <VirtualListItem
      aria-disabled={row.kind === "match" && row.unavailable ? true : undefined}
      aria-label={
        isFile
          ? t(replacement === null ? "folderSearch.fileLabel" : "folderSearch.replaceFileLabel", {
              count: row.matchCount,
              path: row.relativePath,
            })
          : replacement === null
            ? undefined
            : getReplacementLabel(t, row, replacement)
      }
      aria-expanded={isFile ? row.expanded : undefined}
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
        <MatchRowContent replacement={replacement} row={row} />
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
      {row.rewritesOtherText && <RewritesOtherTextMarker />}
      <Badge className="ml-auto shrink-0 tabular-nums" variant="secondary">
        {formatCount(row.matchCount)}
        {row.clipped && "+"}
      </Badge>
    </>
  );
}

const getReplacementLabel = (
  t: Localization["t"],
  row: FolderSearchMatchRow,
  replacement: string,
) => {
  const { after, before, match } = getMatchSnippet(row.match.context);

  return t("folderSearch.replaceMatchLabel", {
    text: `${before}${match}${after}`,
    match,
    replacement,
    removed: replacement === "" ? "yes" : "no",
  });
};

function RewritesOtherTextMarker() {
  const { t } = useLocalization();
  const label = t("folderSearch.rewritesOtherText");

  return (
    <span
      aria-label={label}
      className="flex shrink-0 text-muted-foreground"
      data-testid="folder-search-rewrites-other-text"
      role="img"
      title={label}
    >
      <TriangleAlertIcon aria-hidden="true" className="size-3" />
    </span>
  );
}

function MatchRowContent({
  replacement,
  row,
}: {
  replacement: string | null;
  row: FolderSearchMatchRow;
}) {
  const snippet = getMatchSnippet(row.match.context);
  const highlight =
    "rounded-[0.125rem] bg-[oklch(0.88_0.12_90)] text-inherit dark:bg-[oklch(0.5_0.09_90)]";

  return (
    <span className="min-w-0 truncate whitespace-pre">
      {snippet.clippedBefore && "…"}
      {snippet.before}
      {replacement === null ? (
        <mark className={highlight}>{snippet.match}</mark>
      ) : (
        <>
          <del className="rounded-[0.125rem] bg-destructive/15 text-muted-foreground">
            {snippet.match}
          </del>
          {replacement !== "" && (
            <ins className="rounded-[0.125rem] bg-[oklch(0.9_0.1_150)] no-underline dark:bg-[oklch(0.45_0.08_150)]">
              {replacement}
            </ins>
          )}
        </>
      )}
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
