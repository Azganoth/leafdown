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
