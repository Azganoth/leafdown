import type { TauriCapabilities } from "@wdio/tauri-service";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ARTIFACTS_DIR, captureFailureArtifacts } from "./support/artifacts.js";
import { WEBDRIVER_PORT } from "./support/suite.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const appBinaryPath = path.join(
  repositoryRoot,
  "src-tauri",
  "target",
  "desktop-e2e",
  "debug",
  "leafdown-e2e.exe",
);
const requestedSpec = process.env.LEAFDOWN_E2E_SPEC;

if (!requestedSpec) {
  throw new Error("LEAFDOWN_E2E_SPEC is required. Run the suite with pnpm test:e2e:desktop.");
}

let activeBrowser: WebdriverIO.Browser | undefined;

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
  specs: [path.resolve(repositoryRoot, requestedSpec)],
  maxInstances: 1,
  capabilities,
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "embedded",
        embeddedPort: WEBDRIVER_PORT,
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
    activeBrowser = browser;
    await browser.setWindowSize(1024, 768);
  },
  after: async () => {
    if (!activeBrowser) {
      return;
    }

    try {
      await activeBrowser.getTitle();
    } catch {
      activeBrowser.sessionId = "";
    }
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
