import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { ARTICLE_NAVIGATOR_ENTRY_ACTIONS, useAppCommands } from "@/commands";
import { AboutDialog } from "@/components/layout/about-dialog";
import { CommandMenubar } from "@/components/layout/command-menubar";
import { CommandPalette } from "@/components/layout/command-palette";
import { ConfirmationDialog } from "@/components/layout/confirmation-dialog";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog";
import { UnexpectedErrorBoundary } from "@/components/layout/unexpected-error-boundary";
import { DocumentScreen } from "@/components/screens/document-screen";
import { EmptyFolderScreen } from "@/components/screens/empty-folder-screen";
import { FolderOnlyScreen } from "@/components/screens/folder-only-screen";
import { WelcomeScreen } from "@/components/screens/welcome-screen";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DiagnosticsDialog } from "@/features/diagnostics";
import { formatDocumentEncoding } from "@/features/document";
import { DocumentTypographyPreview } from "@/features/editor";
import { ArticleNavigator, ArticleNavigatorSkeleton } from "@/features/folder-context";
import { FolderSearchPanel, useFolderSearchStore } from "@/features/folder-search";
import { HelpDialog } from "@/features/help";
import { PreferencesDialog, useSettingsStore } from "@/features/preferences";
import { ReleaseNotesDialog } from "@/features/release-notes";
import {
  applyFolderReplacement,
  cancelFolderSearch,
  closeFolderSearch,
  getSessionMode,
  notifyOpenMarkdownFileError,
  openFolderSearchMatch,
  openMarkdownFileAtPath,
  searchFolderFurther,
  submitFolderSearch,
  useActiveDocumentWatcher,
  useFolderContextWatcher,
  useFolderSearchSession,
  useSessionStore,
} from "@/features/session";
import { handleUnexpectedError } from "@/lib/errors";
import { useLocalization } from "@/lib/i18n";
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
    notifyOpenMarkdownFileError(error);
  });
};

const handleActivateFolderSearchMatch = (match: Parameters<typeof openFolderSearchMatch>[0]) => {
  void openFolderSearchMatch(match).catch((error) =>
    handleUnexpectedError(error, "openFolderSearchMatch"),
  );
};

const handleApplyFolderReplacement = () => {
  void applyFolderReplacement().catch((error) =>
    handleUnexpectedError(error, "applyFolderReplacement"),
  );
};

export function Shell() {
  useFolderContextWatcher();
  useActiveDocumentWatcher();
  useFolderSearchSession();

  const localization = useLocalization();
  const { t } = localization;
  const [simulatedRenderFailureId, setSimulatedRenderFailureId] = useState(0);
  const commands = useAppCommands();
  const sessionMode = useSessionStore(getSessionMode);
  const activeDocument = useSessionStore((state) => state.activeDocument);
  const folderContext = useSessionStore((state) => state.folderContext);
  const folderContextLoadPath = useSessionStore((state) => state.folderContextLoad?.path ?? null);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);
  const folderSearchOpen = useFolderSearchStore((state) => state.open);
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
                    aria-label={t(sidebarShown ? "shell.sidebar.hide" : "shell.sidebar.show")}
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
                {t(
                  sidebarAvailable
                    ? sidebarShown
                      ? "shell.sidebar.hide"
                      : "shell.sidebar.show"
                    : "shell.sidebar.unavailable",
                )}
              </TooltipContent>
            </Tooltip>
          </>
        }
      >
        <div data-testid="menu-bar-host" className="flex h-full min-w-0 items-center">
          <CommandMenubar
            commandState={commands.commandState}
            fileEncodingLabel={
              activeDocument?.status === "saved"
                ? formatDocumentEncoding(activeDocument.fileEncoding, localization)
                : null
            }
            onExecute={commands.executeCommand}
            onOpenRecentFile={commands.openRecentFile}
            onOpenRecentFolder={commands.openRecentFolder}
            recentFiles={commands.recentItems.recentFiles}
            recentFolders={commands.recentItems.recentFolders}
            reopenWithEncoding={commands.reopenWithEncoding}
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
              {(folderContext || folderContextLoadPath) && sidebarVisible && (
                <>
                  <ResizablePanel
                    defaultSize={256}
                    groupResizeBehavior="preserve-pixel-size"
                    id="article-navigator"
                    maxSize={480}
                    minSize={192}
                  >
                    <aside
                      aria-label={t(
                        folderSearchOpen ? "shell.folderSearch" : "shell.articleNavigator",
                      )}
                      data-testid="article-navigator-host"
                      className="flex size-full min-h-0 min-w-0"
                    >
                      {!folderContext ? (
                        folderContextLoadPath && (
                          <ArticleNavigatorSkeleton folderPath={folderContextLoadPath} />
                        )
                      ) : folderSearchOpen ? (
                        <FolderSearchPanel
                          folderName={folderContext.tree.name}
                          folderPath={folderContext.path}
                          onActivateMatch={handleActivateFolderSearchMatch}
                          onApply={handleApplyFolderReplacement}
                          onCancel={cancelFolderSearch}
                          onClose={closeFolderSearch}
                          onSearchFurther={searchFolderFurther}
                          onSubmit={submitFolderSearch}
                        />
                      ) : (
                        <ArticleNavigator
                          actions={ARTICLE_NAVIGATOR_ENTRY_ACTIONS}
                          activeArticlePath={activeArticlePath}
                          folderContext={folderContext}
                          onOpenArticle={handleOpenArticle}
                        />
                      )}
                    </aside>
                  </ResizablePanel>
                  <ResizableHandle aria-label={t("shell.resizeArticleNavigator")} withHandle />
                </>
              )}

              <ResizablePanel className="min-w-0" id="document-surface">
                <main
                  aria-label={t("shell.documentSurface")}
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
              reopenWithEncoding={commands.reopenWithEncoding}
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
          renderTypographyPreview={(typography) => <DocumentTypographyPreview {...typography} />}
        />
        <CommandPalette
          commandState={commands.commandState}
          onExecute={commands.executeCommand}
          onOpenChange={commands.setCommandPaletteOpen}
          open={commands.commandPaletteOpen}
        />
        <DiagnosticsDialog
          open={commands.diagnosticsOpen}
          onOpenChange={commands.setDiagnosticsOpen}
        />
        <AboutDialog open={commands.aboutOpen} onOpenChange={commands.setAboutOpen} />
        <HelpDialog page={commands.helpPage} onPageChange={commands.setHelpPage} />
        <ReleaseNotesDialog />
        <KeyboardShortcutsDialog
          open={commands.keyboardShortcutsOpen}
          onOpenChange={commands.setKeyboardShortcutsOpen}
        />
        <ConfirmationDialog />
      </div>
    </>
  );
}

function DeveloperRenderFailure(): never {
  throw new Error("Developer tools simulated document surface render failure.");
}
