import { openMarkdownFolder } from "@/lib/openMarkdownFolder";
import { openMarkdownFile } from "@/lib/openMarkdownFile";
import { MilkdownEditor } from "@/components/editor";
import {
  getSessionShellMode,
  useSessionStore,
  type SavedDocumentState,
  getFolderContextStatus,
} from "@/stores/session";
import { FileText, FolderOpen } from "lucide-react";
import { toast } from "sonner";

function WelcomeState() {
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
          <button
            type="button"
            onClick={handleOpenFile}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <FileText aria-hidden="true" className="size-4" />
            Open file
          </button>
          <button
            type="button"
            onClick={handleOpenFolder}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-card-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <FolderOpen aria-hidden="true" className="size-4" />
            Open folder
          </button>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <section aria-labelledby="recent-files-title" className="border-t border-border pt-3">
            <h3 id="recent-files-title" className="text-sm font-medium">
              Recent files
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">No recent files.</p>
          </section>
          <section aria-labelledby="recent-folders-title" className="border-t border-border pt-3">
            <h3 id="recent-folders-title" className="text-sm font-medium">
              Recent folders
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">No recent folders.</p>
          </section>
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
  return (
    <section
      aria-label="Active document"
      data-testid="active-document-host"
      className="min-h-full w-full bg-background"
    >
      <MilkdownEditor documentKey={document.path} initialMarkdown={document.content} />
    </section>
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
          className="min-w-0 flex-1 overflow-auto bg-background"
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
