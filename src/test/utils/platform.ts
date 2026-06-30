import { vi } from "vitest";

const MAC_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const WINDOWS_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

export const withUserAgent = async <T>(userAgent: string, callback: () => T | Promise<T>) => {
  const userAgentSpy = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);

  try {
    return await callback();
  } finally {
    userAgentSpy.mockRestore();
  }
};

export const withMacUserAgent = <T>(callback: () => T | Promise<T>) =>
  withUserAgent(MAC_USER_AGENT, callback);

export const withWindowsUserAgent = <T>(callback: () => T | Promise<T>) =>
  withUserAgent(WINDOWS_USER_AGENT, callback);
