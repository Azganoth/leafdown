import { browser } from "@wdio/globals";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RUN_LABEL } from "./suite.js";

interface DiagnosticsSummary {
  appIdentifier: string;
  appName: string;
  appVersion: string;
  architecture: string;
  logDirectoryPath: string;
  logFileCount: number;
  logFileName: string;
  logFilePath: string;
  logMaxFileSizeBytes: number;
  operatingSystem: string;
  runId: string;
}

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const scenarioLabel = process.env.LEAFDOWN_E2E_SCENARIO;

process.env.LEAFDOWN_E2E_ARTIFACT_RUN = RUN_LABEL;

export const ARTIFACTS_DIR = path.join(
  repositoryRoot,
  "e2e",
  "desktop",
  "artifacts",
  RUN_LABEL,
  ...(scenarioLabel ? [scenarioLabel] : []),
);

const writeJson = async (fileName: string, value: unknown) => {
  await writeFile(path.join(ARTIFACTS_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`);
};

const describeUnknownError = (error: unknown) => {
  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error) ?? "Unknown non-Error value";
  } catch {
    return "Unserializable non-Error value";
  }
};

export const captureFailureArtifacts = async (testError?: unknown) => {
  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const captureErrors: Record<string, string> = {};

  try {
    await browser.saveScreenshot(path.join(ARTIFACTS_DIR, "failure.png"));
  } catch (error) {
    captureErrors.screenshot = String(error);
  }

  try {
    const diagnostics = await browser.tauri.execute(
      ({ core }) => core.invoke("get_diagnostics_summary") as Promise<DiagnosticsSummary>,
    );
    await writeJson("diagnostics.json", diagnostics);
  } catch (error) {
    captureErrors.diagnostics = String(error);
  }

  try {
    const semanticState = await browser.execute(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          "[role], button, a, input, textarea, select, [aria-label], [aria-labelledby]",
        ),
      )
        .filter((element) => !element.closest("[contenteditable='true']"))
        .map((element) => {
          const containsEditorContent = Boolean(element.querySelector("[contenteditable='true']"));

          return {
            ariaChecked: element.getAttribute("aria-checked"),
            ariaDisabled: element.getAttribute("aria-disabled"),
            ariaExpanded: element.getAttribute("aria-expanded"),
            ariaLabel: element.getAttribute("aria-label"),
            ariaLabelledBy: element.getAttribute("aria-labelledby"),
            disabled: "disabled" in element ? Boolean(element.disabled) : undefined,
            role: element.getAttribute("role"),
            tag: element.tagName.toLowerCase(),
            text: containsEditorContent
              ? undefined
              : element.innerText?.trim().slice(0, 200) || undefined,
          };
        }),
    );
    await writeJson("semantic-state.json", semanticState);
  } catch (error) {
    captureErrors.semanticState = String(error);
  }

  await writeJson("failure.json", {
    captureErrors,
    error:
      testError instanceof Error
        ? {
            message: testError.message,
            name: testError.name,
            stack: testError.stack,
          }
        : testError === undefined
          ? undefined
          : { message: describeUnknownError(testError) },
  });
};
