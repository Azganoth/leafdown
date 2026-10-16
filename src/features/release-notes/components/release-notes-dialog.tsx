import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpMarkdown } from "@/features/help";
import { useLocalization } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import {
  getBundledChangelog,
  getBundledReleaseNotesPages,
  getCurrentReleaseNotesPage,
  UNRELEASED_VERSION,
  type ReleaseNotesPage,
} from "../services/bundledChangelog";
import { useReleaseNotesStore, type ReleaseNotesSurface } from "../stores/releaseNotes";

type WhatsNewPage = ReleaseNotesPage | { version: string; date: null; notes: null };

const DIALOG_HEIGHT = "h-[min(40rem,calc(100dvh-2rem))]";

const toDateTime = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

export function ReleaseNotesDialog() {
  const currentVersion = useReleaseNotesStore((state) => state.currentVersion);
  const surface = useReleaseNotesStore((state) => state.surface);
  const setSurface = useReleaseNotesStore((state) => state.setSurface);
  const [previousSurface, setPreviousSurface] = useState(surface);
  const [shown, setShown] = useState<{ surface: ReleaseNotesSurface; opening: number }>({
    surface,
    opening: 0,
  });
  if (surface !== previousSurface) {
    setPreviousSurface(surface);
    if (surface) {
      setShown({ surface, opening: shown.opening + 1 });
    }
  }

  return (
    <Dialog open={surface !== null} onOpenChange={(open) => !open && setSurface(null)}>
      {shown.surface === "changelog" ? (
        <ChangelogContent />
      ) : shown.surface === "whatsNew" ? (
        <WhatsNewContent key={shown.opening} version={currentVersion} />
      ) : null}
    </Dialog>
  );
}

function ChangelogContent() {
  const { t } = useLocalization();

  return (
    <DialogContent className={cn("flex min-h-0 flex-col gap-4 sm:max-w-2xl", DIALOG_HEIGHT)}>
      <DialogHeader className="shrink-0 pr-10">
        <DialogTitle>{t("releaseNotes.changelogTitle")}</DialogTitle>
        <DialogDescription>{t("releaseNotes.changelogDescription")}</DialogDescription>
      </DialogHeader>
      <HelpMarkdown source={getBundledChangelog()} />
    </DialogContent>
  );
}

function WhatsNewContent({ version }: { version: string }) {
  const { t } = useLocalization();
  const releasePages = getBundledReleaseNotesPages();
  const currentPage = getCurrentReleaseNotesPage(releasePages, version);
  const pages: WhatsNewPage[] = currentPage
    ? releasePages
    : [{ version, date: null, notes: null }, ...releasePages];
  const [shownVersion, setShownVersion] = useState(currentPage?.version ?? version);
  const index = Math.max(
    0,
    pages.findIndex((page) => page.version === shownVersion),
  );
  const page = pages[index];
  const newer = pages[index - 1];
  const older = pages[index + 1];
  const pageLabel = (candidate: WhatsNewPage) =>
    candidate.version === UNRELEASED_VERSION ? t("releaseNotes.unreleased") : candidate.version;
  const options = pages.map((candidate) => ({
    label: pageLabel(candidate),
    value: candidate.version,
  }));

  return (
    <DialogContent
      className={cn(
        "flex min-h-0 flex-col gap-4 sm:max-w-2xl",
        pages.some((candidate) => candidate.notes) && DIALOG_HEIGHT,
      )}
    >
      <DialogHeader className="shrink-0 pr-10">
        <DialogTitle>{t("releaseNotes.whatsNewTitle")}</DialogTitle>
        <DialogDescription className="flex flex-wrap gap-x-2">
          {page.version === UNRELEASED_VERSION ? (
            <span>{t("releaseNotes.unreleasedDescription")}</span>
          ) : (
            <span>{t("releaseNotes.whatsNewDescription", { version: page.version })}</span>
          )}
          {page.date && (
            <>
              <span aria-hidden>·</span>
              <time dateTime={toDateTime(page.date)}>
                {t("releaseNotes.releaseDate", { date: page.date })}
              </time>
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      {page.notes ? (
        <HelpMarkdown key={page.version} source={page.notes} />
      ) : (
        <p className="min-h-0 flex-1 text-sm text-muted-foreground">{t("releaseNotes.noNotes")}</p>
      )}
      {pages.length > 1 && (
        <nav
          aria-label={t("releaseNotes.releaseNavigation")}
          className="-mx-6 -mb-6 flex shrink-0 items-center justify-between gap-2 rounded-b-xl border-t bg-muted/50 px-4 py-3"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="data-disabled:pointer-events-none data-disabled:opacity-50"
            focusableWhenDisabled
            disabled={!newer}
            aria-label={
              newer ? t("releaseNotes.newerRelease", { version: pageLabel(newer) }) : undefined
            }
            onClick={() => newer && setShownVersion(newer.version)}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            {newer ? pageLabel(newer) : t("releaseNotes.newer")}
          </Button>
          <Select
            items={options}
            value={page.version}
            onValueChange={(value) => {
              if (value) {
                setShownVersion(value);
              }
            }}
          >
            <SelectTrigger size="sm" aria-label={t("releaseNotes.release")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="data-disabled:pointer-events-none data-disabled:opacity-50"
            focusableWhenDisabled
            disabled={!older}
            aria-label={
              older ? t("releaseNotes.olderRelease", { version: pageLabel(older) }) : undefined
            }
            onClick={() => older && setShownVersion(older.version)}
          >
            {older ? pageLabel(older) : t("releaseNotes.older")}
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </nav>
      )}
    </DialogContent>
  );
}
