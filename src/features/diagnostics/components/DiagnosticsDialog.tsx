import { openPath } from "@tauri-apps/plugin-opener";
import { CopyIcon, FolderOpenIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { getErrorDescription, notifyOperationFailure } from "@/lib/errors";
import { formatFileSize } from "@/lib/formatFileSize";
import { notifySuccess } from "@/lib/toast";

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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Diagnostics</DialogTitle>
          <DialogDescription>
            Diagnostics stay on this device. Logs are not uploaded automatically. Logs may include
            local paths and user content captured inside error messages or stack traces.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="diagnostics-summary"
            >
              Diagnostics summary
            </label>
            <Textarea
              className="min-h-52 resize-y font-mono text-xs leading-relaxed"
              id="diagnostics-summary"
              readOnly
              value={loading && !summary ? "Loading diagnostics..." : summaryText}
            />
          </div>

          {summary && (
            <dl className="grid gap-2 rounded-lg border border-border bg-card/40 p-3 text-xs">
              <div className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <dt className="font-medium text-muted-foreground">Logs folder</dt>
                <dd className="min-w-0 font-mono break-all">{summary.logDirectoryPath}</dd>
              </div>
              <div className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <dt className="font-medium text-muted-foreground">Current log</dt>
                <dd className="min-w-0 font-mono break-all">{summary.logFilePath}</dd>
              </div>
              <div className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <dt className="font-medium text-muted-foreground">Retention</dt>
                <dd className="min-w-0">
                  {`Current log plus ${summary.logFileCount} retained files, ${formatFileSize(summary.logMaxFileSizeBytes)} each`}
                </dd>
              </div>
            </dl>
          )}

          {loadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {loadError}
            </div>
          )}
        </div>

        <DialogFooter showCloseButton>
          {loadError && (
            <Button variant="outline" onClick={reloadSummary}>
              <RotateCcwIcon />
              Retry
            </Button>
          )}
          <Button variant="outline" disabled={!summary} onClick={openLogsFolder}>
            <FolderOpenIcon />
            Open logs folder
          </Button>
          <Button disabled={!summary} onClick={copySummary}>
            <CopyIcon />
            Copy summary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
