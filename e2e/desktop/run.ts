import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import type { DesktopE2ERunContext } from "./support/runContext.js";
import { WEBDRIVER_PORT } from "./support/suite.js";

interface Scenario {
  name: string;
  prepareState: (context: DesktopE2ERunContext) => Promise<void>;
  spec: string;
}

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const runLabel = `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${process.pid}`;
const artifactsRoot = path.join(repositoryRoot, "e2e", "desktop", "artifacts", runLabel);
const contextPath = path.join(artifactsRoot, "run-context.json");
const e2eStoreDirectory = path.join(
  process.env.APPDATA ?? "",
  "com.azganoth.leafdown.e2e",
  "tauri-plugin-zustand",
);
const recentItemsPath = path.join(e2eStoreDirectory, "recent-items.dev.json");
const settingsPath = path.join(e2eStoreDirectory, "settings.dev.json");

const initialSettings = {
  articleSortOrder: "name",
  autoPairBracketsAndQuotes: true,
  defaultNewDocumentExtension: ".md",
  defaultNewDocumentLineEnding: "crlf",
  ignoredDirectories: [".git", ".hg", ".svn", "node_modules", "target", "dist", "build", ".cache"],
  indexFileNames: ["readme", "index"],
  insertFinalNewline: true,
  recordRecentItems: true,
  sidebarVisible: true,
  softWrapCodeBlocks: false,
  theme: "system",
  version: 1,
};

const writeJson = (filePath: string, value: unknown) =>
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);

const resetPersistedState = async (recentFiles: string[] = [], recentFolders: string[] = []) => {
  await rm(e2eStoreDirectory, { force: true, recursive: true });
  await mkdir(e2eStoreDirectory, { recursive: true });
  await Promise.all([
    writeJson(recentItemsPath, { recentFiles, recentFolders, version: 1 }),
    writeJson(settingsPath, initialSettings),
  ]);
};

const runWdio = (scenario: Scenario) =>
  new Promise<void>((resolve, reject) => {
    const wdioExecutable = path.join(
      repositoryRoot,
      "node_modules",
      "@wdio",
      "cli",
      "bin",
      "wdio.js",
    );

    const child = spawn(process.execPath, [wdioExecutable, "run", "e2e/desktop/wdio.conf.ts"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        LEAFDOWN_E2E_ARTIFACT_RUN: runLabel,
        LEAFDOWN_E2E_CONTEXT_PATH: contextPath,
        LEAFDOWN_E2E_SCENARIO: scenario.name,
        LEAFDOWN_E2E_SPEC: scenario.spec,
      },
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Desktop E2E scenario ${scenario.name} failed (code=${String(code)}, signal=${String(signal)}).`,
        ),
      );
    });
  });

const sha256 = (contents: Buffer | string) => createHash("sha256").update(contents).digest("hex");

const fileEvidence = async (filePath: string, expectedContents?: string) => {
  const expected =
    expectedContents === undefined
      ? {}
      : {
          expectedSha256: sha256(expectedContents),
          expectedSizeBytes: Buffer.byteLength(expectedContents),
        };

  try {
    const contents = await readFile(filePath);
    const metadata = await stat(filePath);

    return {
      ...expected,
      modifiedAt: metadata.mtime.toISOString(),
      path: filePath,
      sha256: sha256(contents),
      sizeBytes: metadata.size,
    };
  } catch (error) {
    return { ...expected, error: String(error), path: filePath };
  }
};

const isPortFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });

// The embedded driver releases the port asynchronously as it shuts down.
const waitForPortRelease = async (port: number, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isPortFree(port)) {
      return true;
    }

    await delay(250);
  }

  return isPortFree(port);
};

const main = async () => {
  if (!process.env.APPDATA) {
    throw new Error("APPDATA is required for the Windows-local desktop E2E suite.");
  }

  await mkdir(artifactsRoot, { recursive: true });

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "leafdown-desktop-e2e-"));
  const documentPath = path.join(temporaryRoot, "document-lifecycle.md");
  const folderPath = path.join(temporaryRoot, "folder-context");
  const initialFolderFileName = "readme.md";
  const initialFolderFilePath = path.join(folderPath, initialFolderFileName);
  const addedFolderFileName = "watcher-added.md";
  const addedFolderFilePath = path.join(folderPath, addedFolderFileName);
  const missingDocumentPath = path.join(temporaryRoot, "missing-document.md");
  const savedMarker = "Saved fixture marker.";
  const context: DesktopE2ERunContext = {
    document: {
      initialMarker: "Initial fixture marker.",
      path: documentPath,
      savedMarkdown: `${savedMarker}\n`,
      savedMarker,
    },
    folder: {
      addedFileName: addedFolderFileName,
      addedFilePath: addedFolderFilePath,
      addedMarker: "Watcher-added fixture marker.",
      initialFileName: initialFolderFileName,
      initialFilePath: initialFolderFilePath,
      initialMarker: "Folder index fixture marker.",
      path: folderPath,
    },
    missingDocumentPath,
    persistenceEvidencePath: path.join(artifactsRoot, "persistence-phase-one.json"),
    settingsPath,
    temporaryRoot,
  };

  await mkdir(folderPath, { recursive: true });
  await copyFile(
    path.join(repositoryRoot, "e2e", "desktop", "fixtures", "document-lifecycle.md"),
    documentPath,
  );
  await copyFile(
    path.join(repositoryRoot, "e2e", "desktop", "fixtures", "folder-context", "readme.md"),
    initialFolderFilePath,
  );
  await writeJson(contextPath, context);

  const scenarios: Scenario[] = [
    {
      name: "diagnostics",
      prepareState: () => resetPersistedState(),
      spec: "e2e/desktop/specs/diagnostics.e2e.ts",
    },
    {
      name: "document-lifecycle",
      prepareState: ({ document }) => resetPersistedState([document.path]),
      spec: "e2e/desktop/specs/document-lifecycle.e2e.ts",
    },
    {
      name: "folder-watcher",
      prepareState: ({ folder }) => resetPersistedState([], [folder.path]),
      spec: "e2e/desktop/specs/folder-watcher.e2e.ts",
    },
    {
      name: "missing-document-error",
      prepareState: ({ missingDocumentPath }) => resetPersistedState([missingDocumentPath]),
      spec: "e2e/desktop/specs/missing-document-error.e2e.ts",
    },
    {
      name: "persistence-write",
      prepareState: () => resetPersistedState(),
      spec: "e2e/desktop/specs/persistence-write.e2e.ts",
    },
    {
      name: "persistence-restart",
      prepareState: () => Promise.resolve(),
      spec: "e2e/desktop/specs/persistence-restart.e2e.ts",
    },
    {
      name: "window-lifecycle",
      prepareState: () => resetPersistedState(),
      spec: "e2e/desktop/specs/window-lifecycle.e2e.ts",
    },
  ];

  let scenarioError: unknown;

  try {
    for (const scenario of scenarios) {
      await scenario.prepareState(context);
      await runWdio(scenario);
    }
  } catch (error) {
    scenarioError = error;
  }

  // Gather evidence before the fixtures are removed.
  const fixtureEvidence = {
    completedAt: new Date().toISOString(),
    document: await fileEvidence(documentPath, context.document.savedMarkdown),
    folder: {
      addedDocument: await fileEvidence(addedFolderFilePath, `${context.folder.addedMarker}\n`),
      initialDocument: await fileEvidence(
        initialFolderFilePath,
        `${context.folder.initialMarker}\n`,
      ),
      path: folderPath,
    },
    missingDocument: await fileEvidence(missingDocumentPath),
    temporaryRoot,
  };

  await Promise.all([
    rm(temporaryRoot, { force: true, recursive: true }),
    rm(e2eStoreDirectory, { force: true, recursive: true }),
  ]);

  const webdriverPortReleased = await waitForPortRelease(WEBDRIVER_PORT);

  await writeJson(path.join(artifactsRoot, "fixture-manifest.json"), {
    ...fixtureEvidence,
    webdriverPortReleased,
  });

  if (scenarioError) {
    throw scenarioError;
  }

  if (!webdriverPortReleased) {
    throw new Error(
      `The desktop E2E suite left a listener on port ${WEBDRIVER_PORT}. Stop it before the next run.`,
    );
  }
};

await main();
