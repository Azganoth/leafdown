import { readFile } from "node:fs/promises";

export interface DesktopE2ERunContext {
  appIdentifier: string;
  blocks: { path: string };
  modifierClick: { path: string };
  callouts: { path: string };
  citations: { path: string };
  frontmatter: { yamlPath: string; tomlPath: string; jsonPath: string };
  definitionList: { path: string };
  separator: { path: string };
  html: { path: string };
  math: { path: string };
  mathCorpus: { path: string };
  mermaid: { path: string };
  legacyEncoding: { path: string };
  launchDocument: { folderPath: string; marker: string; path: string; siblingFileName: string };
  document: {
    initialMarker: string;
    path: string;
    scrollPath: string;
    savedMarkdown: string;
    savedMarker: string;
  };
  documentWatcher: { path: string };
  search: { path: string };
  outline: { path: string };
  images: {
    path: string;
  };
  remoteImages: {
    certificatePath: string;
    host: string;
    imagePath: string;
    keyPath: string;
    path: string;
  };
  folderActions: { path: string };
  folderSearch: { folderPath: string; nearPath: string; farPath: string };
  wikiLinks: { folderPath: string; indexPath: string };
  folder: {
    addedFileName: string;
    addedFilePath: string;
    addedMarker: string;
    initialFileName: string;
    initialFilePath: string;
    initialMarker: string;
    path: string;
  };
  missingDocumentPath: string;
  settingsPath: string;
  releaseNotesPath: string;
  temporaryRoot: string;
}

let cachedRunContext: DesktopE2ERunContext | null = null;

export const getDesktopE2ERunContext = async () => {
  if (cachedRunContext) {
    return cachedRunContext;
  }

  const contextPath = process.env.LEAFDOWN_E2E_CONTEXT_PATH;

  if (!contextPath) {
    throw new Error("LEAFDOWN_E2E_CONTEXT_PATH is required for fixture-backed desktop E2E tests.");
  }

  cachedRunContext = JSON.parse(await readFile(contextPath, "utf8")) as DesktopE2ERunContext;

  return cachedRunContext;
};
