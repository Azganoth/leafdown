import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { ARTICLE_NAVIGATOR_ENTRY_ACTIONS, useAppCommands } from "@/commands";
import { AboutDialog } from "@/components/layout/about-dialog";
import { CommandMenubar } from "@/components/layout/command-menubar";
import { ConfirmationDialog } from "@/components/layout/confirmation-dialog";
import { UnexpectedErrorBoundary } from "@/components/layout/unexpected-error-boundary";
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
import { cn } from "@/lib/utils";

import { StatusBar } from "./status-bar";
import { Titlebar } from "./titlebar";

const DeveloperTools = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import("@/components/layout/developer-tools");

      return { default: module.DeveloperTools };
    })
  : null;

const handleOpenArticle = (path: string) => {
  void openMarkdownFileAtPath(path).catch((error) => {
    notifyError(getOpenMarkdownFileErrorMessage(error));
  });
};

export function Shell() {
  useFolderContextWatcher();

  const [simulatedRenderFailureId, setSimulatedRenderFailureId] = useState(0);
  const commands = useAppCommands();
  const sessionMode = useSessionStore(getSessionMode);
  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);
  const statusBarVisible = useSettingsStore((state) => state.statusBarVisible);
  const activeArticlePath = activeDocument?.status === "saved" ? activeDocument.path : null;
  const sidebarAvailable = commands.commandState("view.toggleSidebar").enabled;
  const sidebarShown = sidebarAvailable && sidebarVisible;
  const statusBarShown = activeDocument !== null && statusBarVisible;

  return (
    <>
      <Titlebar
        actions={
          <>
            {DeveloperTools && (
              <Suspense fallback={null}>
                <DeveloperTools
                  onSimulateRenderFailure={() =>
                    setSimulatedRenderFailureId((failureId) => failureId + 1)
                  }
                />
              </Suspense>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={sidebarShown ? "Hide sidebar" : "Show sidebar"}
                    aria-pressed={sidebarShown}
                    disabled={!sidebarAvailable}
                    focusableWhenDisabled
                    onClick={() => commands.executeCommand("view.toggleSidebar")}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                    className="text-muted-foreground aria-disabled:opacity-50"
                  />
                }
              >
                {sidebarShown ? (
                  <PanelLeftCloseIcon data-icon="inline-start" />
                ) : (
                  <PanelLeftOpenIcon data-icon="inline-start" />
                )}
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {sidebarAvailable
                  ? sidebarShown
                    ? "Hide sidebar"
                    : "Show sidebar"
                  : "Open a folder to show the sidebar"}
              </TooltipContent>
            </Tooltip>
          </>
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
        {/* Scoped below the titlebar so a surface crash leaves the window draggable and the
            developer tools reachable. */}
        <UnexpectedErrorBoundary>
          <div
            data-testid="document-workspace-host"
            className={cn("flex min-h-0 flex-1 px-3 pt-1", statusBarShown ? "pb-0" : "pb-3")}
          >
            <ResizablePanelGroup className="min-h-0 flex-1" orientation="horizontal">
              {folderContext && sidebarVisible && (
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
                      className="flex size-full min-h-0 min-w-0"
                    >
                      <ArticleNavigator
                        actions={ARTICLE_NAVIGATOR_ENTRY_ACTIONS}
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
          </div>
          {statusBarShown && (
            <StatusBar
              activeDocument={activeDocument}
              commandState={commands.commandState}
              onExecute={commands.executeCommand}
            />
          )}
          {simulatedRenderFailureId > 0 && (
            <DeveloperRenderFailure key={simulatedRenderFailureId} />
          )}
        </UnexpectedErrorBoundary>

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
        <ConfirmationDialog />
      </div>
    </>
  );
}

function DeveloperRenderFailure(): never {
  throw new Error("Developer tools simulated document surface render failure.");
}
