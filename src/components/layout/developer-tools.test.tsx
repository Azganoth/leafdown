// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { App } from "@/app";
import { toastManager } from "@/lib/toast";
import { renderWithUser, screen, waitFor } from "@/test/utils/react";
import { countTauriApiCalls, mockTauriApiCommand } from "@/test/utils/tauriApi";

import { DeveloperTools } from "./developer-tools";

const showDeveloperTools = async (user: ReturnType<typeof renderWithUser>["user"]) => {
  await user.click(screen.getByRole("button", { name: "Open developer tools" }));
  await screen.findByRole("toolbar", { name: "Developer tools" });
};

const showFailureSimulations = async (user: ReturnType<typeof renderWithUser>["user"]) => {
  await user.click(screen.getByRole("button", { name: "Failure simulations" }));
  await screen.findByRole("button", { name: /Render document surface crash/u });
};

const renderDeveloperTools = () => {
  const onSimulateRenderFailure = vi.fn();

  return {
    ...renderWithUser(<DeveloperTools onSimulateRenderFailure={onSimulateRenderFailure} />),
    onSimulateRenderFailure,
  };
};

describe("DeveloperTools", () => {
  it("opens purposeful app and failure actions", async () => {
    const { user } = renderDeveloperTools();

    await showDeveloperTools(user);

    expect(screen.getByRole("toolbar", { name: "Developer tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open DevTools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload app (F5)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Failure simulations" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Render document surface crash/u }),
    ).not.toBeInTheDocument();

    await showFailureSimulations(user);

    expect(
      screen.getByRole("button", { name: /Render document surface crash/u }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Command handler failure/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Missing file open/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancelled open transition/u })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Success toast/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Warning toast/u })).not.toBeInTheDocument();
  });

  it("opens native webview DevTools through the backend command", async () => {
    mockTauriApiCommand("openWebviewDevtools", () => undefined);
    const { user } = renderDeveloperTools();

    await showDeveloperTools(user);
    await user.click(screen.getByRole("button", { name: /Open DevTools/u }));

    expect(countTauriApiCalls("openWebviewDevtools")).toBe(1);
  });

  it("routes command failures through the command failure presentation", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { user } = renderDeveloperTools();

    await showDeveloperTools(user);
    await showFailureSimulations(user);
    await user.click(screen.getByRole("button", { name: /Command handler failure/u }));

    expect(toastManager.add).toHaveBeenCalledWith({
      description: "Native fullscreen state update failed.",
      title: "Command failed.",
      type: "error",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (commands: view.fullscreen).",
      expect.any(Error),
    );
  });

  it("routes expected missing-file opens through the domain presentation", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { user } = renderDeveloperTools();

    await showDeveloperTools(user);
    await showFailureSimulations(user);
    await user.click(screen.getByRole("button", { name: /Missing file open/u }));

    expect(toastManager.add).toHaveBeenCalledWith({
      description: "C:/Leafdown/debug/missing.md",
      title: "Markdown file not found.",
      type: "error",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("keeps cancellations silent", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { user } = renderDeveloperTools();

    await showDeveloperTools(user);
    await showFailureSimulations(user);
    await user.click(screen.getByRole("button", { name: /Cancelled open transition/u }));

    expect(toastManager.add).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("requests an app-surface render failure instead of crashing itself", async () => {
    const { onSimulateRenderFailure, user } = renderDeveloperTools();

    await showDeveloperTools(user);
    await showFailureSimulations(user);
    await user.click(screen.getByRole("button", { name: /Render document surface crash/u }));

    expect(onSimulateRenderFailure).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Open developer tools" })).toBeInTheDocument();
  });

  it("stays mounted when the app error boundary catches the simulated render failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { user } = renderWithUser(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open developer tools" })).toBeInTheDocument();
    });

    await showDeveloperTools(user);
    await showFailureSimulations(user);
    await user.click(screen.getByRole("button", { name: /Render document surface crash/u }));

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(screen.getByRole("button", { name: "Open developer tools" })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (react: render).",
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.stringContaining("DeveloperRenderFailure"),
      }),
    );
  });
});
