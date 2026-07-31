import { getActiveDocumentKey } from "@/features/document";
// Deep import, as in @/features/session/services/documentEditorBridge: the editor root
// exports MilkdownEditor, so reaching the command contract through it would pull Milkdown
// and Shiki into the command layer and everything that composes it.
import { EDITOR_COMMAND_IDS, isEditorCommandId } from "@/features/editor/commands/contract";
import { documentEditorBridge } from "@/features/session";

import {
  APPLICATION_COMMAND_IDS,
  isApplicationCommandId,
  runApplicationCommand,
} from "./application";
import type { AppCommandContext } from "./context";

export const APP_COMMAND_IDS = [...APPLICATION_COMMAND_IDS, ...EDITOR_COMMAND_IDS];

export type AppCommandId = (typeof APP_COMMAND_IDS)[number];
export type AppCommandDispatchResult = Promise<boolean>;

export const dispatchAppCommand = async (
  commandId: AppCommandId,
  context: AppCommandContext,
): AppCommandDispatchResult => {
  if (isApplicationCommandId(commandId)) {
    await runApplicationCommand(context, commandId);
    return true;
  }

  if (context.activeDocument && isEditorCommandId(commandId)) {
    const activeDocumentKey = getActiveDocumentKey(context.activeDocument);
    return documentEditorBridge.runCommand(activeDocumentKey, commandId);
  }

  return false;
};
