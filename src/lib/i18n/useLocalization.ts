import { useSyncExternalStore } from "react";

import { localizer } from "./localizer";

const subscribe = (listener: () => void) => {
  const disposable = localizer.onDidChange(() => listener());

  return () => disposable.dispose();
};

const getSnapshot = () => localizer.current;

// Components read `t` from this snapshot rather than the module-level `t`: React Compiler caches
// a module call on its arguments, so only a snapshot whose identity changes with the locale
// re-translates after a switch.
export const useLocalization = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
