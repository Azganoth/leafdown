import { CommandMenuBar } from "@/features/commands";
import { FileTreeSidebar } from "@/features/file-tree";
import { useFolderWatcher } from "@/features/file-tree/hooks/useFolderWatcher";
import { getFolderContextStatus, getSessionShellMode, useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { WelcomeScreen } from "./WelcomeScreen";
import { EmptyFolderScreen } from "./EmptyFolderScreen";
import { FolderOnlyScreen } from "./FolderOnlyScreen";
import { DocumentScreen } from "./DocumentScreen";

function SessionShell() {
  useFolderWatcher();

  const shellMode = useSessionStore(getSessionShellMode);
  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);

  return (
    <div className="relative mt-8 flex min-h-0 flex-1 flex-col" data-session-mode={shellMode}>
      <div
        aria-label="Menu bar"
        data-testid="menu-bar-host"
        className="flex h-9 shrink-0 items-center justify-between border-y border-border bg-card/60 px-2"
      >
        <div className="flex min-w-0 items-center gap-2">
          <CommandMenuBar />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {sidebarVisible && (
          <aside
            aria-label="File tree sidebar"
            data-testid="file-tree-sidebar-host"
            className="w-64 shrink-0 border-r border-border bg-card/35"
          >
            <FileTreeSidebar activeDocument={activeDocument} folderContext={folderContext} />
          </aside>
        )}

        <main
          aria-label="Document surface"
          data-testid="document-surface-host"
          className="min-w-0 flex-1 bg-background"
        >
          {shellMode === "welcome" && <WelcomeScreen />}
          {shellMode === "folder-only" &&
            folderContext &&
            getFolderContextStatus(folderContext) === "empty" && <EmptyFolderScreen />}
          {shellMode === "folder-only" &&
            folderContext &&
            getFolderContextStatus(folderContext) === "available" && <FolderOnlyScreen />}
          {activeDocument && <DocumentScreen document={activeDocument} />}
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
