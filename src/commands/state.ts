// Deep import for the same reason as ./dispatch: the command contract carries no Milkdown.
import { isEditorCommandId } from "@/features/editor/commands/contract";

import { APPLICATION_COMMANDS, isApplicationCommandId } from "./application";
import type { AppCommandContext } from "./context";
import type { AppCommandId } from "./dispatch";
import { disabled, enabled, type CommandState } from "./statePrimitives";

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

    return editor.enabledCommands[commandId]
      ? enabled()
      : disabled("The editor command is not available.");
  }

  if (isApplicationCommandId(commandId)) {
    return APPLICATION_COMMANDS[commandId].getState(context);
  }

  return disabled("The command is not available.");
};
