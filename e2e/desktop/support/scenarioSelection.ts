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

const validScenarioTargets = Object.keys(scenarioTargets).join(", ");

const selectionError = (reason: string) =>
  new Error(
    `${reason}\nUsage: pnpm test:e2e:desktop:run -- --scenario <name>\nValid scenarios: ${validScenarioTargets}`,
  );

export const selectScenarioNames = (arguments_: readonly string[]) => {
  if (arguments_.length === 0) {
    return Object.values(scenarioTargets).flat();
  }

  if (arguments_.length !== 2 || arguments_[0] !== "--scenario" || !arguments_[1]) {
    throw selectionError("Expected exactly one --scenario <name> argument.");
  }

  const selectedScenarioNames = scenarioTargets[arguments_[1] as keyof typeof scenarioTargets];

  if (!selectedScenarioNames) {
    throw selectionError(`Unknown desktop E2E scenario: ${arguments_[1]}.`);
  }

  return [...selectedScenarioNames];
};
