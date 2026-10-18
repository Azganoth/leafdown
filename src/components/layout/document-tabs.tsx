import { Tabs } from "@base-ui/react/tabs";
import { PlusIcon, XIcon } from "lucide-react";
import { useLayoutEffect, useRef, type MouseEvent } from "react";

import { DocumentScreen } from "@/components/screens/document-screen";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getArticlePaths } from "@/features/folder-context";
import {
  activateDocumentTab,
  closeDocumentTab,
  getDocumentName,
  keepDocumentTab,
  useSessionStore,
  type DocumentTab,
} from "@/features/session";
import { handleUnexpectedError } from "@/lib/errors";
import { useLocalization, type Translate } from "@/lib/i18n";
import { getPathParts } from "@/lib/path";
import { cn } from "@/lib/utils";

interface DocumentTabsProps {
  newDocumentLabel: string;
  onNewDocument: () => void;
}

interface TabLabel {
  name: string;
  /** The parent folder's name, shown only while another tab has the same name. */
  folder: string | null;
}

const MIDDLE_MOUSE_BUTTON = 1;

const getTabLabels = (tabs: readonly DocumentTab[], t: Translate): TabLabel[] => {
  const names = tabs.map((tab) => getDocumentName(tab.document, t));
  const nameCounts = new Map<string, number>();

  for (const name of names) {
    const key = name.toLocaleLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  return tabs.map(({ document }, index) => {
    const name = names[index];
    const isShared = (nameCounts.get(name.toLocaleLowerCase()) ?? 0) > 1;

    return {
      name,
      folder:
        isShared && document.status === "saved"
          ? getPathParts(getPathParts(document.path).parent).name || null
          : null,
    };
  });
};

// The close mark is for the pointer; keyboard users close the active tab with `Close document`.
const handleClosePress = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const closeTab = (tabId: string) => {
  void closeDocumentTab(tabId).catch((error) => handleUnexpectedError(error, "closeDocumentTab"));
};

/** The open documents of the window: a strip of tabs above the active document's editor. */
export function DocumentTabs({ newDocumentLabel, onNewDocument }: DocumentTabsProps) {
  const { t } = useLocalization();
  const tabs = useSessionStore((state) => state.tabs);
  const activeTabId = useSessionStore((state) => state.activeTabId);
  const folderContext = useSessionStore((state) => state.folderContext);
  const wikiCompletionPaths = folderContext ? getArticlePaths(folderContext.tree) : [];
  const listRef = useRef<HTMLDivElement>(null);
  const labels = getTabLabels(tabs, t);

  useLayoutEffect(() => {
    const activeTab = listRef.current?.querySelector<HTMLElement>("[data-active]");

    activeTab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  return (
    <Tabs.Root
      className="flex size-full min-h-0 flex-col"
      onValueChange={(tabId: string) => activateDocumentTab(tabId)}
      value={activeTabId}
    >
      <div className="flex h-9 shrink-0 items-center gap-1.5 pb-1">
        <Tabs.List
          aria-label={t("shell.documentTabs")}
          className="flex h-full min-w-0 [scrollbar-width:none] items-stretch gap-1.5 overflow-x-auto"
          data-testid="document-tab-list"
          onWheel={(event) => {
            if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
              event.currentTarget.scrollLeft += event.deltaY;
            }
          }}
          ref={listRef}
        >
          {tabs.map((tab, index) => (
            <DocumentTabItem
              key={tab.id}
              label={labels[index]}
              onClose={() => closeTab(tab.id)}
              tab={tab}
            />
          ))}
        </Tabs.List>
        <Button
          aria-label={newDocumentLabel}
          className="size-7 shrink-0 text-muted-foreground"
          onClick={onNewDocument}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <PlusIcon className="size-4" data-icon="inline-start" />
        </Button>
      </div>
      {tabs.map((tab) => (
        <Tabs.Panel
          className="min-h-0 flex-1 outline-none"
          data-testid="document-tab-panel"
          key={tab.id}
          keepMounted
          value={tab.id}
        >
          <DocumentScreen
            active={tab.id === activeTabId}
            tab={tab}
            wikiCompletionPaths={wikiCompletionPaths}
          />
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

interface DocumentTabItemProps {
  label: TabLabel;
  onClose: () => void;
  tab: DocumentTab;
}

function DocumentTabItem({ label, onClose, tab }: DocumentTabItemProps) {
  const { t } = useLocalization();
  const { document } = tab;

  return (
    <Tooltip>
      <TooltipTrigger
        disabled={document.status !== "saved"}
        render={
          <Tabs.Tab
            aria-label={t("shell.documentTabs.tab", {
              name: label.name,
              folder: label.folder ?? "none",
              unsaved: document.isDirty ? "true" : "false",
              preview: tab.preview ? "true" : "false",
            })}
            className={cn(
              "group/tab active-item-marker flex max-w-64 min-w-28 shrink items-center gap-1.5 rounded-md py-0 pr-1 pl-3 text-[0.8125rem]/5 text-muted-foreground outline-none select-none",
              "hover:bg-muted/70 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
              tab.preview && "italic",
            )}
            data-preview={tab.preview || undefined}
            data-testid="document-tab"
            onAuxClick={(event) => {
              if (event.button === MIDDLE_MOUSE_BUTTON) {
                event.preventDefault();
                onClose();
              }
            }}
            onDoubleClick={() => keepDocumentTab(tab.id)}
            onMouseDown={(event) => {
              // A middle press would otherwise start the webview's autoscroll.
              if (event.button === MIDDLE_MOUSE_BUTTON) {
                event.preventDefault();
              }
            }}
            value={tab.id}
          />
        }
      >
        {/* Only the hidden medium-weight copy sizes the tab, so activating it moves no tab. */}
        <span
          className="relative min-w-0 flex-1 overflow-hidden whitespace-nowrap after:invisible after:font-medium after:content-[attr(data-label)]"
          data-label={label.folder ? `${label.name} ${label.folder}` : label.name}
        >
          <span className="absolute inset-0 truncate">
            {label.name}
            {label.folder && <span className="text-muted-foreground"> {label.folder}</span>}
          </span>
        </span>
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          data-testid="document-tab-close"
          data-unsaved={document.isDirty || undefined}
          onClick={(event) => {
            handleClosePress(event);
            onClose();
          }}
          onMouseDown={handleClosePress}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {document.isDirty && (
            <span className="size-2 rounded-full bg-current group-hover/tab:hidden" />
          )}
          <XIcon
            className={cn(
              "size-4",
              document.isDirty
                ? "hidden group-hover/tab:block"
                : "invisible group-hover/tab:visible group-data-active/tab:visible",
            )}
          />
        </span>
      </TooltipTrigger>
      {document.status === "saved" && (
        <TooltipContent side="bottom">{document.path}</TooltipContent>
      )}
    </Tooltip>
  );
}
