import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";

import { useAppCommands } from "@/commands";
import { AboutDialog } from "@/components/layout/about-dialog";
import { CommandMenubar } from "@/components/layout/command-menubar";
import { DocumentScreen } from "@/components/screens/document-screen";
import { EmptyFolderScreen } from "@/components/screens/empty-folder-screen";
import { FolderOnlyScreen } from "@/components/screens/folder-only-screen";
import { WelcomeScreen } from "@/components/screens/welcome-screen";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DiagnosticsDialog } from "@/features/diagnostics";
import { getOpenMarkdownFileErrorMessage } from "@/features/document";
import { ArticleNavigator } from "@/features/folder-context";
import { PreferencesDialog, useSettingsStore } from "@/features/preferences";
import {
  getSessionMode,
  openMarkdownFileAtPath,
  useFolderContextWatcher,
  useSessionStore,
} from "@/features/session";
import { notifyError } from "@/lib/toast";

import { Titlebar } from "./titlebar";

const handleOpenArticle = (path: string) => {
  void openMarkdownFileAtPath(path).catch((error) => {
    notifyError(getOpenMarkdownFileErrorMessage(error));
  });
};

export function Shell() {
  useFolderContextWatcher();

  const commands = useAppCommands();
  const sessionMode = useSessionStore(getSessionMode);
  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);
  const activeArticlePath = activeDocument?.status === "saved" ? activeDocument.path : null;

  return (
    <>
      <Titlebar
        actions={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
                  aria-pressed={sidebarVisible}
                  onClick={() => commands.executeCommand("view.toggleSidebar")}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground"
                />
              }
            >
              {sidebarVisible ? (
                <PanelLeftCloseIcon data-icon="inline-start" />
              ) : (
                <PanelLeftOpenIcon data-icon="inline-start" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {sidebarVisible ? "Hide sidebar" : "Show sidebar"}
            </TooltipContent>
          </Tooltip>
        }
      >
        <div data-testid="menu-bar-host" className="flex h-full min-w-0 items-center">
          <CommandMenubar
            commandState={commands.commandState}
            onExecute={commands.executeCommand}
            onOpenRecentFile={commands.openRecentFile}
            onOpenRecentFolder={commands.openRecentFolder}
            recentFiles={commands.recentItems.recentFiles}
            recentFolders={commands.recentItems.recentFolders}
          />
        </div>
      </Titlebar>
      <div className="relative mt-8 flex min-h-0 flex-1 flex-col" data-session-mode={sessionMode}>
        <ResizablePanelGroup className="min-h-0 flex-1" orientation="horizontal">
          {sidebarVisible && (
            <>
              <ResizablePanel
                defaultSize={256}
                groupResizeBehavior="preserve-pixel-size"
                id="article-navigator"
                maxSize={480}
                minSize={192}
              >
                <aside
                  aria-label="Article navigator"
                  data-testid="article-navigator-host"
                  className="flex size-full min-h-0 min-w-0 pt-1 pb-3 pl-3"
                >
                  <ArticleNavigator
                    activeArticlePath={activeArticlePath}
                    folderContext={folderContext}
                    onOpenArticle={handleOpenArticle}
                  />
                </aside>
              </ResizablePanel>
              <ResizableHandle aria-label="Resize article navigator" withHandle />
            </>
          )}

          <ResizablePanel className="min-w-0" id="document-surface">
            <main
              aria-label="Document surface"
              data-testid="document-surface-host"
              className="size-full min-w-0 bg-background"
            >
              {sessionMode === "welcome" && <WelcomeScreen />}
              {sessionMode === "folder-only" && folderContext?.isEmpty && <EmptyFolderScreen />}
              {sessionMode === "folder-only" && folderContext && !folderContext.isEmpty && (
                <FolderOnlyScreen />
              )}
              {activeDocument && <DocumentScreen activeDocument={activeDocument} />}
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>

        <div
          id="modal-layer"
          data-testid="modal-layer-host"
          className="pointer-events-none absolute inset-0 z-80"
        />
        <PreferencesDialog
          open={commands.preferencesOpen}
          onOpenChange={commands.setPreferencesOpen}
        />
        <DiagnosticsDialog
          open={commands.diagnosticsOpen}
          onOpenChange={commands.setDiagnosticsOpen}
        />
        <AboutDialog open={commands.aboutOpen} onOpenChange={commands.setAboutOpen} />
      </div>
    </>
  );
}
