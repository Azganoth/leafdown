// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { notifyError, notifyErrorWithActionMenu, notifyPending, toastManager } from "@/lib/toast";
import { act, renderWithUser, screen, waitFor } from "@/test/utils/react";
import { hoverTooltip } from "@/test/utils/tooltip";

import { Toaster } from "./toast";

describe("Toaster", () => {
  beforeEach(() => {
    vi.mocked(toastManager.add).mockRestore();
  });

  it("names its close button in a tooltip", async () => {
    const { user } = renderWithUser(<Toaster timeout={0} />);

    act(() => {
      notifyError("Could not save.");
    });

    await screen.findByText("Could not save.");
    const close = document.querySelector('[data-slot="toast-close"]');

    expect(close).toHaveAttribute("aria-label", "Close toast");
    expect(await hoverTooltip(user, close!)).toHaveTextContent("Close toast");
  });

  it("offers an action menu and closes the toast when an item runs", async () => {
    const chooseLatin = vi.fn();
    const chooseCyrillic = vi.fn();
    const { user } = renderWithUser(<Toaster timeout={0} />);

    act(() => {
      notifyErrorWithActionMenu(
        { title: "Invalid Markdown file encoding." },
        {
          label: "Reopen with encoding",
          items: [
            { label: "Western (Windows-1252, ISO-8859-1)", checked: true, run: chooseLatin },
            { label: "Cyrillic (KOI8-R)", run: chooseCyrillic },
          ],
        },
      );
    });

    await user.click(await screen.findByRole("button", { name: "Reopen with encoding" }));

    expect(
      screen.getByRole("menuitemradio", { name: "Western (Windows-1252, ISO-8859-1)" }),
    ).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("menuitemradio", { name: "Cyrillic (KOI8-R)" }));

    expect(chooseCyrillic).toHaveBeenCalledOnce();
    expect(chooseLatin).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Invalid Markdown file encoding.")).not.toBeInTheDocument(),
    );
  });

  it("settles a pending toast in place and closes it when its action runs", async () => {
    const viewRelease = vi.fn();
    const { user } = renderWithUser(<Toaster timeout={0} />);
    let settle: ReturnType<typeof notifyPending> | undefined;

    act(() => {
      settle = notifyPending("Checking for updates…");
    });

    expect(await screen.findByText("Checking for updates…")).toBeInTheDocument();

    act(() => {
      settle?.(
        "info",
        { title: "Leafdown 0.1.0-alpha.4 is available.", description: "You have 0.1.0-alpha.3." },
        { label: "View release", run: viewRelease },
      );
    });

    expect(await screen.findByText("Leafdown 0.1.0-alpha.4 is available.")).toBeInTheDocument();
    expect(screen.queryByText("Checking for updates…")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View release" }));

    expect(viewRelease).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByText("Leafdown 0.1.0-alpha.4 is available.")).not.toBeInTheDocument(),
    );
  });
});
