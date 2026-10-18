import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HelpMarkdownFragment,
  HelpPageBody,
  HelpPageContent,
  HelpPageHeader,
} from "@/features/help";
import { useLocalization } from "@/lib/i18n";

import {
  getBundledChangelog,
  getBundledChangelogPages,
  getBundledReleaseNotesPages,
  getCurrentReleaseNotesPage,
  UNRELEASED_VERSION,
  type ReleaseNotesPage,
} from "../services/bundledChangelog";
import { useReleaseNotesStore, type ReleaseNotesSurface } from "../stores/releaseNotes";
import { ReleaseChangeEntry, ReleaseChangeList, ReleaseChanges } from "./release-changes";
import { ReleaseHighlights } from "./release-highlights";

type WhatsNewPage = ReleaseNotesPage | { version: string; date: null; highlights: []; notes: null };

const toDateTime = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const releaseSectionId = (version: string) => `release-${version.replace(/[^\w.-]+/gu, "-")}`;

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

function ReleaseDate({ date }: { date: Date }) {
  const { t } = useLocalization();
  return <time dateTime={toDateTime(date)}>{t("releaseNotes.releaseDate", { date })}</time>;
}

function ChangelogContent() {
  const { t } = useLocalization();
  const pages = getBundledChangelogPages();
  const source = getBundledChangelog();
  const intro = source.slice(source.search(/\r?\n/u) + 1, source.search(/^## /mu)).trim();
  const label = (page: ReleaseNotesPage) =>
    page.version === UNRELEASED_VERSION ? t("releaseNotes.unreleased") : page.version;

  return (
    <HelpPageContent kind="guide">
      <HelpPageHeader
        title={t("releaseNotes.changelogTitle")}
        description={t("releaseNotes.changelogDescription")}
      />
      <HelpPageBody
        kind="guide"
        sections={pages.map((page) => ({ id: releaseSectionId(page.version), label: label(page) }))}
      >
        <HelpMarkdownFragment source={intro} />
        {pages.map((page) => (
          <section
            key={page.version}
            aria-labelledby={releaseSectionId(page.version)}
            className="mt-14 first-of-type:mt-10"
          >
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3
                id={releaseSectionId(page.version)}
                tabIndex={-1}
                className="scroll-mt-6 text-xl font-semibold tracking-tight outline-none"
              >
                {label(page)}
              </h3>
              {page.date && (
                <span className="text-sm text-muted-foreground">
                  <ReleaseDate date={page.date} />
                </span>
              )}
            </div>
            <div className="space-y-8">
              {page.highlights.length > 0 && (
                <section aria-label={t("releaseNotes.highlights")}>
                  <h4 className="border-b pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("releaseNotes.highlights")}
                  </h4>
                  <ReleaseChangeList>
                    {page.highlights.map((highlight) => (
                      <li key={highlight.title} className="py-3">
                        <ReleaseChangeEntry entry={`${highlight.title}. ${highlight.body}`} />
                      </li>
                    ))}
                  </ReleaseChangeList>
                </section>
              )}
              <ReleaseChanges notes={page.notes} />
            </div>
          </section>
        ))}
      </HelpPageBody>
    </HelpPageContent>
  );
}

function WhatsNewContent({ version }: { version: string }) {
  const { t } = useLocalization();
  const releasePages = getBundledReleaseNotesPages();
  const currentPage = getCurrentReleaseNotesPage(releasePages, version);
  const pages: WhatsNewPage[] = currentPage
    ? releasePages
    : [{ version, date: null, highlights: [], notes: null }, ...releasePages];
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
    <HelpPageContent
      kind="release"
      fitContent={pages.every((candidate) => candidate.notes === null)}
    >
      <HelpPageHeader
        title={t("releaseNotes.whatsNewTitle")}
        descriptionClassName="flex flex-wrap gap-x-2"
        description={
          <>
            {page.version === UNRELEASED_VERSION ? (
              <span>{t("releaseNotes.unreleasedDescription")}</span>
            ) : (
              <span>{t("releaseNotes.whatsNewDescription", { version: page.version })}</span>
            )}
            {page.date && (
              <>
                <span aria-hidden>·</span>
                <ReleaseDate date={page.date} />
              </>
            )}
          </>
        }
      />
      {page.notes === null ? (
        <p className="min-h-0 flex-1 px-5 py-6 text-sm text-muted-foreground sm:px-8">
          {t("releaseNotes.noNotes")}
        </p>
      ) : (
        <HelpPageBody key={page.version} kind="release">
          {page.highlights.length > 0 && (
            <>
              <ReleaseHighlights highlights={page.highlights} />
              {page.notes && (
                <h3 className="mt-12 mb-5 text-lg font-semibold tracking-tight">
                  {t("releaseNotes.allChanges")}
                </h3>
              )}
            </>
          )}
          <ReleaseChanges notes={page.notes} collapseFixed />
        </HelpPageBody>
      )}
      {pages.length > 1 && (
        <nav
          aria-label={t("releaseNotes.releaseNavigation")}
          className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/50 px-4 py-2.5"
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
    </HelpPageContent>
  );
}
