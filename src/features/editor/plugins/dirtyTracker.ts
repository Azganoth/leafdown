import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import {
  isSourceProjectionDirtyTransaction,
  isSourceProjectionHousekeepingTransaction,
  isSourceProjectionSuppressedHistoryTransaction,
} from "./sourceProjection";

interface DirtyTrackerPluginState {
  trackedChangeCount: number;
}

export const leafdownDirtyTrackerPluginKey = new PluginKey<DirtyTrackerPluginState>(
  "leafdownDirtyTracker",
);

const INITIAL_DIRTY_TRACKER_STATE: DirtyTrackerPluginState = {
  trackedChangeCount: 0,
};

const getDirtyTrackerState = (state: EditorState) =>
  leafdownDirtyTrackerPluginKey.getState(state) ?? INITIAL_DIRTY_TRACKER_STATE;

const shouldTrackDirtyTransaction = (transaction: Transaction) =>
  transaction.docChanged &&
  (isSourceProjectionDirtyTransaction(transaction) ||
    ((transaction.getMeta("addToHistory") !== false ||
      isSourceProjectionSuppressedHistoryTransaction(transaction)) &&
      !isSourceProjectionHousekeepingTransaction(transaction)));

export const createLeafdownDirtyTrackerPlugin = (onContentChanged: () => void) =>
  $prose(
    () =>
      new Plugin<DirtyTrackerPluginState>({
        key: leafdownDirtyTrackerPluginKey,
        state: {
          init: () => INITIAL_DIRTY_TRACKER_STATE,
          apply: (transaction, pluginState) =>
            shouldTrackDirtyTransaction(transaction)
              ? { trackedChangeCount: pluginState.trackedChangeCount + 1 }
              : pluginState,
        },
        view: (view) => {
          let trackedChangeCount = getDirtyTrackerState(view.state).trackedChangeCount;

          return {
            update: (nextView) => {
              const nextTrackedChangeCount = getDirtyTrackerState(
                nextView.state,
              ).trackedChangeCount;

              if (nextTrackedChangeCount === trackedChangeCount) {
                return;
              }

              trackedChangeCount = nextTrackedChangeCount;
              onContentChanged();
            },
          };
        },
      }),
  );
