import { FilePlusIcon, XIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { COMMAND_DEFINITIONS, getShortcutKeyLabels, type AppCommandId } from "@/commands";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getOpenMarkdownFileErrorMessage } from "@/features/document";
import {
  FileEntryIcon,
  FolderEntryIcon,
  getOpenFolderContextErrorMessage,
} from "@/features/folder-context";
import { useRecentItemsStore, type RecentItem } from "@/features/preferences";
import {
  createNewMarkdownDocument,
  notifyOpenMarkdownFileError,
  openFolderContextAtPath,
  openMarkdownFileAtPath,
  pickAndOpenFolderContext,
  pickAndOpenMarkdownFile,
} from "@/features/session";
import { notifyOperationFailure } from "@/lib/errors";
import { localizer, useLocalization, type MessageId } from "@/lib/i18n";
import { getPathParts } from "@/lib/path";
import { notifyError } from "@/lib/toast";
import { cn } from "@/lib/utils";

const NOW_REFRESH_INTERVAL_MS = 60 * 1000;

type RecentItemsKind = "files" | "folders";

const RECENT_ITEMS_MESSAGE_IDS = {
  files: {
    title: "welcome.recentFiles.title",
    empty: "welcome.recentFiles.empty",
    remove: "welcome.recentFiles.remove",
  },
  folders: {
    title: "welcome.recentFolders.title",
    empty: "welcome.recentFolders.empty",
    remove: "welcome.recentFolders.remove",
  },
} as const satisfies Record<RecentItemsKind, Record<string, MessageId>>;

const handleNewDocument = async () => {
  try {
    await createNewMarkdownDocument();
  } catch (error) {
    notifyOperationFailure(
      localizer.current.t("welcome.createDocumentFailed"),
      error,
      "createWelcomeDocument",
    );
  }
};

const handleOpenFile = async () => {
  try {
    await pickAndOpenMarkdownFile();
  } catch (error) {
    notifyOpenMarkdownFileError(error);
  }
};

const handleOpenFolder = async () => {
  try {
    await pickAndOpenFolderContext();
  } catch (error) {
    notifyError(getOpenFolderContextErrorMessage(error));
  }
};

const handleOpenRecentFile = async (path: string) => {
  try {
    await openMarkdownFileAtPath(path);
  } catch (error) {
    notifyOpenMarkdownFileError(
      error,
      getOpenMarkdownFileErrorMessage(error, {
        title: localizer.current.t("welcome.openRecentFileFailed"),
      }),
    );
  }
};

const handleOpenRecentFolder = async (path: string) => {
  try {
    await openFolderContextAtPath(path);
  } catch (error) {
    notifyError(
      getOpenFolderContextErrorMessage(error, {
        title: localizer.current.t("welcome.openRecentFolderFailed"),
      }),
    );
  }
};

export function WelcomeScreen() {
  const { t } = useLocalization();
  const recentFiles = useRecentItemsStore((state) => state.recentFiles);
  const recentFolders = useRecentItemsStore((state) => state.recentFolders);
  const clearRecentItems = useRecentItemsStore((state) => state.clearRecentItems);
  const removeRecentFile = useRecentItemsStore((state) => state.removeRecentFile);
  const removeRecentFolder = useRecentItemsStore((state) => state.removeRecentFolder);
  const hasRecentItems = recentFiles.length > 0 || recentFolders.length > 0;
  const now = useNow();

  return (
    <section
      aria-labelledby="welcome-title"
      className="@container flex min-h-full items-center justify-center px-8 py-10"
    >
      <div
        className={cn(
          "grid w-full gap-x-16 gap-y-12",
          hasRecentItems ? "max-w-5xl @3xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]" : "max-w-xs",
        )}
      >
        <div>
          <img src="/app-icon.svg" alt="" className="size-16" />
          <h2
            id="welcome-title"
            className="mt-5 font-heading text-3xl font-semibold tracking-tight"
          >
            Leafdown
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("welcome.description")}</p>

          <div className="mt-8 flex flex-col gap-1">
            <WelcomeAction
              commandId="file.new"
              icon={<FilePlusIcon />}
              label={t("welcome.newDocument")}
              onClick={handleNewDocument}
              primary
            />
            <WelcomeAction
              commandId="file.open"
              icon={<FileEntryIcon kind="article" />}
              label={t("welcome.openFile")}
              onClick={handleOpenFile}
            />
            <WelcomeAction
              commandId="file.openFolder"
              icon={<FolderEntryIcon open />}
              label={t("welcome.openFolder")}
              onClick={handleOpenFolder}
            />
          </div>
        </div>

        {hasRecentItems && (
          <div className="flex min-w-0 flex-col gap-6">
            <RecentItemsSection
              kind="files"
              titleId="recent-files-title"
              items={recentFiles}
              now={now}
              onOpenItem={handleOpenRecentFile}
              onRemoveItem={removeRecentFile}
            />
            <RecentItemsSection
              kind="folders"
              titleId="recent-folders-title"
              items={recentFolders}
              now={now}
              onOpenItem={handleOpenRecentFolder}
              onRemoveItem={removeRecentFolder}
            />
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={clearRecentItems}
              className="-mt-2 -mr-1 self-end text-muted-foreground"
            >
              <XIcon data-icon="inline-start" />
              {t("welcome.clearRecentItems")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

// A minimized window may throttle or suspend the interval, so returning to it refreshes too.
function useNow() {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const intervalId = window.setInterval(refresh, NOW_REFRESH_INTERVAL_MS);

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return now;
}

interface WelcomeActionProps {
  commandId: AppCommandId;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}

function WelcomeAction({ commandId, icon, label, onClick, primary }: WelcomeActionProps) {
  const shortcut = COMMAND_DEFINITIONS[commandId].shortcuts?.[0];

  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      onClick={onClick}
      className="h-11 justify-start gap-3 px-2"
    >
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-md",
          primary ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {icon}
      </span>
      {label}
      {shortcut && (
        <span aria-hidden="true" className="ml-auto flex gap-0.5">
          {getShortcutKeyLabels(shortcut).map((keyLabel) => (
            <kbd
              key={keyLabel}
              className="rounded border border-border bg-muted px-1.5 py-px font-sans text-[0.6875rem] leading-4 font-normal text-muted-foreground"
            >
              {keyLabel}
            </kbd>
          ))}
        </span>
      )}
    </Button>
  );
}

interface RecentItemsSectionProps {
  items: RecentItem[];
  kind: RecentItemsKind;
  now: number;
  onOpenItem: (path: string) => void;
  onRemoveItem: (path: string) => void;
  titleId: string;
}

function RecentItemsSection({
  items,
  kind,
  now,
  onOpenItem,
  onRemoveItem,
  titleId,
}: RecentItemsSectionProps) {
  const { t } = useLocalization();
  const messageIds = RECENT_ITEMS_MESSAGE_IDS[kind];

  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <h3 id={titleId} className="mb-2 px-1 text-sm font-medium">
        {t(messageIds.title)}
      </h3>
      {items.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">{t(messageIds.empty)}</p>
      ) : (
        <ul className="-mx-1 flex flex-col">
          {items.map((item) => (
            <RecentItemRow
              item={item}
              key={item.path}
              kind={kind}
              now={now}
              onOpenItem={onOpenItem}
              onRemoveItem={onRemoveItem}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface RecentItemRowProps {
  item: RecentItem;
  kind: RecentItemsKind;
  now: number;
  onOpenItem: (path: string) => void;
  onRemoveItem: (path: string) => void;
}

function RecentItemRow({
  item: { openedAt, path },
  kind,
  now,
  onOpenItem,
  onRemoveItem,
}: RecentItemRowProps) {
  const { formatRelativeTime, t } = useLocalization();
  const { name, parent } = getPathParts(path);
  const messageIds = RECENT_ITEMS_MESSAGE_IDS[kind];

  return (
    <li className="group/recent-item relative flex min-w-0 items-center rounded-md hover:bg-muted dark:hover:bg-muted/50">
      <Tooltip>
        <TooltipTrigger
          whenCutShort
          render={
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenItem(path)}
              className="h-auto min-w-0 flex-1 justify-start gap-3 px-2 py-1.5 hover:bg-transparent dark:hover:bg-transparent"
            />
          }
        >
          <span className="flex min-w-0 flex-1 flex-col items-start text-left">
            <span className="w-full truncate">{name}</span>
            <span className="w-full truncate text-xs font-normal text-muted-foreground">
              {parent}
            </span>
          </span>
          <span className="flex min-w-7 shrink-0 justify-end">
            {openedAt !== undefined && (
              <time
                dateTime={new Date(openedAt).toISOString()}
                className="text-xs font-normal text-muted-foreground group-hover/recent-item:invisible group-has-[:focus-visible]/recent-item:invisible"
              >
                {formatRelativeTime(openedAt, now)}
              </time>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{path}</TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemoveItem(path)}
        aria-label={t(messageIds.remove, { name })}
        className="absolute right-1 text-muted-foreground opacity-0 group-hover/recent-item:opacity-100 group-has-[:focus-visible]/recent-item:opacity-100 hover:bg-background/70 dark:hover:bg-background/40"
      >
        <XIcon />
      </Button>
    </li>
  );
}
