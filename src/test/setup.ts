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
  createTauriWebviewMock,
  createTauriWindowMock,
} from "./mocks";

vi.mock("@tauri-store/zustand", () => createTauriStoreMock());
vi.mock("@tauri-apps/api/app", () => createTauriAppMock());
vi.mock("@tauri-apps/api/core", () => createTauriCoreMock());
vi.mock("@tauri-apps/api/path", () => createTauriPathMock());
vi.mock("@tauri-apps/api/webview", () => createTauriWebviewMock());
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

if (typeof ClipboardEvent === "undefined") {
  globalThis.ClipboardEvent = Event as typeof ClipboardEvent;
}

const createTestDomRect = (): DOMRect => ({
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
});

const createTestDomRectList = (): DOMRectList => {
  const rect = createTestDomRect();

  return {
    0: rect,
    length: 1,
    item: (index: number) => (index === 0 ? rect : null),
    [Symbol.iterator]: function* iterateTestDomRects() {
      yield rect;
    },
  } as DOMRectList;
};

if (typeof Range !== "undefined") {
  Range.prototype.getBoundingClientRect ??= createTestDomRect;
  Range.prototype.getClientRects ??= createTestDomRectList;
}

if (typeof Text !== "undefined") {
  const textPrototype = Text.prototype as Text & {
    getClientRects?: () => DOMRectList;
  };

  textPrototype.getClientRects ??= createTestDomRectList;
}

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.scrollIntoView ??= function scrollIntoView() {};
  HTMLElement.prototype.hasPointerCapture ??= function hasPointerCapture() {
    return false;
  };
  HTMLElement.prototype.releasePointerCapture ??= function releasePointerCapture() {};
}
