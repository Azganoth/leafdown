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
    extname: vi.fn(async (path: string) => {
      const fileName = path.split(/[\\/]/).at(-1) ?? "";
      const match = /\.([^.\\/]+)$/u.exec(fileName);

      return match?.[1] ?? "";
    }),
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
  close: vi.fn(async () => undefined),
  destroy: vi.fn(async () => undefined),
  isFullscreen: vi.fn(async () => false),
  listen: vi.fn(async () => vi.fn()),
  setFullscreen: vi.fn(async () => undefined),
  show: vi.fn(async () => undefined),
  theme: vi.fn(async () => "light"),
};

export function createTauriWindowMock() {
  return {
    getCurrentWindow: vi.fn(() => currentWindowMock),
  };
}

const currentWebviewMock = {
  setZoom: vi.fn(async () => undefined),
};

export function createTauriWebviewMock() {
  return {
    getCurrentWebview: vi.fn(() => currentWebviewMock),
  };
}

export function createTauriDialogMock() {
  return {
    confirm: vi.fn(async () => false),
    open: vi.fn(async () => null),
    save: vi.fn(async () => null),
  };
}

export function createTauriOpenerMock() {
  return {
    revealItemInDir: vi.fn(async () => undefined),
  };
}
