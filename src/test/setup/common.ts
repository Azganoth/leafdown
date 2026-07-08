import { beforeEach, vi } from "vitest";

import { createSonnerMock } from "../mocks/sonner";
import {
  createTauriAppMock,
  createTauriCoreMock,
  createTauriDialogMock,
  createTauriLogMock,
  createTauriOpenerMock,
  createTauriPathMock,
  createTauriStoreMock,
  createTauriWebviewMock,
  createTauriWindowMock,
} from "../mocks/tauri";
import { resetTauriMocks } from "../utils/tauri";

vi.mock("@tauri-store/zustand", () => createTauriStoreMock());
vi.mock("@tauri-apps/api/app", () => createTauriAppMock());
vi.mock("@tauri-apps/api/core", () => createTauriCoreMock());
vi.mock("@tauri-apps/api/path", () => createTauriPathMock());
vi.mock("@tauri-apps/api/webview", () => createTauriWebviewMock());
vi.mock("@tauri-apps/api/window", () => createTauriWindowMock());
vi.mock("@tauri-apps/plugin-dialog", () => createTauriDialogMock());
vi.mock("@tauri-apps/plugin-log", () => createTauriLogMock());
vi.mock("@tauri-apps/plugin-opener", () => createTauriOpenerMock());
vi.mock("sonner", () => createSonnerMock());

beforeEach(async () => {
  const { resetAppStores } = await import("../utils/appStores");

  resetTauriMocks();
  resetAppStores();
});
