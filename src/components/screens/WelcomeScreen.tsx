import { FileTextIcon, FolderOpenIcon, XIcon, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { getOpenMarkdownFileErrorMessage } from "@/features/document";
import { getOpenFolderContextErrorMessage } from "@/features/folder-context";
import { useRecentItemsStore } from "@/features/preferences";
import {
  openFolderContextAtPath,
  openMarkdownFileAtPath,
  pickAndOpenFolderContext,
  pickAndOpenMarkdownFile,
} from "@/features/session";
import { notifyError } from "@/lib/toast";

export function WelcomeScreen() {
  const recentFiles = useRecentItemsStore((state) => state.recentFiles);
  const recentFolders = useRecentItemsStore((state) => state.recentFolders);
  const clearRecentItems = useRecentItemsStore((state) => state.clearRecentItems);
  const hasRecentItems = recentFiles.length > 0 || recentFolders.length > 0;

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
          Open a Markdown file or folder to start editing.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" onClick={handleOpenFile} size="lg">
            <FileTextIcon className="size-4" />
            Open file
          </Button>
          <Button type="button" onClick={handleOpenFolder} variant="outline" size="lg">
            <FolderOpenIcon className="size-4" />
            Open folder
          </Button>
          {hasRecentItems && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={clearRecentItems}
              className="ml-auto"
            >
              <XIcon className="size-4" />
              Clear recent items
            </Button>
          )}
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
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
      </div>
    </section>
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
        <ul className="mt-2 space-y-1">
          {items.map((path) => (
            <li key={path} className="min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenItem(path)}
                title={path}
                className="w-full justify-start px-2"
              >
                <Icon className="size-4" />
                <span className="min-w-0 truncate">{path}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
