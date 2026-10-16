import changelog from "../../../../CHANGELOG.md?raw";

const SECTION_HEADING =
  /^## \[([^\]\r\n]+)\](?:[ \t]+-[ \t]+(\d{4})-(\d{2})-(\d{2})(?![\d-]))?[^\r\n]*$/gmu;
const GROUP_HEADING = /^### /u;
const HIGHLIGHTS_HEADING = /^### Highlights[ \t]*$/u;
const HIGHLIGHT_HEADING = /^#### (.+)$/u;
const ILLUSTRATION_LINE = /^!\[[^\]\r\n]*\]\(([^)\s]+)\)$/u;

const BUNDLED_ILLUSTRATIONS: ReadonlyMap<string, string> = new Map(
  Object.entries(
    import.meta.glob<string>("/src/features/release-notes/highlights/*.svg", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ).map(([path, markup]) => [path.slice(1), markup]),
);

export const UNRELEASED_VERSION = "Unreleased";

export interface ReleaseHighlight {
  title: string;
  body: string;
  illustration: string | null;
}

export interface ReleaseNotesPage {
  version: string;
  date: Date | null;
  highlights: ReleaseHighlight[];
  notes: string;
}

const hasUsableNotes = (content: string) =>
  content.split(/\r?\n/u).some((line) => line.trim() && !line.startsWith("#"));

const readHighlights = (lines: readonly string[], illustrations: ReadonlyMap<string, string>) => {
  const highlights: ReleaseHighlight[] = [];
  let current: { title: string; body: string[]; illustration: string | null } | null = null;
  const finish = () => {
    if (current) {
      highlights.push({ ...current, body: current.body.join("\n").trim() });
    }
  };

  for (const line of lines) {
    const heading = HIGHLIGHT_HEADING.exec(line);
    if (heading) {
      finish();
      current = { title: heading[1].trim(), body: [], illustration: null };
      continue;
    }
    if (!current) {
      continue;
    }

    const image = ILLUSTRATION_LINE.exec(line.trim());
    if (image) {
      current.illustration ??= illustrations.get(image[1].replace(/^\.\//u, "")) ?? null;
    } else {
      current.body.push(line);
    }
  }
  finish();
  return highlights;
};

const splitHighlights = (content: string, illustrations: ReadonlyMap<string, string>) => {
  const lines = content.split(/\r?\n/u);
  const start = lines.findIndex((line) => HIGHLIGHTS_HEADING.test(line));
  if (start === -1) {
    return { highlights: [], notes: content };
  }

  const length = lines.slice(start + 1).findIndex((line) => GROUP_HEADING.test(line));
  const end = length === -1 ? lines.length : start + 1 + length;
  const notes = [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim();
  return {
    highlights: readHighlights(lines.slice(start + 1, end), illustrations),
    notes: hasUsableNotes(notes) ? notes : "",
  };
};

export const getReleaseNotesPages = (
  source: string,
  development: boolean,
  illustrations: ReadonlyMap<string, string> = new Map(),
) => {
  const headings = [...source.matchAll(SECTION_HEADING)];
  return headings.flatMap((heading, index): ReleaseNotesPage[] => {
    const [line, version, year, month, day] = heading;
    if (version === UNRELEASED_VERSION && !development) {
      return [];
    }

    const start = heading.index + line.length;
    const end = headings[index + 1]?.index ?? source.length;
    const section = source.slice(start, end).trim();
    if (!hasUsableNotes(section)) {
      return [];
    }

    const date = year ? new Date(Number(year), Number(month) - 1, Number(day)) : null;
    return [{ version, date, ...splitHighlights(section, illustrations) }];
  });
};

export const getCurrentReleaseNotesPage = (pages: readonly ReleaseNotesPage[], version: string) =>
  pages.find((page) => page.version === version) ??
  pages.find((page) => page.version === UNRELEASED_VERSION) ??
  null;

export const getBundledChangelog = () => changelog;

export const getBundledReleaseNotesPages = () =>
  getReleaseNotesPages(changelog, import.meta.env.DEV, BUNDLED_ILLUSTRATIONS);

export const getCurrentReleaseNotes = (version: string) =>
  getCurrentReleaseNotesPage(getBundledReleaseNotesPages(), version);
