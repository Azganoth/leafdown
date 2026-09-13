import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLinkIcon, ScaleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyOperationFailure } from "@/lib/errors";

const REPOSITORY_URL = "https://github.com/Azganoth/leafdown";
const LICENSE_URL = "https://www.gnu.org/licenses/gpl-3.0.html";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const openExternal = async (url: string) => {
  try {
    await openUrl(url);
  } catch (error) {
    notifyOperationFailure("Could not open the link.", error, "about.openUrl");
  }
};

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const version = useAppVersion(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-sm">
        <DialogHeader className="items-center gap-3 text-center">
          <img src="/app-icon.svg" alt="" className="size-14" />
          <DialogTitle className="text-2xl">Leafdown</DialogTitle>
          {version ? (
            <Badge variant="secondary" className="font-mono">
              {version}
            </Badge>
          ) : (
            <Skeleton className="h-5 w-24 rounded-md" />
          )}
          <DialogDescription className="text-balance">
            A local-first Markdown editor for ordinary files and folders.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ScaleIcon className="size-3.5" />
          GPL-3.0-or-later
        </div>

        <DialogFooter className="sm:justify-center">
          <Button type="button" variant="outline" onClick={() => openExternal(LICENSE_URL)}>
            License
          </Button>
          <Button type="button" variant="outline" onClick={() => openExternal(REPOSITORY_URL)}>
            <ExternalLinkIcon data-icon="inline-start" />
            Repository
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useAppVersion(open: boolean) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!open || version) {
      return undefined;
    }

    let cancelled = false;

    const loadVersion = async () => {
      try {
        const nextVersion = await getVersion();

        if (!cancelled) {
          setVersion(nextVersion);
        }
      } catch (error) {
        notifyOperationFailure("Could not read the app version.", error, "about.getVersion");
      }
    };

    void loadVersion();

    return () => {
      cancelled = true;
    };
  }, [open, version]);

  return version;
}
