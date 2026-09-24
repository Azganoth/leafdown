// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelPendingConfirmations,
  requestConfirmation,
  useConfirmationStore,
} from "@/lib/confirmation";
import { renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { ConfirmationDialog } from "./confirmation-dialog";

const OPTIONS = {
  title: "Open local file?",
  message: "Open this local file with the system default app?",
  detail: "C:/Notes/manual.pdf",
  confirmLabel: "Open file",
  cancelLabel: "Cancel",
};

afterEach(cancelPendingConfirmations);

describe("ConfirmationDialog", () => {
  it("names the target, traps focus, and restores the initiating control after Escape", async () => {
    const decision = vi.fn();
    const { user } = renderWithUser(
      <>
        <button type="button" onClick={() => void requestConfirmation(OPTIONS).then(decision)}>
          Activate link
        </button>
        <ConfirmationDialog />
      </>,
    );

    const initiator = screen.getByRole("button", { name: "Activate link" });
    await user.click(initiator);

    const prompt = await screen.findByRole("dialog", { name: OPTIONS.title });
    expect(prompt).toHaveTextContent(OPTIONS.message);
    expect(prompt).toHaveTextContent(OPTIONS.detail);
    expect(within(prompt).getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab();
    expect(prompt.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(decision).toHaveBeenCalledWith(false));
    await waitFor(() => expect(initiator).toHaveFocus());

    await user.click(initiator);
    const secondPrompt = await screen.findByRole("dialog", { name: OPTIONS.title });
    await user.click(within(secondPrompt).getByRole("button", { name: "Open file" }));

    await waitFor(() => expect(decision).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(initiator).toHaveFocus());
  });

  it("cancels on outside press and does not dismiss from the titlebar", async () => {
    const { user } = renderWithUser(
      <>
        <header id="leafdown-titlebar">
          <div data-tauri-drag-region>Titlebar</div>
        </header>
        <ConfirmationDialog />
      </>,
    );

    const decision = requestConfirmation(OPTIONS);
    const prompt = await screen.findByRole("dialog", { name: OPTIONS.title });
    await user.pointer([
      { keys: "[MouseLeft>]", target: screen.getByText("Titlebar") },
      { keys: "[/MouseLeft]", target: screen.getByText("Titlebar") },
    ]);
    expect(prompt).toBeInTheDocument();

    const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);

    await expect(decision).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: OPTIONS.title })).toBeNull());
  });

  it("shows one queued decision at a time and accepts only the active prompt", async () => {
    const { user } = renderWithUser(<ConfirmationDialog />);
    const first = requestConfirmation(OPTIONS);
    const second = requestConfirmation({
      ...OPTIONS,
      title: "Open outside folder?",
      detail: "C:/Other/target.md",
    });

    const firstPrompt = await screen.findByRole("dialog", { name: OPTIONS.title });
    expect(screen.queryByRole("dialog", { name: "Open outside folder?" })).toBeNull();
    const firstId = useConfirmationStore.getState().current!.id;
    await user.click(within(firstPrompt).getByRole("button", { name: "Cancel" }));
    await expect(first).resolves.toBe(false);

    const secondPrompt = await screen.findByRole("dialog", { name: "Open outside folder?" });
    expect(useConfirmationStore.getState().current!.id).not.toBe(firstId);
    await user.click(within(secondPrompt).getByRole("button", { name: "Open file" }));
    await expect(second).resolves.toBe(true);
  });
});
