import changelog from "../../../../CHANGELOG.md?raw";

const SECTION_HEADING = /^## \[([^\]\r\n]+)\][^\r\n]*$/gmu;

export const getReleaseNotesSection = (source: string, version: string, development: boolean) => {
  const headings = [...source.matchAll(SECTION_HEADING)];
  const section = (name: string) => {
    const index = headings.findIndex((heading) => heading[1] === name);
    if (index < 0) {
      return null;
    }

    const start = headings[index].index + headings[index][0].length;
    const end = headings[index + 1]?.index ?? source.length;
    const content = source.slice(start, end).trim();
    return content.split(/\r?\n/u).some((line) => line.trim() && !line.startsWith("#"))
      ? content
      : null;
  };

  return section(version) ?? (development ? section("Unreleased") : null);
};

export const getBundledChangelog = () => changelog;

export const getCurrentReleaseNotes = (version: string) =>
  getReleaseNotesSection(changelog, version, import.meta.env.DEV);
