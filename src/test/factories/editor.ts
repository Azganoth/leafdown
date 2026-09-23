import type { MarkdownReferenceContext, MilkdownEditorBridge } from "@/features/editor";
import {
  EDITOR_COMMAND_IDS,
  type EditorCommandId,
  type EditorCommandState,
} from "@/features/editor/commands/contract";

export const EDITOR_TEST_ROOT_CLASS_NAME = "leafdown-editor";

export const createMarkdownReferenceContext = (
  overrides: Partial<MarkdownReferenceContext> = {},
): MarkdownReferenceContext => ({
  documentPath: "C:/Notes/readme.md",
  folderContextPath: "C:/Notes",
  ...overrides,
});

interface EditorCommandStateFactoryOptions extends Partial<
  Omit<EditorCommandState, "enabledCommands">
> {
  enabledCommandIds?: readonly EditorCommandId[];
  enabledCommands?: Partial<Record<EditorCommandId, boolean>>;
}

export const createEditorCommandState = (
  overrides: EditorCommandStateFactoryOptions = {},
): EditorCommandState => {
  const {
    enabledCommandIds = [],
    enabledCommands: enabledCommandOverrides,
    ...stateOverrides
  } = overrides;
  const enabledCommands = Object.fromEntries(
    EDITOR_COMMAND_IDS.map((commandId) => [commandId, enabledCommandIds.includes(commandId)]),
  ) as Record<EditorCommandId, boolean>;

  return {
    enabledCommands: {
      ...enabledCommands,
      ...enabledCommandOverrides,
    },
    status: "inactive",
    ...stateOverrides,
  };
};

export const createActiveEditorCommandState = (
  overrides: EditorCommandStateFactoryOptions = {},
): EditorCommandState =>
  createEditorCommandState({
    status: "ready",
    ...overrides,
  });

export const createMilkdownEditorBridge = (
  overrides: Partial<MilkdownEditorBridge> = {},
): MilkdownEditorBridge => {
  const commandState = createActiveEditorCommandState();

  return {
    getMarkdown: () => "",
    getCommandState: () => commandState,
    runCommand: (_commandId: EditorCommandId) => false,
    ...overrides,
  };
};
