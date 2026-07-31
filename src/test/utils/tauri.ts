import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { documentDir, extname, join } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow, type Theme } from "@tauri-apps/api/window";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { expect, vi } from "vitest";

import { getMockPathExtension, joinMockPathSegments } from "./path";

export type InvokeCommandHandler = (args: unknown) => unknown;

export const countInvokeCalls = (commandName: string) =>
  vi.mocked(invoke).mock.calls.filter(([calledCommandName]) => calledCommandName === commandName)
    .length;

export const getLastInvokeArgs = <TArgs = unknown>(commandName: string): TArgs => {
  const invokeCall = vi
    .mocked(invoke)
    .mock.calls.findLast(([calledCommandName]) => calledCommandName === commandName);

  expect(invokeCall).toBeDefined();

  return invokeCall?.[1] as TArgs;
};

// Tauri types listeners as void-returning, but a handler may still be async. Tests that
// need to await its settled effect name the return type; the rest stay void.
type WindowListenHandler<TPayload, TReturn> = (event: { payload: TPayload }) => TReturn;

export const getWindowListenHandler = <TPayload, TReturn = void>(
  eventName: string,
): WindowListenHandler<TPayload, TReturn> => {
  const listenCall = vi
    .mocked(getCurrentWindow().listen)
    .mock.calls.find(([calledEventName]) => calledEventName === eventName);

  expect(listenCall).toBeDefined();

  return listenCall?.[1] as WindowListenHandler<TPayload, TReturn>;
};

export const getWindowThemeChangedHandler = (): ((event: { payload: Theme }) => void) => {
  const themeChangedCall = vi.mocked(getCurrentWindow().onThemeChanged).mock.calls.at(-1);

  expect(themeChangedCall).toBeDefined();

  return themeChangedCall?.[0] as (event: { payload: Theme }) => void;
};

export const mockInvokeCommands = (handlers: Record<string, InvokeCommandHandler>) => {
  vi.mocked(invoke).mockImplementation(async (commandName, args) => {
    const handler = handlers[commandName];

    if (!handler) {
      throw new Error(`Unexpected Tauri invoke command: ${commandName}`);
    }

    return handler(args);
  });
};

export const resetTauriMocks = () => {
  vi.mocked(invoke)
    .mockReset()
    .mockImplementation(async (commandName) => {
      throw new Error(`Unexpected Tauri invoke command: ${commandName}`);
    });

  vi.mocked(convertFileSrc)
    .mockReset()
    .mockImplementation((filePath: string) => `asset://localhost/${encodeURIComponent(filePath)}`);

  vi.mocked(documentDir).mockReset().mockResolvedValue("C:/Users/Test/Documents");
  vi.mocked(extname)
    .mockReset()
    .mockImplementation(async (path: string) => getMockPathExtension(path));
  vi.mocked(join)
    .mockReset()
    .mockImplementation(async (...segments: string[]) => joinMockPathSegments(...segments));

  const appWindow = getCurrentWindow();
  vi.mocked(appWindow.close).mockReset().mockResolvedValue(undefined);
  vi.mocked(appWindow.destroy).mockReset().mockResolvedValue(undefined);
  vi.mocked(appWindow.isFullscreen).mockReset().mockResolvedValue(false);
  vi.mocked(appWindow.listen).mockReset().mockResolvedValue(vi.fn());
  vi.mocked(appWindow.onThemeChanged).mockReset().mockResolvedValue(vi.fn());
  vi.mocked(appWindow.setFullscreen).mockReset().mockResolvedValue(undefined);
  vi.mocked(appWindow.show).mockReset().mockResolvedValue(undefined);
  vi.mocked(appWindow.theme).mockReset().mockResolvedValue("light");

  const webview = getCurrentWebview();
  vi.mocked(webview.setZoom).mockReset().mockResolvedValue(undefined);

  vi.mocked(confirm).mockReset().mockResolvedValue(false);
  vi.mocked(open).mockReset().mockResolvedValue(null);
  vi.mocked(save).mockReset().mockResolvedValue(null);

  vi.mocked(debug).mockReset().mockResolvedValue(undefined);
  vi.mocked(error).mockReset().mockResolvedValue(undefined);
  vi.mocked(info).mockReset().mockResolvedValue(undefined);
  vi.mocked(trace).mockReset().mockResolvedValue(undefined);
  vi.mocked(warn).mockReset().mockResolvedValue(undefined);

  vi.mocked(openPath).mockReset().mockResolvedValue(undefined);
  vi.mocked(openUrl).mockReset().mockResolvedValue(undefined);
  vi.mocked(revealItemInDir).mockReset().mockResolvedValue(undefined);
};
