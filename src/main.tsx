import { Providers } from "@/Providers";
import { enableArrayMethods, enableMapSet } from "immer";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

enableArrayMethods();
enableMapSet();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
