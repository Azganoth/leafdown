import { describe, expect, it, vi } from "vitest";

import { renderWithUser, screen } from "@/test/utils/react";

import { Dialog, DialogContent, DialogTitle } from "./Dialog";

const renderOpenDialog = () => {
  const onOpenChange = vi.fn();

  return {
    ...renderWithUser(
      <>
        <button type="button">Outside</button>
        <header id="leafdown-titlebar" style={{ pointerEvents: "auto" }}>
          <div data-tauri-drag-region>Titlebar</div>
        </header>
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>Preferences</DialogTitle>
          </DialogContent>
        </Dialog>
      </>,
    ),
    onOpenChange,
  };
};

describe("Dialog", () => {
  it("keeps dialogs open when dragging starts from the titlebar drag region", async () => {
    const { onOpenChange, user } = renderOpenDialog();

    await user.pointer([
      { keys: "[MouseLeft>]", target: screen.getByText("Titlebar") },
      { keys: "[/MouseLeft]", target: screen.getByText("Titlebar") },
    ]);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("dismisses dialogs from normal outside pointer interactions", async () => {
    const { onOpenChange, user } = renderOpenDialog();
    const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');

    if (!overlay) {
      throw new Error("Expected dialog overlay to render.");
    }

    await user.click(overlay);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
