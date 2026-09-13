import { openPath } from "@tauri-apps/plugin-opener";
import {
  ChevronRightIcon,
  CopyIcon,
  FolderOpenIcon,
  RotateCcwIcon,
  ShieldIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getErrorDescription, notifyOperationFailure } from "@/lib/errors";
import { formatFileSize } from "@/lib/formatFileSize";
import { notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { getDiagnosticsSummary, type DiagnosticsSummary } from "../services/diagnosticsApi";
import { formatDiagnosticsSummary } from "../services/diagnosticsSummary";

interface DiagnosticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiagnosticsDialog({ open, onOpenChange }: DiagnosticsDialogProps) {
  const [summary, setSummary] = useState<DiagnosticsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let cancelled = false;

    const loadSummary = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const nextSummary = await getDiagnosticsSummary();

        if (!cancelled) {
          setSummary(nextSummary);
        }
      } catch (error) {
        if (!cancelled) {
          setSummary(null);
          setLoadError(getErrorDescription(error) ?? "Diagnostics could not be loaded.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [open, reloadToken]);

  const summaryText = summary ? formatDiagnosticsSummary(summary) : "";

  const copySummary = async () => {
    try {
      if (!summary) {
        throw new Error("Diagnostics summary is not loaded.");
      }

      const clipboard = navigator.clipboard;

      if (!clipboard?.writeText) {
        throw new Error("Clipboard is unavailable.");
      }

      await clipboard.writeText(summaryText);
      notifySuccess("Diagnostics summary copied.");
    } catch (error) {
      notifyOperationFailure(
        "Could not copy diagnostics summary.",
        error,
        "diagnostics.copySummary",
      );
    }
  };

  const openLogsFolder = async () => {
    try {
      if (!summary) {
        throw new Error("Diagnostics summary is not loaded.");
      }

      await openPath(summary.logDirectoryPath);
    } catch (error) {
      notifyOperationFailure("Could not open logs folder.", error, "diagnostics.openLogsFolder");
    }
  };

  const reloadSummary = () => {
    setReloadToken((token) => token + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-2xl">
        <DialogHeader className="pr-10">
          <DialogTitle>Diagnostics</DialogTitle>
          <DialogDescription>
            This installation and where it keeps its local logs.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {loadError ? (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Diagnostics could not be loaded.</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : (
            <dl className="grid gap-2.5 text-sm">
              <DiagnosticFact term="App" loading={loading && !summary}>
                {summary && `${summary.appName} ${summary.appVersion}`}
              </DiagnosticFact>
              <DiagnosticFact term="Identifier" loading={loading && !summary} mono>
                {summary?.appIdentifier}
              </DiagnosticFact>
              <DiagnosticFact term="System" loading={loading && !summary}>
                {summary && `${summary.operatingSystem} ${summary.architecture}`}
              </DiagnosticFact>
              <DiagnosticFact term="Run" loading={loading && !summary} mono>
                {summary?.runId}
              </DiagnosticFact>
              <DiagnosticFact term="Logs folder" loading={loading && !summary} mono>
                {summary?.logDirectoryPath}
              </DiagnosticFact>
              <DiagnosticFact term="Current log" loading={loading && !summary} mono>
                {summary?.logFilePath}
              </DiagnosticFact>
              <DiagnosticFact term="Retention" loading={loading && !summary}>
                {summary &&
                  `Current log plus ${summary.logFileCount} retained files, ${formatFileSize(summary.logMaxFileSizeBytes)} each`}
              </DiagnosticFact>
            </dl>
          )}

          <Alert>
            <ShieldIcon />
            <AlertTitle>Diagnostics stay on this device.</AlertTitle>
            <AlertDescription>
              Logs are not uploaded automatically. They may include local paths and user content
              captured inside error messages or stack traces.
            </AlertDescription>
          </Alert>

          <Collapsible className="grid gap-2">
            <CollapsibleTrigger
              render={
                <Button variant="ghost" size="sm" className="group/summary justify-self-start" />
              }
            >
              <ChevronRightIcon
                data-icon="inline-start"
                className="transition-transform group-data-open/summary:rotate-90"
              />
              Show summary
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="diagnostics-summary">
                Diagnostics summary
              </Label>
              <Textarea
                className="min-h-36 resize-y font-mono text-xs leading-relaxed"
                id="diagnostics-summary"
                readOnly
                value={summaryText}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          {loadError && (
            <Button variant="outline" onClick={reloadSummary}>
              <RotateCcwIcon data-icon="inline-start" />
              Retry
            </Button>
          )}
          <Button variant="outline" disabled={!summary} onClick={openLogsFolder}>
            <FolderOpenIcon data-icon="inline-start" />
            Open logs folder
          </Button>
          <Button disabled={!summary} onClick={copySummary}>
            <CopyIcon data-icon="inline-start" />
            Copy summary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DiagnosticFactProps {
  children: ReactNode;
  loading: boolean;
  mono?: boolean;
  term: string;
}

function DiagnosticFact({ children, loading, mono = false, term }: DiagnosticFactProps) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={cn("min-w-0 break-all", mono && "font-mono text-xs")}>
        {loading ? <Skeleton className="h-4 w-48" /> : children}
      </dd>
    </div>
  );
}
