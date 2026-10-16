import { isEditorCommandId } from "@/features/editor/commands/contract";

import { APPLICATION_COMMANDS, isApplicationCommandId } from "./application";
import type { AppCommandContext } from "./context";
import type { AppCommandId } from "./dispatch";
import { checked, disabled, enabled, type CommandState } from "./statePrimitives";

export const getCommandState = (
  commandId: AppCommandId,
  context: AppCommandContext,
): CommandState => {
  const { activeDocument, editor } = context;

  if (isEditorCommandId(commandId)) {
    if (!activeDocument) {
      return disabled("No document is open.");
    }

    if (editor.status !== "ready") {
      return disabled("The editor is not ready.");
    }

    if (!editor.enabledCommands[commandId]) {
      return disabled();
    }

    const isChecked = editor.checkedCommands[commandId];

    return isChecked === undefined ? enabled() : checked(isChecked);
  }

  if (isApplicationCommandId(commandId)) {
    return APPLICATION_COMMANDS[commandId].getState(context);
  }

  return disabled("The command is not available.");
};
