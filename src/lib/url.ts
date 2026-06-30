import { convertFileSrc } from "@tauri-apps/api/core";

import { toSlashPath } from "./path";

export const toTauriAssetUrl = (path: string) => convertFileSrc(toSlashPath(path));
