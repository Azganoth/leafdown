import type { Event as TauriEvent } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useLayoutEffect, useRef } from "react";

import { handleUnexpectedError } from "./errors";
import { DisposableStore } from "./lifecycle";

type TauriEventHandler<TPayload> = (event: TauriEvent<TPayload>) => void | Promise<void>;

export const useTauriEvent = <TPayload>(
  eventName: string,
  handler: TauriEventHandler<TPayload>,
  operation = `tauriEvent:${eventName}`,
) => {
  const handlerRef = useRef(handler);

  useLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const disposables = new DisposableStore();

    void getCurrentWindow()
      .listen<TPayload>(eventName, (event) => {
        void Promise.resolve(handlerRef.current(event)).catch((error) =>
          handleUnexpectedError(error, operation),
        );
      })
      .then((unlisten) => {
        disposables.add(unlisten);
      })
      .catch((error) => handleUnexpectedError(error, operation));

    return () => {
      disposables.dispose();
    };
  }, [eventName, operation]);
};
