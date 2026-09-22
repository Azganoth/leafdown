const scenarioTargets = {
  "block-selection": ["block-selection"],
  diagnostics: ["diagnostics"],
  "document-lifecycle": ["document-lifecycle"],
  "folder-watcher": ["folder-watcher"],
  "rendered-images": ["rendered-images"],
  "rendered-html": ["rendered-html"],
  "missing-document-error": ["missing-document-error"],
  persistence: ["persistence-write", "persistence-restart"],
  "window-lifecycle": ["window-lifecycle"],
} as const;

export const MAX_DESKTOP_E2E_WORKERS = 4;

const validScenarioTargets = Object.keys(scenarioTargets).join(", ");

const selectionError = (reason: string) =>
  new Error(
    `${reason}\nUsage: pnpm test:e2e:desktop:run -- [--scenario <name>] [--workers <1-${MAX_DESKTOP_E2E_WORKERS}>]\nValid scenarios: ${validScenarioTargets}`,
  );

export interface DesktopE2ERunSelection {
  scenarioGroups: string[][];
  workerCount: number;
}

export const selectDesktopE2ERun = (arguments_: readonly string[]): DesktopE2ERunSelection => {
  let scenarioTarget: keyof typeof scenarioTargets | undefined;
  let workerCount = 1;

  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];

    if (!value) {
      throw selectionError(`Expected a value after ${option ?? "the final option"}.`);
    }

    if (option === "--scenario") {
      if (scenarioTarget) {
        throw selectionError("The --scenario option may only be provided once.");
      }

      if (!(value in scenarioTargets)) {
        throw selectionError(`Unknown desktop E2E scenario: ${value}.`);
      }

      scenarioTarget = value as keyof typeof scenarioTargets;
      continue;
    }

    if (option === "--workers") {
      if (workerCount !== 1 || arguments_.slice(0, index).includes("--workers")) {
        throw selectionError("The --workers option may only be provided once.");
      }

      const parsedWorkerCount = Number(value);

      if (
        !Number.isInteger(parsedWorkerCount) ||
        parsedWorkerCount < 1 ||
        parsedWorkerCount > MAX_DESKTOP_E2E_WORKERS
      ) {
        throw selectionError(
          `Desktop E2E workers must be an integer from 1 to ${MAX_DESKTOP_E2E_WORKERS}.`,
        );
      }

      workerCount = parsedWorkerCount;
      continue;
    }

    throw selectionError(`Unknown desktop E2E option: ${option}.`);
  }

  return {
    scenarioGroups: scenarioTarget
      ? [[...scenarioTargets[scenarioTarget]]]
      : Object.values(scenarioTargets).map((scenarioNames) => [...scenarioNames]),
    workerCount,
  };
};
