// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { withMacUserAgent } from "@/test/utils/platform";
import { renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";

describe("KeyboardShortcutsDialog", () => {
  it("shows macOS symbols with full names for assistive technology", async () => {
    await withMacUserAgent(() => {
      renderWithUser(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);
      const binding = screen.getByText("Shift+Command+Z").closest("kbd")!;
      expect([...binding.querySelectorAll("kbd")].map((key) => key.textContent)).toEqual([
        "⇧",
        "⌘",
        "Z",
      ]);
      expect(screen.getByRole("dialog")).not.toHaveTextContent("Mod");
    });
  });

  it("shows grouped read-only shortcuts, alternate bindings, without a modifier legend", () => {
    renderWithUser(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const edit = within(dialog).getByRole("region", { name: "Edit" });
    const redo = within(edit).getByText("Redo").closest("li");

    expect(redo).not.toBeNull();
    expect(within(redo!).getByText("Ctrl+Y")).toBeInTheDocument();
    expect(within(redo!).getByText("Ctrl+Shift+Z")).toBeInTheDocument();
    expect(within(redo!).getByText("or")).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/Mod/u);
    expect(within(dialog).queryByText("About")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Print...")).not.toBeInTheDocument();
    const contextMenu = within(edit).getByText("Open editor context menu").closest("li");
    expect(within(contextMenu!).getByText("Shift+F10")).toBeInTheDocument();
    expect(within(contextMenu!).getAllByText("Menu")).toHaveLength(2);
    expect(within(edit).getByText("Preview footnote or linked document")).toBeInTheDocument();
    expect(within(edit).getByText("Extend block selection")).toBeInTheDocument();
  });

  it("draws each key of a binding as its own key cap", () => {
    renderWithUser(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const redo = within(dialog).getByText("Redo").closest("li")!;
    const binding = within(redo).getByText("Ctrl+Shift+Z").closest("kbd")!;

    expect([...binding.querySelectorAll("kbd")].map((key) => key.textContent)).toEqual([
      "Ctrl",
      "Shift",
      "Z",
    ]);
    expect(dialog.querySelector('[data-slot="scroll-area-viewport"]')).toContainElement(redo);
  });

  it("focuses the search field when it opens", async () => {
    renderWithUser(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("searchbox", { name: "Search shortcuts" })).toHaveFocus(),
    );
  });

  it("narrows the list to commands, menus, or keys matching the search", async () => {
    const { user } = renderWithUser(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const search = screen.getByRole("searchbox", { name: "Search shortcuts" });

    await user.type(search, "heading");
    expect(
      within(dialog)
        .getAllByRole("region")
        .map((group) => group.getAttribute("aria-label")),
    ).toEqual(["Format"]);
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(6);
    expect(within(dialog).getByRole("status")).toHaveTextContent("6 shortcuts");
    expect(within(dialog).getAllByText("Heading", { selector: "mark" })).toHaveLength(6);

    await user.clear(search);
    await user.type(search, "ctrl shift f");
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining("Find in folder")]);

    await user.type(search, "zzz");
    expect(within(dialog).getByText("No shortcuts match")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(within(dialog).getByRole("region", { name: "File" })).toBeInTheDocument();
  });

  it("finds the shortcut a recorded key press runs and leaves recording on Escape", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithUser(<KeyboardShortcutsDialog open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });

    await user.click(within(dialog).getByRole("button", { name: "Record keys" }));
    expect(within(dialog).getByRole("button", { name: "Record keys" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const recorder = screen.getByRole("searchbox", { name: "Press a shortcut to find it" });
    expect(recorder).toHaveFocus();

    await user.keyboard("{Control>}{Shift>}F{/Shift}{/Control}");
    expect(recorder).toHaveValue("Ctrl+Shift+F");
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining("Find in folder")]);

    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox", { name: "Search shortcuts" })).toHaveValue("");
    expect(within(dialog).getByRole("region", { name: "File" })).toBeInTheDocument();
  });

  it("starts each opening with an empty search", async () => {
    const { rerender, user } = renderWithUser(
      <KeyboardShortcutsDialog open onOpenChange={vi.fn()} />,
    );
    await user.type(screen.getByRole("searchbox", { name: "Search shortcuts" }), "heading");

    rerender(<KeyboardShortcutsDialog open={false} onOpenChange={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    rerender(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);

    expect(await screen.findByRole("searchbox", { name: "Search shortcuts" })).toHaveValue("");
  });

  it("closes by keyboard without executing a row", async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithUser(<KeyboardShortcutsDialog open onOpenChange={onOpenChange} />);

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.any(Object));
  });
});
