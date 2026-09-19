import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import { notifyOperationFailure } from "@/lib/errors";
import { DisposableStore } from "@/lib/lifecycle";

import { handleDroppedPaths } from "../services/dropWorkflows";

export const useDroppedPathListener = () => {
  useEffect(() => {
    const disposables = new DisposableStore();

    void getCurrentWindow()
      .onDragDropEvent(({ payload }) => {
        if (payload.type !== "drop") {
          return;
        }

        void handleDroppedPaths(payload.paths).catch((error) =>
          notifyOperationFailure("Could not handle dropped item.", error, "handleDroppedPaths"),
        );
      })
      .then((unlisten) => {
        disposables.add(unlisten);
      })
      .catch((error) =>
        notifyOperationFailure("Could not enable file and folder drops.", error, "onDragDropEvent"),
      );

    return () => {
      disposables.dispose();
    };
  }, []);
};
