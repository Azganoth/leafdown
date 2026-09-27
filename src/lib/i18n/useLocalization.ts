import { useSyncExternalStore } from "react";

import { localizer } from "./localizer";

const subscribe = (listener: () => void) => {
  const disposable = localizer.onDidChange(() => listener());

  return () => disposable.dispose();
};

const getSnapshot = () => localizer.current;

export const useLocalization = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
