import { readFile } from "node:fs/promises";

export interface DesktopE2ERunContext {
  document: {
    initialMarker: string;
    path: string;
    savedMarkdown: string;
    savedMarker: string;
  };
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
