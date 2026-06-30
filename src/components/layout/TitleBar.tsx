/* v8 ignore file */

// Window controls are injected by tauri-plugin-frame.
export function TitleBar() {
  return (
    <header className="fixed top-0 right-0 left-0 z-90 mr-(--tauri-frame-controls-width,138px) flex h-8 items-center px-1">
      <img src="/app-icon.svg" alt="" className="mr-1 ml-0.5 size-6" />
      <h1 className="font-display text-base">Leafdown</h1>
    </header>
  );
}
