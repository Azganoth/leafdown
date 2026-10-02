import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpMarkdown } from "@/features/help";
import { useLocalization } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { getBundledChangelog, getCurrentReleaseNotes } from "../services/bundledChangelog";
import { useReleaseNotesStore } from "../stores/releaseNotes";

export function ReleaseNotesDialog() {
  const { t } = useLocalization();
  const currentVersion = useReleaseNotesStore((state) => state.currentVersion);
  const surface = useReleaseNotesStore((state) => state.surface);
  const setSurface = useReleaseNotesStore((state) => state.setSurface);
  const isChangelog = surface === "changelog";
  const source = isChangelog
    ? getBundledChangelog()
    : surface === "whatsNew" && currentVersion
      ? getCurrentReleaseNotes(currentVersion)
      : null;

  return (
    <Dialog open={surface !== null} onOpenChange={(open) => !open && setSurface(null)}>
      <DialogContent
        className={cn(
          "flex min-h-0 flex-col gap-4 sm:max-w-2xl",
          source && "h-[min(40rem,calc(100dvh-2rem))]",
        )}
      >
        <DialogHeader className="shrink-0 pr-10">
          <DialogTitle>
            {t(isChangelog ? "releaseNotes.changelogTitle" : "releaseNotes.whatsNewTitle")}
          </DialogTitle>
          <DialogDescription>
            {isChangelog
              ? t("releaseNotes.changelogDescription")
              : t("releaseNotes.whatsNewDescription", { version: currentVersion })}
          </DialogDescription>
        </DialogHeader>
        {source ? (
          <HelpMarkdown key={surface} source={source} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("releaseNotes.noNotes")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
