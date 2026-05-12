import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

import {
  createSonnerMock,
  createTauriAppMock,
  createTauriCoreMock,
  createTauriDialogMock,
  createTauriOpenerMock,
  createTauriPathMock,
  createTauriStoreMock,
  createTauriWindowMock,
} from "./mocks";

vi.mock("@tauri-store/zustand", () => createTauriStoreMock());
vi.mock("@tauri-apps/api/app", () => createTauriAppMock());
vi.mock("@tauri-apps/api/core", () => createTauriCoreMock());
vi.mock("@tauri-apps/api/path", () => createTauriPathMock());
vi.mock("@tauri-apps/api/window", () => createTauriWindowMock());
vi.mock("@tauri-apps/plugin-dialog", () => createTauriDialogMock());
vi.mock("@tauri-apps/plugin-opener", () => createTauriOpenerMock());
vi.mock("sonner", () => createSonnerMock());

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = TestResizeObserver;
}

if (typeof PointerEvent === "undefined" && typeof MouseEvent !== "undefined") {
  globalThis.PointerEvent = MouseEvent as typeof PointerEvent;
}

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.scrollIntoView ??= function scrollIntoView() {};
  HTMLElement.prototype.hasPointerCapture ??= function hasPointerCapture() {
    return false;
  };
  HTMLElement.prototype.releasePointerCapture ??=
    function releasePointerCapture() {};
}
