import { vi } from "vitest";

export const createSonnerMock = () => ({
  Toaster: () => null,
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    message: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
});
