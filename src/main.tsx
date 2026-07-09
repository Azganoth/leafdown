import { enableArrayMethods, enableMapSet } from "immer";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { installUnexpectedErrorDiagnostics } from "./features/diagnostics";
import { installUnexpectedErrorHandlers, invariant } from "./lib/errors";
import { Providers } from "./Providers";

enableArrayMethods();
enableMapSet();
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
