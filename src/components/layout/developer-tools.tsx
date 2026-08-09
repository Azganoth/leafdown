import {
  BanIcon,
  BugIcon,
  CircleOffIcon,
  FileXIcon,
  ImageOffIcon,
  MessageCircleWarningIcon,
  MonitorCogIcon,
  RadioTowerIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

import { openDevTools } from "@/commands/actions/help";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getOpenMarkdownFileErrorMessage } from "@/features/document";
import { CancellationError } from "@/lib/cancellation";
import { handleUnexpectedError, notifyOperationFailure } from "@/lib/errors";
import { notifyError } from "@/lib/toast";

interface DeveloperToolsProps {
  onSimulateRenderFailure: () => void;
}

interface DeveloperToolAction {
  description: string;
  icon: LucideIcon;
  label: string;
  run: () => Promise<void> | void;
}

const DEBUG_MISSING_MARKDOWN_PATH = "C:/Leafdown/debug/missing.md";

export function DeveloperTools({ onSimulateRenderFailure }: DeveloperToolsProps) {
  const appActions: DeveloperToolAction[] = [
    {
      description: "Open the native webview inspector for console and network inspection.",
      icon: MonitorCogIcon,
      label: "Open DevTools",
      run: openDevTools,
    },
    {
      description: "Reload the webview after a boundary fallback or stale HMR state.",
      icon: RefreshCwIcon,
      label: "Reload app (F5)",
      run: reloadApp,
    },
  ];
  const failureActions: DeveloperToolAction[] = [
    {
      description: "Throw during app-surface render; the helper should stay available.",
      icon: TriangleAlertIcon,
      label: "Render document surface crash",
      run: onSimulateRenderFailure,
    },
    {
      description: "Mimic a rejected command such as a failed native fullscreen call.",
      icon: MessageCircleWarningIcon,
      label: "Command handler failure",
      run: simulateCommandHandlerFailure,
    },
    {
      description: "Mimic opening a recent or sidebar article that no longer exists.",
      icon: FileXIcon,
      label: "Missing file open",
      run: simulateMissingFileOpen,
    },
    {
      description: "Mimic a stale open transition that should stay silent.",
      icon: CircleOffIcon,
      label: "Cancelled open transition",
      run: simulateCancelledOpenTransition,
    },
    {
      description: "Mimic an image resolution promise that escaped local handling.",
      icon: ImageOffIcon,
      label: "Escaped image rejection",
      run: simulateEscapedImageRejection,
    },
    {
      description: "Mimic a native window event listener throwing outside React.",
      icon: BanIcon,
      label: "Window event listener throw",
      run: simulateWindowEventListenerThrow,
    },
    {
      description: "Mimic duplicate folder watcher refresh failures in the dedupe window.",
      icon: RadioTowerIcon,
      label: "Repeated watcher failure",
      run: simulateRepeatedWatcherFailure,
    },
  ];

  return (
    <div className="fixed right-4 bottom-4 z-90">
      <Popover>
        <PopoverTrigger
          render={
            <Button
              aria-label="Open developer tools"
              className="size-10 rounded-full shadow-lg shadow-black/25"
              size="icon"
              type="button"
            />
          }
        >
          <WrenchIcon className="size-4" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="z-90 w-auto gap-1 rounded-xl p-1.5"
          side="top"
          sideOffset={10}
        >
          <div
            className="flex flex-col items-center gap-1"
            role="toolbar"
            aria-label="Developer tools"
          >
            {appActions.map((action) => (
              <DeveloperToolIconButton key={action.label} action={action} />
            ))}
            <DeveloperToolErrorPopover actions={failureActions} />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface DeveloperToolErrorPopoverProps {
  actions: DeveloperToolAction[];
}

function DeveloperToolErrorPopover({ actions }: DeveloperToolErrorPopoverProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  aria-label="Failure simulations"
                  className="size-9 rounded-lg"
                  size="icon"
                  type="button"
                  variant="ghost"
                />
              }
            />
          }
        >
          <BugIcon className="size-4" />
        </TooltipTrigger>
        <TooltipContent
          className="max-w-64 flex-col items-start gap-0.5"
          side="left"
          sideOffset={8}
        >
          <span className="text-xs font-medium">Failure simulations</span>
          <span className="text-[0.7rem] leading-4 opacity-80">
            Open failure scenarios for testing error handling paths.
          </span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="z-90 w-80 gap-1 p-1.5" side="left" sideOffset={12}>
        <div className="px-1.5 py-1">
          <div className="text-xs font-medium text-popover-foreground">Failure simulations</div>
          <p className="text-[0.7rem] leading-4 text-muted-foreground">
            Trigger real error-handling paths without changing app state.
          </p>
        </div>
        <div className="grid gap-1">
          {actions.map((action) => (
            <DeveloperToolActionButton key={action.label} action={action} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface DeveloperToolIconButtonProps {
  action: DeveloperToolAction;
}

function DeveloperToolIconButton({ action }: DeveloperToolIconButtonProps) {
  const Icon = action.icon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={action.label}
            className="size-9 rounded-lg"
            onClick={() => void action.run()}
            size="icon"
            type="button"
            variant="ghost"
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64 flex-col items-start gap-0.5" side="left" sideOffset={8}>
        <span className="text-xs font-medium">{action.label}</span>
        <span className="text-[0.7rem] leading-4 opacity-80">{action.description}</span>
      </TooltipContent>
    </Tooltip>
  );
}

interface DeveloperToolActionButtonProps {
  action: DeveloperToolAction;
}

function DeveloperToolActionButton({ action }: DeveloperToolActionButtonProps) {
  const Icon = action.icon;

  return (
    <Button
      className="h-auto justify-start gap-2 px-2 py-1.5 text-left whitespace-normal"
      onClick={() => void action.run()}
      type="button"
      variant="ghost"
    >
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{action.label}</span>
        <span className="block text-[0.7rem] leading-4 font-normal text-muted-foreground">
          {action.description}
        </span>
      </span>
    </Button>
  );
}

const createDebugError = (message: string) => new Error(message);

const reloadApp = () => {
  window.location.reload();
};

const simulateCommandHandlerFailure = () => {
  notifyOperationFailure(
    "Command failed.",
    createDebugError("Native fullscreen state update failed."),
    {
      source: "commands",
      operation: "view.fullscreen",
    },
  );
};

const simulateMissingFileOpen = () => {
  notifyError(
    getOpenMarkdownFileErrorMessage({
      kind: "missingFile",
      path: DEBUG_MISSING_MARKDOWN_PATH,
    }),
  );
};

const simulateCancelledOpenTransition = () => {
  notifyOperationFailure(
    "Command failed.",
    new CancellationError("The previous open transition was cancelled."),
    {
      source: "commands",
      operation: "file.open",
    },
  );
};

const simulateEscapedImageRejection = () => {
  window.setTimeout(() => {
    void Promise.reject(createDebugError("Markdown image resolution escaped local handling."));
  }, 0);
};

const simulateWindowEventListenerThrow = () => {
  window.setTimeout(() => {
    throw createDebugError("Native window event listener failed while handling close.");
  }, 0);
};

const simulateRepeatedWatcherFailure = () => {
  const error = createDebugError("Folder watcher refresh failed after a filesystem event.");

  handleUnexpectedError(error, "folderContextWatcher.refresh");
  handleUnexpectedError(error, "folderContextWatcher.refresh");
};
