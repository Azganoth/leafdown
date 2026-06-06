import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import {
  isInlineSourceProjectionDirtyTransaction,
  isInlineSourceProjectionHousekeepingTransaction,
} from "./inlineSourceProjection";

export const leafdownDirtyTrackerPluginKey = new PluginKey("leafdownDirtyTracker");

export const createLeafdownDirtyTrackerPlugin = (onContentTransaction: () => void) =>
  $prose(
    () =>
      new Plugin({
        key: leafdownDirtyTrackerPluginKey,
        state: {
          init: () => null,
          apply: (transaction) => {
            if (
              transaction.docChanged &&
              (isInlineSourceProjectionDirtyTransaction(transaction) ||
                (transaction.getMeta("addToHistory") !== false &&
                  !isInlineSourceProjectionHousekeepingTransaction(transaction)))
            ) {
              onContentTransaction();
            }

            return null;
          },
        },
      }),
  );
