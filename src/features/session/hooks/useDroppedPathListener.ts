import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

import { handleUnexpectedError, notifyOperationFailure } from "@/lib/errors";
import { DisposableStore } from "@/lib/lifecycle";

import {
  handleDroppedPaths,
  prepareDroppedPaths,
  type DroppedPathPreparation,
} from "../services/dropWorkflows";

export type DroppedPathIndicator =
  | DroppedPathPreparation
  | { status: "checking" }
  | { status: "inspectionFailed" }
  | null;

export const useDroppedPathListener = () => {
  const [indicator, setIndicator] = useState<DroppedPathIndicator>(null);
  const dragSequence = useRef(0);

  useEffect(() => {
    const disposables = new DisposableStore();

    void getCurrentWindow()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "enter") {
          const sequence = ++dragSequence.current;
          setIndicator({ status: "checking" });

          void prepareDroppedPaths(payload.paths)
            .then((preparation) => {
              if (dragSequence.current === sequence) {
                setIndicator(preparation);
              }
            })
            .catch((error) => {
              if (dragSequence.current === sequence) {
                setIndicator({ status: "inspectionFailed" });
              }

              handleUnexpectedError(error, "prepareDroppedPaths");
            });
          return;
        }

        if (payload.type === "leave") {
          dragSequence.current += 1;
          setIndicator(null);
          return;
        }

        if (payload.type === "drop") {
          dragSequence.current += 1;
          setIndicator(null);

          void handleDroppedPaths(payload.paths).catch((error) =>
            notifyOperationFailure("Could not handle dropped item.", error, "handleDroppedPaths"),
          );
        }
      })
      .then((unlisten) => {
        disposables.add(unlisten);
      })
      .catch((error) =>
        notifyOperationFailure("Could not enable file and folder drops.", error, "onDragDropEvent"),
      );

    return () => {
      dragSequence.current += 1;
      disposables.dispose();
    };
  }, []);

  return indicator;
};
