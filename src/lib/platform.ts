const MAC_PLATFORM_PATTERN = /\bMacintosh\b|\bMac OS X\b/u;
const WINDOWS_PLATFORM_PATTERN = /\bWindows\b/u;

const getNavigatorUserAgent = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);

export const isMacPlatform = () => {
  const userAgent = getNavigatorUserAgent();

  return userAgent
    ? MAC_PLATFORM_PATTERN.test(userAgent)
    : typeof process !== "undefined" && process.platform === "darwin";
};

export const isWindowsPlatform = () => {
  const userAgent = getNavigatorUserAgent();

  return userAgent
    ? WINDOWS_PLATFORM_PATTERN.test(userAgent)
    : typeof process !== "undefined" && process.platform === "win32";
};
