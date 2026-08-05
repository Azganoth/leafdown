import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { installUnexpectedErrorDiagnostics } from "./features/diagnostics";
import { installUnexpectedErrorHandlers, invariant } from "./lib/errors";
import { Providers } from "./Providers";

if (import.meta.env.MODE === "desktop-e2e") {
  await import("@wdio/tauri-plugin");
}

const cleanupUnexpectedErrorHandlers = installUnexpectedErrorHandlers();
const cleanupUnexpectedErrorDiagnostics = installUnexpectedErrorDiagnostics();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupUnexpectedErrorHandlers();
    cleanupUnexpectedErrorDiagnostics();
  });
}

const rootElement = document.getElementById("root");
invariant(rootElement, "Root element is missing.");

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
