import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import type { DesktopE2ERunContext } from "./support/runContext.js";
import { selectDesktopE2ERun } from "./support/scenarioSelection.js";
import { RUN_LABEL, WEBDRIVER_BASE_PORT } from "./support/suite.js";
import { runWorkerPool } from "./support/workerPool.js";

interface Scenario {
  name: string;
  continues?: string;
  recentFiles?: string[];
  recentFolders?: string[];
}

interface WorkerContext {
  appDataDirectory: string;
  artifactsRoot: string;
  context: DesktopE2ERunContext;
  contextPath: string;
  label: string;
  localDataDirectory: string;
  port: number;
  scenarios: Map<string, Scenario>;
  storeDirectory: string;
  temporaryRoot: string;
}

const selection = selectDesktopE2ERun(process.argv.slice(2));
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const artifactsRoot = path.join(repositoryRoot, "e2e", "desktop", "artifacts", RUN_LABEL);
const remoteImageFixtureRoot = path.join(
  repositoryRoot,
  "e2e",
  "desktop",
  "fixtures",
  "remote-images",
);
const REMOTE_IMAGE_HOST = "remote-images.leafdown.test";

const writeJson = (filePath: string, value: unknown) =>
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);

const rejectedReasons = (results: PromiseSettledResult<unknown>[]): unknown[] =>
  results.flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []));

const settleTasks = async (description: string, tasks: Promise<unknown>[]) => {
  const failures = rejectedReasons(await Promise.allSettled(tasks));

  if (failures.length > 0) {
    throw new AggregateError(failures, description);
  }
};

const removeDirectories = async (directories: string[]) => {
  const results = await Promise.allSettled(
    directories.map((directory) =>
      rm(directory, { force: true, maxRetries: 20, recursive: true, retryDelay: 250 }),
    ),
  );

  return rejectedReasons(results);
};

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

const isPortFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });

const waitForPortRelease = async (port: number, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;

  while (!(await isPortFree(port))) {
    if (Date.now() > deadline) {
      return false;
    }

    await delay(250);
  }

  return true;
};

const createWorkerContext = async (workerIndex: number): Promise<WorkerContext> => {
  const label = `worker-${workerIndex + 1}`;
  const appIdentifier = `com.azganoth.leafdown.e2e.w${workerIndex + 1}.p${process.pid}`;
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), `leafdown-desktop-e2e-${label}-`));
  const fixtureRoot = path.join(temporaryRoot, "fixtures");
  const appDataDirectory = path.join(process.env.APPDATA ?? "", appIdentifier);
  const localDataDirectory = path.join(process.env.LOCALAPPDATA ?? "", appIdentifier);
  const contextPath = path.join(temporaryRoot, "run-context.json");
  const workerArtifactsRoot = path.join(artifactsRoot, label);
  const storeDirectory = path.join(appDataDirectory, "tauri-plugin-zustand");
  const settingsPath = path.join(storeDirectory, "settings.dev.json");
  const documentPath = path.join(fixtureRoot, "document-lifecycle.md");
  const blocksPath = path.join(fixtureRoot, "block-selection.md");
  const separatorPath = path.join(fixtureRoot, "separator-presentation.md");
  const imagesPath = path.join(fixtureRoot, "rendered-images.md");
  const remoteImagesPath = path.join(fixtureRoot, "remote-images.md");
  const htmlPath = path.join(fixtureRoot, "rendered-html.md");
  const leafImagePath = path.join(fixtureRoot, "leaf.svg");
  const tinyImagePath = path.join(fixtureRoot, "tiny-transparent.svg");
  const folderPath = path.join(fixtureRoot, "folder-context");
  const actionsFolderPath = path.join(fixtureRoot, "folder-actions");
  const initialFolderFileName = "readme.md";
  const initialFolderFilePath = path.join(folderPath, initialFolderFileName);
  const addedFolderFileName = "watcher-added.md";
  const addedFolderFilePath = path.join(folderPath, addedFolderFileName);
  const missingDocumentPath = path.join(fixtureRoot, "missing-document.md");
  const savedMarker = "Saved fixture marker.";
  const context: DesktopE2ERunContext = {
    appIdentifier,
    blocks: { path: blocksPath },
    separator: { path: separatorPath },
    document: {
      initialMarker: "Initial fixture marker.",
      path: documentPath,
      savedMarkdown: `${savedMarker}\n`,
      savedMarker,
    },
    images: { path: imagesPath },
    remoteImages: {
      certificatePath: path.join(remoteImageFixtureRoot, "server.pem"),
      host: REMOTE_IMAGE_HOST,
      imagePath: path.join(repositoryRoot, "src-tauri", "icons", "32x32.png"),
      keyPath: path.join(remoteImageFixtureRoot, "server.key"),
      path: remoteImagesPath,
    },
    html: { path: htmlPath },
    folderActions: { path: actionsFolderPath },
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
    temporaryRoot: fixtureRoot,
  };

  const scenarios: Scenario[] = [
    { name: "block-selection", recentFiles: [blocksPath] },
    { name: "diagnostics" },
    { name: "document-lifecycle", recentFiles: [documentPath] },
    { name: "folder-watcher", recentFolders: [folderPath] },
    { name: "folder-actions", recentFolders: [actionsFolderPath] },
    { name: "rendered-images", recentFiles: [imagesPath] },
    { name: "remote-images", recentFiles: [remoteImagesPath, imagesPath] },
    { name: "rendered-html", recentFiles: [htmlPath] },
    { name: "separator-presentation", recentFiles: [separatorPath] },
    { name: "support-links" },
    { name: "missing-document-error", recentFiles: [missingDocumentPath] },
    { name: "persistence-write", recentFolders: [folderPath] },
    { name: "persistence-restart", continues: "persistence-write" },
    { name: "window-lifecycle" },
  ];

  const worker: WorkerContext = {
    appDataDirectory,
    artifactsRoot: workerArtifactsRoot,
    context,
    contextPath,
    label,
    localDataDirectory,
    port: WEBDRIVER_BASE_PORT + workerIndex,
    scenarios: new Map(scenarios.map((scenario) => [scenario.name, scenario])),
    storeDirectory,
    temporaryRoot,
  };

  try {
    const staleStateCleanupErrors = await removeDirectories([appDataDirectory, localDataDirectory]);

    if (staleStateCleanupErrors.length > 0) {
      throw new AggregateError(
        staleStateCleanupErrors,
        `Failed to clear stale state for ${label}.`,
      );
    }

    await settleTasks(`Failed to create directories for ${label}.`, [
      mkdir(folderPath, { recursive: true }),
      mkdir(path.join(actionsFolderPath, "notes"), { recursive: true }),
      mkdir(workerArtifactsRoot, { recursive: true }),
    ]);
    await settleTasks(`Failed to create fixtures for ${label}.`, [
      copyFile(
        path.join(repositoryRoot, "e2e", "desktop", "fixtures", "block-selection.md"),
        blocksPath,
      ),
      copyFile(
        path.join(repositoryRoot, "e2e", "desktop", "fixtures", "separator-presentation.md"),
        separatorPath,
      ),
      copyFile(
        path.join(repositoryRoot, "e2e", "desktop", "fixtures", "rendered-html.md"),
        htmlPath,
      ),
      copyFile(
        path.join(repositoryRoot, "e2e", "desktop", "fixtures", "document-lifecycle.md"),
        documentPath,
      ),
      copyFile(
        path.join(repositoryRoot, "e2e", "desktop", "fixtures", "folder-context", "readme.md"),
        initialFolderFilePath,
      ),
      copyFile(path.join(repositoryRoot, "corpus", "assets", "leaf.svg"), leafImagePath),
      writeFile(
        tinyImagePath,
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><rect width="1" height="1" fill="transparent" /></svg>',
      ),
      writeFile(remoteImagesPath, ""),
      writeFile(path.join(actionsFolderPath, "readme.md"), "Actions fixture marker.\n"),
      writeFile(path.join(actionsFolderPath, "notes", "idea.md"), "Idea fixture marker.\n"),
      writeFile(
        imagesPath,
        [
          "![Missing SVG](./missing.svg)",
          "",
          "![Visible SVG](./leaf.svg)",
          "",
          "![Long description for a projected image source that exceeds the editor width and must stay on one line even while its source has separately colored runs](./leaf.svg)",
          "",
          "![Mixed SVG](./leaf.svg) The surrounding paragraph stays readable and wraps normally when this image source is being edited beside several words of ordinary text in the same paragraph.",
          "",
          "[![Linked SVG](./leaf.svg)](https://example.com)",
          "",
          "![Tiny transparent SVG](./tiny-transparent.svg)",
          "",
        ].join("\n"),
      ),
    ]);
    await writeJson(contextPath, context);

    return worker;
  } catch (error) {
    const cleanupErrors = await removeDirectories([
      appDataDirectory,
      localDataDirectory,
      temporaryRoot,
    ]);

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        `${label} setup failed and its state could not be fully cleaned.`,
        { cause: error },
      );
    }

    throw error;
  }
};

const resetPersistedState = async (
  worker: WorkerContext,
  recentFiles: string[] = [],
  recentFolders: string[] = [],
) => {
  await rm(worker.storeDirectory, { force: true, recursive: true });
  await mkdir(worker.storeDirectory, { recursive: true });
  await writeJson(path.join(worker.storeDirectory, "recent-items.dev.json"), {
    recentFiles,
    recentFolders,
    version: 1,
  });
};

const runWdio = (scenario: Scenario, worker: WorkerContext) =>
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
        LEAFDOWN_E2E_APP_IDENTIFIER: worker.context.appIdentifier,
        LEAFDOWN_E2E_ARTIFACT_RUN: RUN_LABEL,
        LEAFDOWN_E2E_CONTEXT_PATH: worker.contextPath,
        LEAFDOWN_E2E_REMOTE_IMAGE_ADDRESS: "127.0.0.1",
        LEAFDOWN_E2E_REMOTE_IMAGE_CERTIFICATE: path.join(remoteImageFixtureRoot, "ca.pem"),
        LEAFDOWN_E2E_REMOTE_IMAGE_HOST: REMOTE_IMAGE_HOST,
        LEAFDOWN_E2E_SCENARIO: scenario.name,
        LEAFDOWN_E2E_SPEC: `e2e/desktop/specs/${scenario.name}.spec.ts`,
        LEAFDOWN_E2E_WEBDRIVER_PORT: String(worker.port),
        LEAFDOWN_E2E_WORKER: worker.label,
        TAURI_WEBDRIVER_PORT: String(worker.port),
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
          `Desktop E2E scenario ${scenario.name} failed on ${worker.label} (code=${String(code)}, signal=${String(signal)}).`,
        ),
      );
    });
  });

const runScenario = async (scenario: Scenario, worker: WorkerContext) => {
  let scenarioError: unknown;

  try {
    await runWdio(scenario, worker);
  } catch (error) {
    scenarioError = error;
  }

  const portReleased = await waitForPortRelease(worker.port);

  if (!portReleased) {
    const portError = new Error(
      `Scenario ${scenario.name} left a listener on port ${worker.port}. Stop it before the next run.`,
    );

    if (scenarioError) {
      throw new AggregateError(
        [scenarioError, portError],
        `${scenario.name} failed and leaked its port.`,
      );
    }

    throw portError;
  }

  if (scenarioError) {
    throw scenarioError;
  }
};

const writeFixtureManifest = async (
  worker: WorkerContext,
  failedScenario: string,
  error: unknown,
) => {
  const { context } = worker;

  await writeJson(path.join(worker.artifactsRoot, "fixture-manifest.json"), {
    document: await fileEvidence(context.document.path, context.document.savedMarkdown),
    error: String(error),
    failedAt: new Date().toISOString(),
    failedScenario,
    folderAddedDocument: await fileEvidence(
      context.folder.addedFilePath,
      `${context.folder.addedMarker}\n`,
    ),
    folderInitialDocument: await fileEvidence(
      context.folder.initialFilePath,
      `${context.folder.initialMarker}\n`,
    ),
    missingDocument: await fileEvidence(context.missingDocumentPath),
    temporaryRoot: context.temporaryRoot,
    webdriverPort: worker.port,
    worker: worker.label,
  });
};

const runScenarioGroup = async (scenarioNames: string[], worker: WorkerContext) => {
  let activeScenarioName = scenarioNames[0] ?? "unknown";

  try {
    if (!(await isPortFree(worker.port))) {
      throw new Error(`WebDriver port ${worker.port} for ${worker.label} is already in use.`);
    }

    for (const [index, scenarioName] of scenarioNames.entries()) {
      activeScenarioName = scenarioName;
      const scenario = worker.scenarios.get(scenarioName);

      if (!scenario) {
        throw new Error(`Desktop E2E scenario configuration is missing: ${scenarioName}.`);
      }

      if (scenario.continues) {
        if (scenario.continues !== scenarioNames[index - 1]) {
          throw new Error(
            `Scenario ${scenario.name} must run directly after ${scenario.continues} on one worker.`,
          );
        }
      } else {
        await resetPersistedState(worker, scenario.recentFiles, scenario.recentFolders);
      }

      await runScenario(scenario, worker);
    }
  } catch (error) {
    await writeFixtureManifest(worker, activeScenarioName, error);
    throw error;
  }
};

const main = async () => {
  if (!process.env.APPDATA || !process.env.LOCALAPPDATA) {
    throw new Error("APPDATA and LOCALAPPDATA are required for the Windows desktop E2E suite.");
  }

  await mkdir(artifactsRoot, { recursive: true });

  const effectiveWorkerCount = Math.min(selection.workerCount, selection.scenarioGroups.length);
  const workers: WorkerContext[] = [];
  let runError: unknown;
  let runFailed = false;

  try {
    for (let index = 0; index < effectiveWorkerCount; index += 1) {
      workers.push(await createWorkerContext(index));
    }

    const failures = await runWorkerPool({
      groups: selection.scenarioGroups,
      runGroup: (scenarioNames, workerIndex) =>
        runScenarioGroup(scenarioNames, workers[workerIndex]),
      workerCount: effectiveWorkerCount,
    });

    if (failures.length > 0) {
      throw new AggregateError(
        failures.map(({ error }) => error),
        `${failures.length} desktop E2E scenario group${failures.length === 1 ? "" : "s"} failed.`,
      );
    }
  } catch (error) {
    runError = error;
    runFailed = true;
  }

  const cleanupErrors = await removeDirectories(
    workers.flatMap(({ appDataDirectory, localDataDirectory, temporaryRoot }) => [
      appDataDirectory,
      localDataDirectory,
      temporaryRoot,
    ]),
  );

  if (runFailed && cleanupErrors.length > 0) {
    throw new AggregateError(
      [runError, ...cleanupErrors],
      "The desktop E2E run failed and its state could not be fully cleaned.",
      { cause: runError },
    );
  }

  if (runFailed) {
    throw runError;
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "The desktop E2E state could not be fully cleaned.");
  }
};

await main();
