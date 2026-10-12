import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUN_LABEL =
  process.env.LEAFDOWN_E2E_ARTIFACT_RUN ??
  `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${process.pid}`;

export const WEBDRIVER_BASE_PORT = 4445;

const configuredWebDriverPort = process.env.LEAFDOWN_E2E_WEBDRIVER_PORT;
const parsedWebDriverPort = configuredWebDriverPort
  ? Number(configuredWebDriverPort)
  : WEBDRIVER_BASE_PORT;

if (
  !Number.isInteger(parsedWebDriverPort) ||
  parsedWebDriverPort < 1 ||
  parsedWebDriverPort > 65_535
) {
  throw new Error("LEAFDOWN_E2E_WEBDRIVER_PORT must be a valid TCP port.");
}

export const WEBDRIVER_PORT = parsedWebDriverPort;

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

export const APP_BINARY_PATH =
  process.env.LEAFDOWN_E2E_RELEASE_BINARY ??
  path.join(repositoryRoot, "src-tauri", "target", "desktop-e2e", "debug", "leafdown-e2e.exe");
