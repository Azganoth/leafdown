// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";

describe("KeyboardShortcutsDialog", () => {
  it("shows grouped read-only shortcuts, alternate bindings, and the Mod legend", () => {
    renderWithUser(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const edit = within(dialog).getByRole("region", { name: "Edit" });
    const redo = within(edit).getByText("Redo").closest("li");

    expect(redo).not.toBeNull();
    expect(within(redo!).getByText("Mod+Y")).toBeInTheDocument();
    expect(within(redo!).getByText("Mod+Shift+Z")).toBeInTheDocument();
    expect(within(redo!).getByText("or")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Mod means Ctrl on Windows and Linux, or Command on macOS."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("About")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Print...")).not.toBeInTheDocument();
    const contextMenu = within(edit).getByText("Open editor context menu").closest("li");
    expect(within(contextMenu!).getByText("Shift+F10")).toBeInTheDocument();
    expect(within(contextMenu!).getAllByText("Menu")).toHaveLength(2);
    expect(within(edit).getByText("Preview footnote definition")).toBeInTheDocument();
    expect(within(edit).getByText("Extend block selection")).toBeInTheDocument();
  });

  it("draws each key of a binding as its own key cap", () => {
    renderWithUser(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const redo = within(dialog).getByText("Redo").closest("li")!;
    const binding = within(redo).getByText("Mod+Shift+Z").closest("kbd")!;

    expect([...binding.querySelectorAll("kbd")].map((key) => key.textContent)).toEqual([
      "Mod",
      "Shift",
      "Z",
    ]);
    expect(dialog.querySelector('[data-slot="scroll-area-viewport"]')).toContainElement(redo);
  });

  it("focuses the shortcut list when it opens", async () => {
    renderWithUser(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const viewport = dialog.querySelector('[data-slot="scroll-area-viewport"]');

    await waitFor(() => expect(document.activeElement).toBe(viewport));
  });

  it("closes by keyboard without executing a row", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithUser(<KeyboardShortcutsDialog open onOpenChange={onOpenChange} />);

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.any(Object));
  });
});
