// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCommandUIStore, type AppCommandId, type CommandState } from "@/commands";
import { setDefaultUI } from "@/test/utils/appStores";
import { renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { CommandPalette } from "./command-palette";

interface HarnessProps {
  commandState?: (commandId: AppCommandId) => CommandState;
  onExecute?: (commandId: AppCommandId) => void;
}

function Harness({ commandState = () => ({ enabled: true }), onExecute = vi.fn() }: HarnessProps) {
  const open = useCommandUIStore((state) => state.commandPaletteOpen);
  const setOpen = useCommandUIStore((state) => state.setCommandPaletteOpen);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open palette
      </button>
      <CommandPalette
        commandState={commandState}
        onExecute={onExecute}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
}

describe("CommandPalette", () => {
  beforeEach(() => setDefaultUI());

  it("focuses search, shows shared labels, paths and shortcuts, and returns focus on Escape", async () => {
    const { user } = renderWithUser(<Harness />);
    const opener = screen.getByRole("button", { name: "Open palette" });
    await user.click(opener);

    const query = screen.getByRole("combobox", { name: "Search commands" });
    expect(query).toHaveFocus();
    await user.type(query, "save as");

    const result = screen.getByRole("option", { name: /Save as/u });
    expect(within(result).getByText("File › Save as...")).toBeInTheDocument();
    expect(within(result).getByText("Mod+Shift+S")).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toHaveAttribute("tabindex", "-1");
    await user.tab();
    expect(screen.getByRole("button", { name: "Run Enter" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(opener).toHaveFocus());
    expect(screen.queryByRole("combobox", { name: "Search commands" })).not.toBeInTheDocument();
  });

  it("moves through results and dispatches an editor command after closing", async () => {
    const onExecute = vi.fn(() => {
      expect(useCommandUIStore.getState().commandPaletteOpen).toBe(false);
    });
    const { user } = renderWithUser(<Harness onExecute={onExecute} />);
    await user.click(screen.getByRole("button", { name: "Open palette" }));
    const query = screen.getByRole("combobox", { name: "Search commands" });

    await user.type(query, "strong");
    expect(screen.getByRole("option", { name: /Strong/u })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{Enter}");

    await waitFor(() => expect(onExecute).toHaveBeenCalledWith("format.strong"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps unavailable commands visible and follows state changes", async () => {
    const onExecute = vi.fn();
    const commandState = (id: AppCommandId): CommandState =>
      id === "file.save" ? { enabled: false, reason: "No document is open." } : { enabled: true };
    const { rerender, user } = renderWithUser(
      <Harness commandState={commandState} onExecute={onExecute} />,
    );
    await user.click(screen.getByRole("button", { name: "Open palette" }));
    await user.type(screen.getByRole("combobox", { name: "Search commands" }), "save");
    const save = screen.getByRole("option", { name: /^Save File/u });

    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(within(save).getByText("No document is open.")).toBeInTheDocument();
    await user.click(save);
    expect(onExecute).not.toHaveBeenCalled();

    rerender(<Harness commandState={() => ({ enabled: true })} onExecute={onExecute} />);
    expect(save).toHaveAttribute("aria-disabled", "false");
    await user.click(save);
    await waitFor(() => expect(onExecute).toHaveBeenCalledWith("file.save"));
  });

  it("skips unavailable commands when running the keyboard selection", async () => {
    const onExecute = vi.fn();
    const commandState = (id: AppCommandId): CommandState =>
      id === "file.save" ? { enabled: false } : { enabled: true };
    const { user } = renderWithUser(<Harness commandState={commandState} onExecute={onExecute} />);
    await user.click(screen.getByRole("button", { name: "Open palette" }));
    await user.type(screen.getByRole("combobox", { name: "Search commands" }), "save");

    expect(screen.getByRole("option", { name: /^Save File/u })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("option", { name: /Save as/u })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onExecute).toHaveBeenCalledWith("file.saveAs"));
  });

  it("runs the selected command from the footer and omits generic unavailable text", async () => {
    const onExecute = vi.fn();
    const commandState = (id: AppCommandId): CommandState =>
      id === "format.table.addRowBelow" ? { enabled: false } : { enabled: true };
    const { user } = renderWithUser(<Harness commandState={commandState} onExecute={onExecute} />);
    await user.click(screen.getByRole("button", { name: "Open palette" }));
    const query = screen.getByRole("combobox", { name: "Search commands" });

    await user.type(query, "add row below");
    expect(screen.getByRole("option", { name: /Add row below/u })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Run Enter" })).toBeDisabled();
    expect(screen.queryByText("The editor command is not available.")).not.toBeInTheDocument();

    await user.clear(query);
    await user.type(query, "strong");
    const run = screen.getByRole("button", { name: "Run Enter" });
    expect(run).toBeEnabled();
    await user.click(run);
    await waitFor(() => expect(onExecute).toHaveBeenCalledWith("format.strong"));
  });

  it("supports End, Home and pointer selection, with an empty-result message", async () => {
    const onExecute = vi.fn();
    const { user } = renderWithUser(<Harness onExecute={onExecute} />);
    await user.click(screen.getByRole("button", { name: "Open palette" }));
    const query = screen.getByRole("combobox", { name: "Search commands" });
    await user.type(query, "save");
    const options = screen.getAllByRole("option");

    await user.keyboard("{End}");
    expect(options.at(-1)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.click(options[1]);
    await waitFor(() => expect(onExecute).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Open palette" }));
    await user.type(screen.getByRole("combobox", { name: "Search commands" }), "no such command");
    expect(screen.getByText("No matching commands")).toBeInTheDocument();
  });
});
