import { useAppCommands } from "@/commands";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { CommandMenuBar } from "@/components/layout/CommandMenuBar";
import { DocumentScreen } from "@/components/screens/DocumentScreen";
import { EmptyFolderScreen } from "@/components/screens/EmptyFolderScreen";
import { FolderOnlyScreen } from "@/components/screens/FolderOnlyScreen";
import { WelcomeScreen } from "@/components/screens/WelcomeScreen";
import { getOpenMarkdownFileErrorMessage, showDocumentIoErrorToast } from "@/features/document";
import { ArticleNavigator, getFolderContextStatus } from "@/features/folder-context";
import { PreferencesDialog, useSettingsStore } from "@/features/preferences";
import {
  getAppShellMode,
  openMarkdownFilePath,
  useFolderContextWatcher,
  useSessionStore,
} from "@/features/session";
import { toast } from "sonner";

export function AppShell() {
  useFolderContextWatcher();

  const commands = useAppCommands();
  const shellMode = useSessionStore(getAppShellMode);
  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);
  const activeArticlePath = activeDocument?.status === "saved" ? activeDocument.path : null;

  const handleOpenArticle = (path: string) => {
    void openMarkdownFilePath(path).catch((error: unknown) => {
      showDocumentIoErrorToast(toast.error, getOpenMarkdownFileErrorMessage(error));
    });
  };

  return (
    <div className="relative mt-8 flex min-h-0 flex-1 flex-col" data-session-mode={shellMode}>
      <div
        aria-label="Menu bar"
        data-testid="menu-bar-host"
        className="flex h-9 shrink-0 items-center justify-between border-y border-border bg-card/60 px-2"
      >
        <div className="flex min-w-0 items-center gap-2">
          <CommandMenuBar
            commandState={commands.commandState}
            onExecute={commands.executeCommand}
            onOpenRecentFile={commands.openRecentFile}
            onOpenRecentFolder={commands.openRecentFolder}
            recentFiles={commands.history.recentFiles}
            recentFolders={commands.history.recentFolders}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {sidebarVisible && (
          <aside
            aria-label="Article navigator"
            data-testid="article-navigator-host"
            className="w-64 shrink-0 border-r border-border bg-card/35"
          >
            <ArticleNavigator
              activeArticlePath={activeArticlePath}
              folderContext={folderContext}
              onOpenArticle={handleOpenArticle}
            />
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
      <PreferencesDialog
        open={commands.preferencesOpen}
        onOpenChange={commands.setPreferencesOpen}
        showTrigger={false}
      />
      <AboutDialog open={commands.aboutOpen} onOpenChange={commands.setAboutOpen} />
    </div>
  );
}
