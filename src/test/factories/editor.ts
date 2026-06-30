import type {
  EditorCommandId,
  EditorCommandState,
  MarkdownReferenceContext,
  MilkdownEditorBridge,
} from "@/features/editor";
import { EDITOR_COMMAND_IDS } from "@/features/editor";

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
    } as Record<EditorCommandId, boolean>,
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
): MilkdownEditorBridge => ({
  getMarkdown: () => "",
  getCommandState: () => createActiveEditorCommandState(),
  runCommand: (_commandId: EditorCommandId) => false,
  ...overrides,
});
