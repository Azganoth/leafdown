import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { createActiveEditorCommandState, createEditorCommandState } from "@/test/factories/editor";
import { dispatchDOMEvent } from "@/test/utils/events";
import { render, renderWithUser, screen, waitFor } from "@/test/utils/react";

import type { ContextPopupRequest } from "../plugins/contextPopup";
import { EditorContextPopup } from "./EditorContextPopup";

const noop = () => {};

const createAnchorRect = (): DOMRect => {
  const rect = { bottom: 80, height: 20, left: 40, right: 41, top: 60, width: 1, x: 40, y: 60 };

  return { ...rect, toJSON: () => rect };
};

const ANCHOR = { contextElement: document.body, getRect: createAnchorRect };
const POINTER_REQUEST: ContextPopupRequest = { anchor: ANCHOR, source: "pointer" };
const KEYBOARD_REQUEST: ContextPopupRequest = { anchor: ANCHOR, source: "keyboard" };

interface ClosingPopupHostProps {
  onReturnFocus?: () => void;
}

// A mock `onClose` leaves the popup mounted, so close paths asserted against one pass either way.
function ClosingPopupHost({ onReturnFocus = noop }: ClosingPopupHostProps) {
  const [request, setRequest] = useState<ContextPopupRequest | null>(KEYBOARD_REQUEST);

  return (
    <>
      <button type="button">Outside</button>
      <EditorContextPopup
        request={request}
        commandState={enabledPopupCommandState}
        onClose={() => setRequest(null)}
        onExecute={noop}
        onReturnFocus={onReturnFocus}
      />
    </>
  );
}

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
  it("positions against the measured selection instead of a rendered anchor element", async () => {
    const getRect = vi.fn(createAnchorRect);

    render(
      <EditorContextPopup
        request={{ anchor: { contextElement: document.body, getRect }, source: "pointer" }}
        commandState={enabledPopupCommandState}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(getRect).toHaveBeenCalled();
    });
    expect(document.querySelector('[data-slot="popover-anchor"]')).toBeNull();
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

    it("leaves focus where a click outside put it", async () => {
      const onReturnFocus = vi.fn();
      const { user } = renderWithUser(<ClosingPopupHost onReturnFocus={onReturnFocus} />);

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      const outside = screen.getByRole("button", { name: "Outside" });
      await user.click(outside);

      await waitFor(() => {
        expect(screen.queryByTestId("editor-context-popup")).not.toBeInTheDocument();
      });
      expect(onReturnFocus).not.toHaveBeenCalled();
      expect(outside).toHaveFocus();
    });

    it("returns focus to the editor when Escape closes it from the toolbar", async () => {
      const onReturnFocus = vi.fn();
      const { user } = renderWithUser(<ClosingPopupHost onReturnFocus={onReturnFocus} />);

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByTestId("editor-context-popup")).not.toBeInTheDocument();
      });
      expect(onReturnFocus).toHaveBeenCalledTimes(1);
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

  describe("toolbar semantics", () => {
    const renderToolbar = (
      request: ContextPopupRequest,
      overrides: Partial<Parameters<typeof EditorContextPopup>[0]> = {},
    ) =>
      renderWithUser(
        <EditorContextPopup
          request={request}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
          {...overrides}
        />,
      );

    it("exposes a labeled toolbar rather than an unnamed dialog", () => {
      renderToolbar(POINTER_REQUEST);

      expect(screen.getByRole("toolbar", { name: "Context actions" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("group")).not.toBeInTheDocument();
    });

    it("holds every control outside the tab sequence", () => {
      renderToolbar(POINTER_REQUEST);

      const controls = screen.getAllByRole("button");

      expect(controls).toHaveLength(14);
      controls.forEach((control) => {
        expect(control).toHaveAttribute("tabindex", "-1");
      });
    });

    it("moves along a row with the horizontal arrows", async () => {
      const { user } = renderToolbar(KEYBOARD_REQUEST);

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowRight}");
      await waitFor(() => {
        expect(screen.getByLabelText("Copy")).toHaveFocus();
      });

      await user.keyboard("{ArrowLeft}");
      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });
    });

    it("moves between rows with the vertical arrows, keeping the column", async () => {
      const { user } = renderToolbar(KEYBOARD_REQUEST);

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowRight}{ArrowRight}");
      await waitFor(() => {
        expect(screen.getByLabelText("Paste")).toHaveFocus();
      });

      await user.keyboard("{ArrowDown}");
      expect(screen.getByLabelText("Inline code")).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByLabelText("Paste")).toHaveFocus();
    });

    it("clamps to the nearest column when the next row is shorter", async () => {
      const { user } = renderToolbar(KEYBOARD_REQUEST);

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowRight}{ArrowDown}{ArrowDown}");
      expect(screen.getByLabelText("Ordered list")).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("button", { name: "Block type" })).toHaveFocus();
    });

    it("wraps from the first row back to the last", async () => {
      const { user } = renderToolbar(KEYBOARD_REQUEST);

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("button", { name: "Insert" })).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("button", { name: "Block type" })).toHaveFocus();
    });

    it("opens a submenu with ArrowDown instead of leaving its row", async () => {
      const { user } = renderToolbar(KEYBOARD_REQUEST);

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowUp}{ArrowUp}{ArrowDown}");

      await waitFor(() => {
        expect(screen.getByRole("menu")).toBeInTheDocument();
      });
      expect(screen.getByRole("menuitem", { name: "Paragraph" })).toBeInTheDocument();
    });

    it("skips a row whose commands are all unavailable", async () => {
      const { user } = renderToolbar(KEYBOARD_REQUEST, {
        commandState: {
          ...enabledPopupCommandState,
          enabledCommands: {
            ...enabledPopupCommandState.enabledCommands,
            "format.strong": false,
            "format.emphasis": false,
            "format.inlineCode": false,
            "insert.link": false,
          },
        },
      });

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowDown}");
      expect(screen.getByLabelText("Blockquote")).toHaveFocus();
    });

    it("leaves the toolbar to the editor on Tab", async () => {
      const onClose = vi.fn();
      const { user } = renderToolbar(KEYBOARD_REQUEST, { onClose });

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.tab();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Cut")).toHaveFocus();
    });

    it("runs a focused command with Enter", async () => {
      const onExecute = vi.fn();
      const { user } = renderToolbar(KEYBOARD_REQUEST, { onExecute });

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowRight}{Enter}");

      expect(onExecute).toHaveBeenCalledWith("edit.copy");
    });

    it("runs a submenu command from the keyboard", async () => {
      const onExecute = vi.fn();
      const { user } = renderToolbar(KEYBOARD_REQUEST, { onExecute });

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowUp}{ArrowUp}{Enter}");
      await waitFor(() => {
        expect(screen.getByRole("menuitem", { name: "Paragraph" })).toHaveFocus();
      });

      await user.keyboard("{Enter}");

      expect(onExecute).toHaveBeenCalledWith("format.paragraph");
    });

    it("closes on Escape from inside the toolbar", async () => {
      const onClose = vi.fn();
      const { user } = renderToolbar(KEYBOARD_REQUEST, { onClose });

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalled();
    });

    it("closes only the submenu when Escape comes from inside it", async () => {
      const { user } = renderWithUser(<ClosingPopupHost />);
      const trigger = screen.getByRole("button", { name: "Block type" });

      await user.click(trigger);
      await waitFor(() => {
        expect(screen.getByRole("menu")).toBeInTheDocument();
      });

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("editor-context-popup")).toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  describe("scroll", () => {
    it("stays open on a scroll while focus is still in the editor", () => {
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

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId("editor-context-popup")).toBeInTheDocument();
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
