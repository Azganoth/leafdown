import { readFileSync } from "node:fs";

export const CURRENT_VERSION = (
  JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

export const CURRENT_RELEASE_HIGHLIGHT = "Open bundled, read-only Getting started";
