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

export const getHelpLinkTarget = (href: string) => {
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
