import { vi } from "vitest";

import { getMockPathExtension, joinMockPathSegments } from "../utils/path";

export const createTauriStoreMock = () => ({
  createTauriStore: vi.fn(() => ({
    load: vi.fn(),
    save: vi.fn(),
    saveNow: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
});

export const createTauriCoreMock = () => ({
  convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${encodeURIComponent(filePath)}`),
  invoke: vi.fn(),
});

export const createTauriPathMock = () => ({
  documentDir: vi.fn(async () => "C:/Users/Test/Documents"),
  extname: vi.fn(async (path: string) => getMockPathExtension(path)),
  join: vi.fn(async (...segments: string[]) => joinMockPathSegments(...segments)),
});

export const createTauriAppMock = () => ({
  setTheme: vi.fn(async () => undefined),
});

const currentWindowMock = {
  close: vi.fn(async () => undefined),
  destroy: vi.fn(async () => undefined),
  isFullscreen: vi.fn(async () => false),
  listen: vi.fn(async () => vi.fn()),
  setFullscreen: vi.fn(async () => undefined),
  show: vi.fn(async () => undefined),
  theme: vi.fn(async () => "light"),
};

export const createTauriWindowMock = () => ({
  getCurrentWindow: vi.fn(() => currentWindowMock),
});

const currentWebviewMock = {
  setZoom: vi.fn(async () => undefined),
};

export const createTauriWebviewMock = () => ({
  getCurrentWebview: vi.fn(() => currentWebviewMock),
});

export const createTauriDialogMock = () => ({
  confirm: vi.fn(async () => false),
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
});

export const createTauriOpenerMock = () => ({
  openPath: vi.fn(async () => undefined),
  openUrl: vi.fn(async () => undefined),
  revealItemInDir: vi.fn(async () => undefined),
});
