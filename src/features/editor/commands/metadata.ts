import type { EditorCommandId } from "./contract";

export const getEditorCommandLabelId = (commandId: EditorCommandId) =>
  `command.${commandId}` as const;
