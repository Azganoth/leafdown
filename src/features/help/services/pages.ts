import fileAndFolderWorkflows from "../../../../docs/help/file-and-folder-workflows.md?raw";
import gettingStarted from "../../../../docs/help/getting-started.md?raw";
import markdownReference from "../../../../docs/help/markdown-reference.md?raw";
import settingsReference from "../../../../docs/help/settings-reference.md?raw";

export const HELP_PAGES = {
  "getting-started": gettingStarted,
  "markdown-reference": markdownReference,
  "file-and-folder-workflows": fileAndFolderWorkflows,
  "settings-reference": settingsReference,
} as const;

export type HelpPageId = keyof typeof HELP_PAGES;

export interface HelpPageSection {
  id: string;
  label: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const SECTION_HEADING = /^## +(.+?)(?: +#+)? *$/u;

export const getHelpSectionId = (label: string) =>
  `help-${label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/gu, "")}`;

export const getHelpPageSections = (source: string): HelpPageSection[] => {
  const sections: HelpPageSection[] = [];
  let fence: string | null = null;
  for (const line of source.split(/\r?\n/u)) {
    const marker = FENCE.exec(line)?.[1];
    if (marker) {
      if (!fence) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    const heading = fence ? null : SECTION_HEADING.exec(line);
    if (heading) {
      const label = heading[1].replace(/[*_`]/gu, "");
      sections.push({ id: getHelpSectionId(label), label });
    }
  }
  return sections;
};

export const getHelpLinkTarget = (href: string) => {
  const section = /^#(.+)$/u.exec(href);
  if (section) {
    return { kind: "section" as const, id: getHelpSectionId(decodeURIComponent(section[1])) };
  }

  const internal = /^(?:\.\/)?([a-z-]+)\.md$/u.exec(href);
  if (internal && Object.hasOwn(HELP_PAGES, internal[1])) {
    return { kind: "internal" as const, page: internal[1] as HelpPageId };
  }

  try {
    const url = new URL(href);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) {
      return { kind: "external" as const, url: url.href };
    }
  } catch {
    return null;
  }

  return null;
};
