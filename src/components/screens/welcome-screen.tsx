import { FilePlusIcon, FileTextIcon, FolderOpenIcon, XIcon, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { COMMAND_DEFINITIONS, formatShortcut, type AppCommandId } from "@/commands";
import { Button } from "@/components/ui/button";
import { getOpenMarkdownFileErrorMessage } from "@/features/document";
import { getOpenFolderContextErrorMessage } from "@/features/folder-context";
import { useRecentItemsStore, type RecentItem } from "@/features/preferences";
import {
  createNewMarkdownDocument,
  openFolderContextAtPath,
  openMarkdownFileAtPath,
  pickAndOpenFolderContext,
  pickAndOpenMarkdownFile,
} from "@/features/session";
import { notifyOperationFailure } from "@/lib/errors";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { getPathParts } from "@/lib/path";
import { notifyError } from "@/lib/toast";

const NOW_REFRESH_INTERVAL_MS = 60 * 1000;

const handleNewDocument = async () => {
  try {
    await createNewMarkdownDocument();
  } catch (error) {
    notifyOperationFailure("Could not create document.", error, "createWelcomeDocument");
  }
};

const handleOpenFile = async () => {
  try {
    await pickAndOpenMarkdownFile();
  } catch (error) {
    notifyError(getOpenMarkdownFileErrorMessage(error));
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
    notifyError(
      getOpenMarkdownFileErrorMessage(error, {
        title: "Could not open recent Markdown file.",
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
        title: "Could not open recent folder.",
      }),
    );
  }
};

export function WelcomeScreen() {
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
      className="flex min-h-full items-center justify-center px-8 py-10"
    >
      <div className="w-full max-w-3xl">
        <h2 id="welcome-title" className="font-heading text-4xl font-semibold">
          Leafdown
        </h2>
        <p className="mt-3 max-w-lg text-base text-muted-foreground">
          Start a document, or open a Markdown file or folder.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" onClick={handleNewDocument} size="lg">
            <FilePlusIcon data-icon="inline-start" />
            New document
            <CommandShortcutHint commandId="file.new" />
          </Button>
          <Button type="button" onClick={handleOpenFile} variant="outline" size="lg">
            <FileTextIcon data-icon="inline-start" />
            Open file
            <CommandShortcutHint commandId="file.open" />
          </Button>
          <Button type="button" onClick={handleOpenFolder} variant="outline" size="lg">
            <FolderOpenIcon data-icon="inline-start" />
            Open folder
            <CommandShortcutHint commandId="file.openFolder" />
          </Button>
        </div>

        {hasRecentItems && (
          <div className="mt-12">
            <div className="grid gap-8 md:grid-cols-2">
              <RecentItemsSection
                title="Recent files"
                titleId="recent-files-title"
                emptyMessage="No recent files."
                icon={FileTextIcon}
                items={recentFiles}
                now={now}
                onOpenItem={handleOpenRecentFile}
                onRemoveItem={removeRecentFile}
              />
              <RecentItemsSection
                title="Recent folders"
                titleId="recent-folders-title"
                emptyMessage="No recent folders."
                icon={FolderOpenIcon}
                items={recentFolders}
                now={now}
                onOpenItem={handleOpenRecentFolder}
                onRemoveItem={removeRecentFolder}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearRecentItems}
                className="text-muted-foreground"
              >
                <XIcon data-icon="inline-start" />
                Clear recent items
              </Button>
            </div>
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

function CommandShortcutHint({ commandId }: { commandId: AppCommandId }) {
  const shortcut = COMMAND_DEFINITIONS[commandId].shortcuts?.[0];

  if (!shortcut) {
    return null;
  }

  return (
    <span aria-hidden="true" className="ml-2 text-xs font-normal tracking-widest opacity-60">
      {formatShortcut(shortcut)}
    </span>
  );
}

interface RecentItemsSectionProps {
  emptyMessage: string;
  icon: LucideIcon;
  items: RecentItem[];
  now: number;
  onOpenItem: (path: string) => void;
  onRemoveItem: (path: string) => void;
  title: string;
  titleId: string;
}

function RecentItemsSection({
  emptyMessage,
  icon: Icon,
  items,
  now,
  onOpenItem,
  onRemoveItem,
  title,
  titleId,
}: RecentItemsSectionProps) {
  return (
    <section aria-labelledby={titleId} className="min-w-0 border-t border-border pt-3">
      <h3 id={titleId} className="text-sm font-medium">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {items.map((item) => (
            <RecentItemRow
              icon={Icon}
              item={item}
              key={item.path}
              listName={title.toLowerCase()}
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
  icon: LucideIcon;
  item: RecentItem;
  listName: string;
  now: number;
  onOpenItem: (path: string) => void;
  onRemoveItem: (path: string) => void;
}

function RecentItemRow({
  icon: Icon,
  item: { openedAt, path },
  listName,
  now,
  onOpenItem,
  onRemoveItem,
}: RecentItemRowProps) {
  const { name, parent } = getPathParts(path);

  return (
    <li className="group/recent-item flex min-w-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onOpenItem(path)}
        title={path}
        className="min-w-0 flex-1 justify-start gap-2 px-2"
      >
        <Icon />
        <span className="min-w-0 truncate">{name}</span>
        <span className="min-w-0 flex-1 truncate text-left text-xs font-normal text-muted-foreground">
          {parent}
        </span>
        {openedAt !== undefined && (
          <time
            dateTime={new Date(openedAt).toISOString()}
            className="shrink-0 text-xs font-normal text-muted-foreground"
          >
            {formatRelativeTime(openedAt, now)}
          </time>
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemoveItem(path)}
        aria-label={`Remove ${name} from ${listName}`}
        title={`Remove from ${listName}`}
        className="text-muted-foreground opacity-0 group-hover/recent-item:opacity-100 focus-visible:opacity-100"
      >
        <XIcon />
      </Button>
    </li>
  );
}
