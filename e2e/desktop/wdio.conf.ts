import type { TauriCapabilities } from "@wdio/tauri-service";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ARTIFACTS_DIR, captureFailureArtifacts } from "./support/artifacts.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const appBinaryPath = path.join(
  repositoryRoot,
  "src-tauri",
  "target",
  "desktop-e2e",
  "debug",
  "leafdown-e2e.exe",
);
const webdriverPort = 4445;

const capabilities: TauriCapabilities[] = [
  {
    browserName: "tauri",
    "tauri:options": {
      application: appBinaryPath,
    },
  },
];

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: [path.join(repositoryRoot, "e2e", "desktop", "specs", "diagnostics.e2e.ts")],
  maxInstances: 1,
  capabilities,
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "embedded",
        embeddedPort: webdriverPort,
        captureBackendLogs: true,
        captureFrontendLogs: true,
        backendLogLevel: "info",
        frontendLogLevel: "info",
        logDir: ARTIFACTS_DIR,
      },
    ],
  ],
  outputDir: ARTIFACTS_DIR,
  logLevel: "info",
  framework: "mocha",
  reporters: ["spec"],
  waitforTimeout: 10_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 0,
  mochaOpts: {
    timeout: 60_000,
  },
  before: async (_capabilities, _specs, browser: WebdriverIO.Browser) => {
    await browser.setWindowSize(1024, 768);
  },
  afterTest: async (_test, _context, { error, passed }) => {
    if (!passed) {
      try {
        await captureFailureArtifacts(error);
      } catch (captureError) {
        console.error("Desktop E2E failure artifact capture failed.", captureError);
      }
    }
  },
};
