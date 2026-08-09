import {
  act,
  cleanup,
  renderHook as renderHookWithTestingLibrary,
  render as renderWithTestingLibrary,
  screen,
  type RenderHookOptions,
  type RenderOptions,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { afterEach } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

afterEach(() => {
  cleanup();
});

function Providers({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

const render = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  renderWithTestingLibrary(ui, {
    wrapper: Providers,
    ...options,
  });

const renderWithUser = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) => ({
  user: userEvent.setup(),
  ...render(ui, options),
});

const setupUser = (options?: Parameters<typeof userEvent.setup>[0]) => userEvent.setup(options);

const renderHook = <Result, Props>(
  render: (initialProps: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, "wrapper">,
) =>
  renderHookWithTestingLibrary(render, {
    wrapper: Providers,
    ...options,
  });

export { act, render, renderHook, renderWithUser, screen, setupUser, waitFor, within };
