import { MilkdownEditor } from "@/components/editor";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { openMarkdownFile, openMarkdownFilePath } from "@/lib/openMarkdownFile";
import { openMarkdownFolder, openMarkdownFolderPath } from "@/lib/openMarkdownFolder";
import {
  getFolderContextStatus,
  getSessionShellMode,
  useSessionStore,
  type SavedDocumentState,
} from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { FileText, FolderOpen, XIcon, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

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
                <Icon aria-hidden="true" className="size-4" />
                <span className="min-w-0 truncate">{path}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WelcomeState() {
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

function FolderOnlyState() {
  return (
    <section
      aria-labelledby="folder-only-title"
      className="flex min-h-full items-center justify-center px-8 py-10"
    >
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
          <FileText aria-hidden="true" className="size-7" />
        </span>
        <h2 id="folder-only-title" className="mt-5 text-xl font-semibold">
          No document open
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Select a Markdown file from the sidebar or create a new document.
        </p>
      </div>
    </section>
  );
}

function EmptyFolderState() {
  return (
    <section
      aria-labelledby="empty-folder-title"
      className="flex min-h-full items-center justify-center px-8 py-10"
    >
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
          <FolderOpen aria-hidden="true" className="size-7" />
        </span>
        <h2 id="empty-folder-title" className="mt-5 text-xl font-semibold">
          No Markdown files found
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Create a new document or open another folder.
        </p>
      </div>
    </section>
  );
}

interface DocumentStateProps {
  document: SavedDocumentState;
}

function DocumentState({ document }: DocumentStateProps) {
  const autoPairBracketsAndQuotes = useSettingsStore((state) => state.autoPairBracketsAndQuotes);
  const softWrapCodeBlocks = useSettingsStore((state) => state.softWrapCodeBlocks);

  return (
    <ScrollArea className="h-full w-full" data-testid="document-surface-scroll-area" type="scroll">
      <section
        aria-label="Active document"
        data-testid="active-document-host"
        className="min-h-full w-full bg-background"
      >
        <MilkdownEditor
          documentKey={document.path}
          initialMarkdown={document.content}
          autoPairBracketsAndQuotes={autoPairBracketsAndQuotes}
          softWrapCodeBlocks={softWrapCodeBlocks}
        />
      </section>
    </ScrollArea>
  );
}

function SessionShell() {
  const shellMode = useSessionStore(getSessionShellMode);
  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);

  return (
    <div className="relative mt-8 flex min-h-0 flex-1 flex-col" data-session-mode={shellMode}>
      <div
        aria-label="Menu bar"
        data-testid="menu-bar-host"
        className="h-9 shrink-0 border-y border-border bg-card/60"
      />

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="File tree sidebar"
          data-testid="file-tree-sidebar-host"
          className="w-64 shrink-0 border-r border-border bg-card/35"
        />

        <main
          aria-label="Document surface"
          data-testid="document-surface-host"
          className="min-w-0 flex-1 bg-background"
        >
          {shellMode === "welcome" && <WelcomeState />}
          {shellMode === "folder-only" &&
            folderContext &&
            getFolderContextStatus(folderContext) === "empty" && <EmptyFolderState />}
          {shellMode === "folder-only" &&
            folderContext &&
            getFolderContextStatus(folderContext) === "available" && <FolderOnlyState />}
          {activeDocument && <DocumentState document={activeDocument} />}
        </main>
      </div>

      <div
        id="modal-layer"
        data-testid="modal-layer-host"
        className="pointer-events-none absolute inset-0 z-80"
      />
    </div>
  );
}

export { SessionShell };
