import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DesktopE2ERunContext } from "./support/runContext.js";

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

const fileEvidence = async (filePath: string) => {
  try {
    const contents = await readFile(filePath);
    const metadata = await stat(filePath);

    return {
      path: filePath,
      sha256: createHash("sha256").update(contents).digest("hex"),
      sizeBytes: metadata.size,
    };
  } catch (error) {
    return { error: String(error), path: filePath };
  }
};

const main = async () => {
  if (!process.env.APPDATA) {
    throw new Error("APPDATA is required for the Windows-local desktop E2E suite.");
  }

  await mkdir(artifactsRoot, { recursive: true });

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "leafdown-desktop-e2e-"));
  const documentPath = path.join(temporaryRoot, "document-lifecycle.md");
  const savedMarker = "Saved fixture marker.";
  const context: DesktopE2ERunContext = {
    document: {
      initialMarker: "Initial fixture marker.",
      path: documentPath,
      savedMarkdown: `${savedMarker}\n`,
      savedMarker,
    },
    temporaryRoot,
  };

  await copyFile(
    path.join(repositoryRoot, "e2e", "desktop", "fixtures", "document-lifecycle.md"),
    documentPath,
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
  ];

  try {
    for (const scenario of scenarios) {
      await scenario.prepareState(context);
      await runWdio(scenario);
    }
  } finally {
    await writeJson(path.join(artifactsRoot, "fixture-manifest.json"), {
      document: await fileEvidence(documentPath),
      temporaryRoot,
    });
    await Promise.all([
      rm(temporaryRoot, { force: true, recursive: true }),
      rm(e2eStoreDirectory, { force: true, recursive: true }),
    ]);
  }
};

await main();
