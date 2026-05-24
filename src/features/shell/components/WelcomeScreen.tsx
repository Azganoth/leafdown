import { Button } from "@/components/ui/Button";
import { openMarkdownFile, openMarkdownFilePath } from "@/lib/openMarkdownFile";
import { openMarkdownFolder, openMarkdownFolderPath } from "@/lib/openMarkdownFolder";
import { useSettingsStore } from "@/stores/settings";
import { FileText, FolderOpen, XIcon } from "lucide-react";
import { toast } from "sonner";
import { RecentItemsSection } from "./RecentItemsSection";

export function WelcomeScreen() {
  const recentFiles = useSettingsStore((state) => state.recentFiles);
  const recentFolders = useSettingsStore((state) => state.recentFolders);
  const clearRecentItems = useSettingsStore((state) => state.clearRecentItems);
  const hasRecentItems = recentFiles.length > 0 || recentFolders.length > 0;

  const handleOpenFile = () => {
    void openMarkdownFile().catch(() => {
      toast.error("Could not open Markdown file.");
    });
  };

  const handleOpenFolder = () => {
    void openMarkdownFolder().catch(() => {
      toast.error("Could not open folder.");
    });
  };

  const handleOpenRecentFile = (path: string) => {
    void openMarkdownFilePath(path).catch(() => {
      toast.error("Could not open recent Markdown file.");
    });
  };

  const handleOpenRecentFolder = (path: string) => {
    void openMarkdownFolderPath(path).catch(() => {
      toast.error("Could not open recent folder.");
    });
  };

  return (
    <section
      aria-labelledby="welcome-title"
      className="flex min-h-full items-center justify-center px-8 py-10"
    >
      <div className="w-full max-w-3xl">
        <h2 id="welcome-title" className="font-display text-4xl font-semibold">
          Leafdown
        </h2>
        <p className="mt-3 max-w-lg text-base text-muted-foreground">
          Open a Markdown file or folder to start editing.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" onClick={handleOpenFile} size="lg">
            <FileText aria-hidden="true" className="size-4" />
            Open file
          </Button>
          <Button type="button" onClick={handleOpenFolder} variant="outline" size="lg">
            <FolderOpen aria-hidden="true" className="size-4" />
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
              <XIcon aria-hidden="true" className="size-4" />
              Clear recent items
            </Button>
          )}
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <RecentItemsSection
            title="Recent files"
            titleId="recent-files-title"
            emptyMessage="No recent files."
            icon={FileText}
            items={recentFiles}
            onOpenItem={handleOpenRecentFile}
          />
          <RecentItemsSection
            title="Recent folders"
            titleId="recent-folders-title"
            emptyMessage="No recent folders."
            icon={FolderOpen}
            items={recentFolders}
            onOpenItem={handleOpenRecentFolder}
          />
        </div>
      </div>
    </section>
  );
}
