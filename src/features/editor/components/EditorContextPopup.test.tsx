import { describe, expect, it, vi } from "vitest";

import { createActiveEditorCommandState, createEditorCommandState } from "@/test/factories/editor";
import { dispatchDOMEvent } from "@/test/utils/events";
import { render, renderWithUser, screen, waitFor } from "@/test/utils/react";

import type { ContextPopupRequest } from "../plugins/contextPopup";
import { EditorContextPopup } from "./EditorContextPopup";

const ANCHOR = { x: 40, top: 60, bottom: 80 };
const POINTER_REQUEST: ContextPopupRequest = { anchor: ANCHOR, source: "pointer" };
const KEYBOARD_REQUEST: ContextPopupRequest = { anchor: ANCHOR, source: "keyboard" };

const enabledPopupCommandState = createActiveEditorCommandState({
  enabledCommandIds: [
    "edit.cut",
    "edit.copy",
    "edit.paste",
    "edit.delete",
    "format.strong",
    "format.emphasis",
    "format.inlineCode",
    "insert.link",
    "format.blockquote",
    "format.orderedList",
    "format.unorderedList",
    "format.taskList",
    "format.paragraph",
    "format.heading1",
    "insert.paragraph",
  ],
});

describe("EditorContextPopup", () => {
  it("uses the selection range as the collision-aware popup anchor", () => {
    render(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={enabledPopupCommandState}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    const anchor = document.querySelector('[data-slot="popover-anchor"]');

    expect(anchor).toHaveStyle({ height: "20px", left: "40px", top: "60px" });
  });

  it("renders the initial five-row context UI", () => {
    render(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={enabledPopupCommandState}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(screen.getByTestId("editor-context-popup")).toBeInTheDocument();
    [
      "Cut",
      "Copy",
      "Paste",
      "Delete",
      "Strong",
      "Emphasis",
      "Inline code",
      "Link",
      "Blockquote",
      "Ordered list",
      "Unordered list",
      "Task list",
    ].forEach((label) => {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Block type" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert" })).toBeInTheDocument();
  });

  it("routes enabled icon commands and keeps disabled commands visible", async () => {
    const onExecute = vi.fn();

    const { user } = renderWithUser(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={{
          ...enabledPopupCommandState,
          enabledCommands: {
            ...enabledPopupCommandState.enabledCommands,
            "edit.cut": false,
          },
        }}
        onClose={vi.fn()}
        onExecute={onExecute}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Cut")).toBeDisabled();
    await user.click(screen.getByLabelText("Copy"));

    expect(onExecute).toHaveBeenCalledWith("edit.copy");
  });

  it("disables commands while editor command state is inactive", async () => {
    const onExecute = vi.fn();

    const { user } = renderWithUser(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={createEditorCommandState({
          enabledCommandIds: ["edit.copy"],
        })}
        onClose={vi.fn()}
        onExecute={onExecute}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Copy")).toBeDisabled();
    await user.click(screen.getByLabelText("Copy"));

    expect(onExecute).not.toHaveBeenCalled();
  });

  describe("focus ownership", () => {
    it("moves focus into the popup when the keyboard opened it", async () => {
      render(
        <EditorContextPopup
          request={KEYBOARD_REQUEST}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });
    });

    it("skips a leading unavailable command when taking focus", async () => {
      render(
        <EditorContextPopup
          request={KEYBOARD_REQUEST}
          commandState={{
            ...enabledPopupCommandState,
            enabledCommands: { ...enabledPopupCommandState.enabledCommands, "edit.cut": false },
          }}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Copy")).toHaveFocus();
      });
    });

    it("leaves focus in the editor when a pointer opened it", async () => {
      render(
        <EditorContextPopup
          request={POINTER_REQUEST}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("editor-context-popup")).toBeInTheDocument();
      });
      expect(screen.getByLabelText("Cut")).not.toHaveFocus();
    });

    it("takes focus when the keyboard reopens a popup a pointer had opened", async () => {
      const { rerender } = render(
        <EditorContextPopup
          request={POINTER_REQUEST}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );

      expect(screen.getByLabelText("Cut")).not.toHaveFocus();

      rerender(
        <EditorContextPopup
          request={KEYBOARD_REQUEST}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });
    });

    it("returns focus to the editor when it closes while holding focus", async () => {
      const onReturnFocus = vi.fn();
      const { rerender } = render(
        <EditorContextPopup
          request={KEYBOARD_REQUEST}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={onReturnFocus}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      rerender(
        <EditorContextPopup
          request={null}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={onReturnFocus}
        />,
      );

      await waitFor(() => {
        expect(onReturnFocus).toHaveBeenCalledTimes(1);
      });
      expect(document.body).toHaveFocus();
    });

    it("leaves focus alone when it closes without ever holding it", async () => {
      const onReturnFocus = vi.fn();
      const { rerender } = render(
        <EditorContextPopup
          request={POINTER_REQUEST}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={onReturnFocus}
        />,
      );

      rerender(
        <EditorContextPopup
          request={null}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={onReturnFocus}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByTestId("editor-context-popup")).not.toBeInTheDocument();
      });
      expect(onReturnFocus).not.toHaveBeenCalled();
    });
  });

  describe("scroll", () => {
    it("closes on a scroll while focus is still in the editor", () => {
      const onClose = vi.fn();

      render(
        <EditorContextPopup
          request={POINTER_REQUEST}
          commandState={enabledPopupCommandState}
          onClose={onClose}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );

      dispatchDOMEvent(document, "scroll");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("stays open on a scroll while focus is inside it", async () => {
      const onClose = vi.fn();

      render(
        <EditorContextPopup
          request={KEYBOARD_REQUEST}
          commandState={enabledPopupCommandState}
          onClose={onClose}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });
      dispatchDOMEvent(document, "scroll");

      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
