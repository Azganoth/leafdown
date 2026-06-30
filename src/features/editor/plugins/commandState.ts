import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { EDITOR_COMMAND_IDS, getEditorCommandState, type EditorCommandState } from "../commands";

export const leafdownCommandStatePluginKey = new PluginKey("leafdownCommandState");

const commandStatesEqual = (left: EditorCommandState, right: EditorCommandState) =>
  left.status === right.status &&
  EDITOR_COMMAND_IDS.every(
    (commandId) => left.enabledCommands[commandId] === right.enabledCommands[commandId],
  );

export const createLeafdownCommandStatePlugin = (
  onCommandStateChanged: (state: EditorCommandState) => void,
) =>
  $prose(
    () =>
      new Plugin({
        key: leafdownCommandStatePluginKey,
        view: (view) => {
          let commandState = getEditorCommandState(view);

          return {
            update: (nextView) => {
              const nextCommandState = getEditorCommandState(nextView);

              if (commandStatesEqual(commandState, nextCommandState)) {
                return;
              }

              commandState = nextCommandState;
              onCommandStateChanged(nextCommandState);
            },
          };
        },
      }),
  );
