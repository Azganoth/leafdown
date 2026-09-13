import { FilePlusIcon, FileTextIcon, FolderOpenIcon, XIcon, type LucideIcon } from "lucide-react";

import { COMMAND_DEFINITIONS, formatShortcut, type AppCommandId } from "@/commands";
import { Button } from "@/components/ui/button";
import { getOpenMarkdownFileErrorMessage } from "@/features/document";
import { getOpenFolderContextErrorMessage } from "@/features/folder-context";
import { useRecentItemsStore } from "@/features/preferences";
import {
  createNewMarkdownDocument,
  openFolderContextAtPath,
  openMarkdownFileAtPath,
  pickAndOpenFolderContext,
  pickAndOpenMarkdownFile,
} from "@/features/session";
import { notifyOperationFailure } from "@/lib/errors";
import { getPathParts } from "@/lib/path";
import { notifyError } from "@/lib/toast";

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
  const hasRecentItems = recentFiles.length > 0 || recentFolders.length > 0;

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
                onOpenItem={handleOpenRecentFile}
              />
              <RecentItemsSection
                title="Recent folders"
                titleId="recent-folders-title"
                emptyMessage="No recent folders."
                icon={FolderOpenIcon}
                items={recentFolders}
                onOpenItem={handleOpenRecentFolder}
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
  items: string[];
  onOpenItem: (path: string) => void;
  title: string;
  titleId: string;
}

function RecentItemsSection({
  emptyMessage,
  icon: Icon,
  items,
  onOpenItem,
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
          {items.map((path) => (
            <RecentItem icon={Icon} key={path} onOpenItem={onOpenItem} path={path} />
          ))}
        </ul>
      )}
    </section>
  );
}

interface RecentItemProps {
  icon: LucideIcon;
  onOpenItem: (path: string) => void;
  path: string;
}

function RecentItem({ icon: Icon, onOpenItem, path }: RecentItemProps) {
  const { name, parent } = getPathParts(path);

  return (
    <li className="min-w-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onOpenItem(path)}
        title={path}
        className="w-full justify-start gap-2 px-2"
      >
        <Icon />
        <span className="min-w-0 truncate">{name}</span>
        <span className="min-w-0 flex-1 truncate text-left text-xs font-normal text-muted-foreground">
          {parent}
        </span>
      </Button>
    </li>
  );
}
