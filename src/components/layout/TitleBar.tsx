import { useEffect } from "react";

// Injected by tauri-plugin-frame; without `withGlobalTauri` they never appear.
const WINDOW_CONTROL_SELECTOR = "[data-tauri-frame-tb] > button";

// Native Win32 caption buttons are non-client area and never in the tab
// sequence. `-1` rather than removal keeps these labeled for screen readers.
const removeWindowControlsFromTabSequence = () => {
  const controls = document.querySelectorAll<HTMLElement>(WINDOW_CONTROL_SELECTOR);

  controls.forEach((control) => {
    control.tabIndex = -1;
  });

  return controls.length > 0;
};

export function TitleBar() {
  // The plugin injects the controls from a spawned task that polls for the
  // Tauri global, so a one-shot query would race it.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (removeWindowControlsFromTabSequence()) {
        observer.disconnect();
      }
    });

    if (!removeWindowControlsFromTabSequence()) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
  }, []);

  return (
    <header
      id="leafdown-titlebar"
      className="pointer-events-auto fixed top-0 right-0 left-0 z-90 mr-(--tauri-frame-controls-width,138px) flex h-8 items-center px-1"
    >
      <img src="/app-icon.svg" alt="" className="mr-1 ml-0.5 size-6" />
      <h1 className="font-heading text-base">Leafdown</h1>
      <div data-tauri-drag-region className="h-full flex-1" />
    </header>
  );
}
