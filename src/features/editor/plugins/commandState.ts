import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { getEditorCommandState } from "../utils/editorCommandState";

export const leafdownCommandStatePluginKey = new PluginKey("leafdownCommandState");

const createCommandStateSignature = (state: ReturnType<typeof getEditorCommandState>) =>
  JSON.stringify({
    enabledCommands: state.enabledCommands,
    hasSelection: state.hasSelection,
    hasTableSelection: state.hasTableSelection,
  });

export const createLeafdownCommandStatePlugin = (onCommandStateChanged: () => void) =>
  $prose(
    () =>
      new Plugin({
        key: leafdownCommandStatePluginKey,
        view: (view) => {
          let commandStateSignature = createCommandStateSignature(getEditorCommandState(view));

          return {
            update: (nextView, previousState) => {
              if (
                nextView.state.doc === previousState.doc &&
                nextView.state.selection.eq(previousState.selection)
              ) {
                return;
              }

              const nextSignature = createCommandStateSignature(getEditorCommandState(nextView));

              if (nextSignature === commandStateSignature) {
                return;
              }

              commandStateSignature = nextSignature;
              onCommandStateChanged();
            },
          };
        },
      }),
  );
