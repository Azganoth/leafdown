// @vitest-environment happy-dom

import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser, screen, within } from "@/test/utils/react";

import type { HelpPageId } from "../services/pages";
import { HelpDialog } from "./help-dialog";

function TestHelpDialog({ initialPage = "getting-started" }: { initialPage?: HelpPageId | null }) {
  const [page, setPage] = useState<HelpPageId | null>(initialPage);
  return (
    <>
      <button type="button" onClick={() => setPage("getting-started")}>
        Open Help
      </button>
      <HelpDialog page={page} onPageChange={setPage} />
    </>
  );
}

describe("Help dialog", () => {
  it("navigates bundled pages without a request or changing the current window", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { user } = renderWithUser(<TestHelpDialog />);

    expect(screen.getByRole("dialog", { name: "Getting started" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Getting started" })).toBeInTheDocument();
    expect(within(screen.getByRole("article")).queryByRole("heading", { level: 1 })).toBeNull();

    await user.click(
      within(screen.getByRole("article")).getByRole("button", { name: "Markdown reference" }),
    );

    expect(screen.getByRole("dialog", { name: "Markdown reference" })).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("opens explicit web links through the system opener", async () => {
    const { user } = renderWithUser(<TestHelpDialog initialPage="markdown-reference" />);
    await user.click(
      within(screen.getByRole("article")).getByRole("button", { name: "Specification" }),
    );
    expect(openUrl).toHaveBeenCalledWith(
      "https://github.com/Azganoth/leafdown/blob/main/docs/specification.md",
    );
  });

  it("focuses the dialog and returns focus when closed", async () => {
    const { user } = renderWithUser(<TestHelpDialog initialPage={null} />);
    await user.click(screen.getByRole("button", { name: "Open Help" }));
    expect(
      screen.getByRole("dialog", { name: "Getting started" }).contains(document.activeElement),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Help" })).toHaveFocus();
  });
});
