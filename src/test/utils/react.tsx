import {
  act,
  cleanup,
  renderHook as renderHookWithTestingLibrary,
  render as renderWithTestingLibrary,
  screen,
  type RenderHookOptions,
  type RenderOptions,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return renderWithTestingLibrary(ui, {
    wrapper: Providers,
    ...options,
  });
}

function renderWithUser(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return {
    user: userEvent.setup(),
    ...render(ui, options),
  };
}

function renderHook<Result, Props>(
  render: (initialProps: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, "wrapper">,
) {
  return renderHookWithTestingLibrary(render, {
    wrapper: Providers,
    ...options,
  });
}

export { act, render, renderHook, renderWithUser, screen };
