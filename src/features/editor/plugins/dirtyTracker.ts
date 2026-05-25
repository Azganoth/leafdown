import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

export const leafdownDirtyTrackerPluginKey = new PluginKey("leafdownDirtyTracker");

export const createLeafdownDirtyTrackerPlugin = (onContentTransaction: () => void) =>
  $prose(
    () =>
      new Plugin({
        key: leafdownDirtyTrackerPluginKey,
        state: {
          init: () => null,
          apply: (transaction) => {
            if (transaction.docChanged && transaction.getMeta("addToHistory") !== false) {
              onContentTransaction();
            }

            return null;
          },
        },
      }),
  );
