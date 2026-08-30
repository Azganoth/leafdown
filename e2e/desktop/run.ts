import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import type { DesktopE2ERunContext } from "./support/runContext.js";
import { RUN_LABEL, WEBDRIVER_PORT } from "./support/suite.js";

interface Scenario {
  name: string;
  continues?: string;
  recentFiles?: string[];
  recentFolders?: string[];
}

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const artifactsRoot = path.join(repositoryRoot, "e2e", "desktop", "artifacts", RUN_LABEL);
const contextPath = path.join(artifactsRoot, "run-context.json");
const e2eAppDataDirectory = path.join(process.env.APPDATA ?? "", "com.azganoth.leafdown.e2e");
const e2eStoreDirectory = path.join(e2eAppDataDirectory, "tauri-plugin-zustand");
const recentItemsPath = path.join(e2eStoreDirectory, "recent-items.dev.json");
const settingsPath = path.join(e2eStoreDirectory, "settings.dev.json");

const writeJson = (filePath: string, value: unknown) =>
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);

const resetPersistedState = async (recentFiles: string[] = [], recentFolders: string[] = []) => {
  await rm(e2eStoreDirectory, { force: true, recursive: true });
  await mkdir(e2eStoreDirectory, { recursive: true });
  await writeJson(recentItemsPath, { recentFiles, recentFolders, version: 1 });
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
        LEAFDOWN_E2E_ARTIFACT_RUN: RUN_LABEL,
        LEAFDOWN_E2E_CONTEXT_PATH: contextPath,
        LEAFDOWN_E2E_SCENARIO: scenario.name,
        LEAFDOWN_E2E_SPEC: `e2e/desktop/specs/${scenario.name}.spec.ts`,
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
    const { mtime, size } = await stat(filePath);

    return {
      ...expected,
      modifiedAt: mtime.toISOString(),
      path: filePath,
      sha256: sha256(contents),
      sizeBytes: size,
    };
  } catch (error) {
    return { ...expected, error: String(error), path: filePath };
  }
};

const isPortFree = () =>
  new Promise<boolean>((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(WEBDRIVER_PORT, "127.0.0.1");
  });

// The embedded driver releases the port asynchronously as it shuts down.
const waitForPortRelease = async (timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;

  while (!(await isPortFree())) {
    if (Date.now() > deadline) {
      return false;
    }

    await delay(250);
  }

  return true;
};

const main = async () => {
  if (!process.env.APPDATA) {
    throw new Error("APPDATA is required for the Windows desktop E2E suite.");
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
    { name: "diagnostics" },
    { name: "document-lifecycle", recentFiles: [documentPath] },
    { name: "folder-watcher", recentFolders: [folderPath] },
    { name: "missing-document-error", recentFiles: [missingDocumentPath] },
    { name: "persistence-write" },
    { name: "persistence-restart", continues: "persistence-write" },
    { name: "window-lifecycle" },
  ];

  try {
    for (const [index, scenario] of scenarios.entries()) {
      if (scenario.continues) {
        if (scenario.continues !== scenarios[index - 1]?.name) {
          throw new Error(
            `Scenario ${scenario.name} must run directly after ${scenario.continues}.`,
          );
        }
      } else {
        await resetPersistedState(scenario.recentFiles, scenario.recentFolders);
      }

      await runWdio(scenario);

      if (!(await waitForPortRelease())) {
        throw new Error(
          `Scenario ${scenario.name} left a listener on port ${WEBDRIVER_PORT}. Stop it before the next run.`,
        );
      }
    }
  } catch (error) {
    await writeJson(path.join(artifactsRoot, "fixture-manifest.json"), {
      document: await fileEvidence(documentPath, context.document.savedMarkdown),
      failedAt: new Date().toISOString(),
      folderAddedDocument: await fileEvidence(
        addedFolderFilePath,
        `${context.folder.addedMarker}\n`,
      ),
      folderInitialDocument: await fileEvidence(
        initialFolderFilePath,
        `${context.folder.initialMarker}\n`,
      ),
      missingDocument: await fileEvidence(missingDocumentPath),
      temporaryRoot,
    });

    throw error;
  } finally {
    await Promise.all([
      rm(temporaryRoot, { force: true, recursive: true }),
      rm(e2eAppDataDirectory, { force: true, recursive: true }),
    ]);
  }
};

await main();
