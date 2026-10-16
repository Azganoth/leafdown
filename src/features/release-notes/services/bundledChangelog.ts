import changelog from "../../../../CHANGELOG.md?raw";

const SECTION_HEADING =
  /^## \[([^\]\r\n]+)\](?:[ \t]+-[ \t]+(\d{4})-(\d{2})-(\d{2})(?![\d-]))?[^\r\n]*$/gmu;

export const UNRELEASED_VERSION = "Unreleased";

export interface ReleaseNotesPage {
  version: string;
  date: Date | null;
  notes: string;
}

const hasUsableNotes = (content: string) =>
  content.split(/\r?\n/u).some((line) => line.trim() && !line.startsWith("#"));

export const getReleaseNotesPages = (source: string, development: boolean) => {
  const headings = [...source.matchAll(SECTION_HEADING)];
  return headings.flatMap((heading, index): ReleaseNotesPage[] => {
    const [line, version, year, month, day] = heading;
    if (version === UNRELEASED_VERSION && !development) {
      return [];
    }

    const start = heading.index + line.length;
    const end = headings[index + 1]?.index ?? source.length;
    const notes = source.slice(start, end).trim();
    if (!hasUsableNotes(notes)) {
      return [];
    }

    const date = year ? new Date(Number(year), Number(month) - 1, Number(day)) : null;
    return [{ version, date, notes }];
  });
};

export const getCurrentReleaseNotesPage = (pages: readonly ReleaseNotesPage[], version: string) =>
  pages.find((page) => page.version === version) ??
  pages.find((page) => page.version === UNRELEASED_VERSION) ??
  null;

export const getBundledChangelog = () => changelog;

export const getBundledReleaseNotesPages = () =>
  getReleaseNotesPages(changelog, import.meta.env.DEV);

export const getCurrentReleaseNotes = (version: string) =>
  getCurrentReleaseNotesPage(getBundledReleaseNotesPages(), version);
