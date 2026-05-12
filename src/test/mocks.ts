import { vi } from "vitest";

export function createSonnerMock() {
  return {
    Toaster: () => null,
    toast: {
      error: vi.fn(),
      loading: vi.fn(() => "toast-id"),
      success: vi.fn(),
    },
  };
}

export function createTauriStoreMock() {
  return {
    createTauriStore: vi.fn(() => ({
      load: vi.fn(),
      save: vi.fn(),
      saveNow: vi.fn(),
      start: vi.fn(),
    })),
  };
}

export function createTauriCoreMock() {
  return {
    invoke: vi.fn(),
  };
}

export function createTauriPathMock() {
  return {
    documentDir: vi.fn(async () => "C:/Users/Test/Documents"),
    join: vi.fn(async (...segments: string[]) =>
      segments
        .filter(Boolean)
        .join("/")
        .replace(/[\\/]+/g, "/"),
    ),
  };
}

export function createTauriAppMock() {
  return {
    setTheme: vi.fn(async () => undefined),
  };
}

const currentWindowMock = {
  show: vi.fn(async () => undefined),
  theme: vi.fn(async () => "light"),
};

export function createTauriWindowMock() {
  return {
    getCurrentWindow: vi.fn(() => currentWindowMock),
  };
}

export function createTauriDialogMock() {
  return {
    open: vi.fn(async () => null),
  };
}

export function createTauriOpenerMock() {
  return {
    revealItemInDir: vi.fn(async () => undefined),
  };
}
