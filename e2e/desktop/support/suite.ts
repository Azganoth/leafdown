export const RUN_LABEL =
  process.env.LEAFDOWN_E2E_ARTIFACT_RUN ??
  `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${process.pid}`;

export const WEBDRIVER_PORT = 4445;
