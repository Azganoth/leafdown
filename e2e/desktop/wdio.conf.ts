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
const closesApplicationUnderTest = process.env.LEAFDOWN_E2E_SCENARIO === "window-lifecycle";
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
  specs: [
    requestedSpec
      ? path.resolve(repositoryRoot, requestedSpec)
      : path.join(repositoryRoot, "e2e", "desktop", "specs", "diagnostics.e2e.ts"),
  ],
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
  after: () => {
    if (closesApplicationUnderTest && activeBrowser) {
      // The terminal scenario already destroyed the embedded WebDriver with the app.
      // Clear the local handle so WDIO does not issue a DELETE to a server that no longer exists.
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
