// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { notifyErrorWithActionMenu, toastManager } from "@/lib/toast";
import { act, renderWithUser, screen, waitFor } from "@/test/utils/react";

import { Toaster } from "./toast";

describe("Toaster", () => {
  beforeEach(() => {
    vi.mocked(toastManager.add).mockRestore();
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
});
