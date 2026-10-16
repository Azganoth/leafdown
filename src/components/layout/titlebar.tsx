import { useEffect, type ReactNode } from "react";

import {
  findMaximizeControl,
  removeWindowControlsFromTabSequence,
  trackMaximizeControl,
} from "./windowControls";

interface TitlebarProps {
  actions?: ReactNode;
  children?: ReactNode;
}

export function Titlebar({ actions, children }: TitlebarProps) {
  // The plugin injects the controls from a spawned task that polls for the
  // Tauri global, so a one-shot query would race it.
  useEffect(() => {
    let stopTrackingMaximizeControl: (() => void) | null = null;

    const adoptWindowControls = () => {
      if (!removeWindowControlsFromTabSequence()) {
        return false;
      }

      const maximizeControl = findMaximizeControl();
      if (maximizeControl) {
        stopTrackingMaximizeControl = trackMaximizeControl(maximizeControl);
      }

      return true;
    };

    const observer = new MutationObserver(() => {
      if (adoptWindowControls()) {
        observer.disconnect();
      }
    });

    if (!adoptWindowControls()) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
      stopTrackingMaximizeControl?.();
    };
  }, []);

  return (
    <header
      id="leafdown-titlebar"
      className="pointer-events-auto fixed top-0 right-0 left-0 z-90 mr-(--tauri-frame-controls-width,138px) flex h-8 items-center px-1"
    >
      <img src="/app-icon.svg" alt="" className="mr-1 ml-4 size-6" />
      {children}
      <div data-tauri-drag-region className="h-full flex-1" />
      {actions && <div className="flex h-full items-center gap-1">{actions}</div>}
    </header>
  );
}
