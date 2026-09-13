// @vitest-environment happy-dom

import { openUrl } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser, screen } from "@/test/utils/react";

import { AboutDialog } from "./about-dialog";

describe("about-dialog", () => {
  it("shows the app version", async () => {
    renderWithUser(<AboutDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Leafdown" })).toBeInTheDocument();
    expect(await screen.findByText("0.0.0-test")).toBeInTheDocument();
    expect(screen.getByText("GPL-3.0-or-later")).toBeInTheDocument();
  });

  it("opens the repository and the license externally", async () => {
    const { user } = renderWithUser(<AboutDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Repository" }));
    await user.click(screen.getByRole("button", { name: "License" }));

    expect(vi.mocked(openUrl)).toHaveBeenCalledWith("https://github.com/Azganoth/leafdown");
    expect(vi.mocked(openUrl)).toHaveBeenCalledWith("https://www.gnu.org/licenses/gpl-3.0.html");
  });
});
