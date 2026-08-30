// @vitest-environment happy-dom

import { StrictMode, useState } from "react";
import { describe, expect, it, vi, type Mock } from "vitest";

import { createActiveEditorCommandState, createEditorCommandState } from "@/test/factories/editor";
import { dispatchDOMEvent } from "@/test/utils/events";
import { act, render, renderWithUser, screen, waitFor } from "@/test/utils/react";

import type { ContextPopupRequest } from "../plugins/contextPopup";
import type { ContextPopupAnchorMode } from "../utils/contextPopupAnchor";
import { EditorContextPopup } from "./editor-context-popup";

const noop = () => {};

const createAnchorRect = (top = 60): DOMRect => {
  const rect = { bottom: top + 20, height: 20, left: 40, right: 41, top, width: 1, x: 40, y: top };

  return { ...rect, toJSON: () => rect };
};

const positioner = () => document.querySelector<HTMLElement>("[data-slot='popover-positioner']");

const expectRepositioning = (expected: boolean) => {
  if (expected) {
    expect(positioner()).toHaveAttribute("data-leafdown-context-popup-repositioning", "");
  } else {
    expect(positioner()).not.toHaveAttribute("data-leafdown-context-popup-repositioning");
  }
};

// The positioner is parked until Floating UI has placed it, so a pixel offset is also the signal
// that a placement has happened.
const wrapperTranslateY = () => {
  const transform = positioner()?.style.transform ?? "";
  const placed = /translate\([^,]+,\s*(-?[\d.]+)px\)/u.exec(transform);

  if (!placed) {
    throw new Error(`Expected a placed positioner, got: ${transform || "no transform"}`);
  }

  return Number(placed[1]);
};

const flushPlacement = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      }),
  );

const ANCHOR = { contextElement: document.body, getRect: () => createAnchorRect() };
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

describe("editor-context-popup", () => {
  it("positions against the measured selection instead of a rendered anchor element", async () => {
    const getRect = vi.fn((_mode: ContextPopupAnchorMode) => createAnchorRect());

    render(
      <StrictMode>
        <EditorContextPopup
          request={{ anchor: { contextElement: document.body, getRect }, source: "pointer" }}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />
      </StrictMode>,
    );

    expectRepositioning(false);
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

    it("keeps the toolbar to a single roving tab stop", () => {
      renderToolbar(POINTER_REQUEST);

      const controls = screen.getAllByRole("button");

      expect(controls).toHaveLength(14);
      expect(controls.filter((control) => control.getAttribute("tabindex") === "0")).toHaveLength(
        1,
      );
      controls.slice(1).forEach((control) => {
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

  describe("anchor mode", () => {
    const renderWithSpiedAnchor = (
      source: ContextPopupRequest["source"],
      measure: () => DOMRect = () => createAnchorRect(),
    ) => {
      const getRect = vi.fn((_mode: ContextPopupAnchorMode) => measure());
      const request = { anchor: { contextElement: document.body, getRect }, source };
      const view = render(
        <EditorContextPopup
          request={request}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );

      return { getRect, request, view };
    };

    const modesUsed = (getRect: Mock<(mode: ContextPopupAnchorMode) => DOMRect>) =>
      new Set(getRect.mock.calls.map(([mode]) => mode));

    it("follows the selection out of view for a popup focus is not in", async () => {
      const { getRect } = renderWithSpiedAnchor("pointer");

      await waitFor(() => {
        expect(getRect).toHaveBeenCalled();
      });
      expect(modesUsed(getRect)).toEqual(new Set(["live"]));
    });

    it("pins a keyboard popup from the moment it opens", async () => {
      const { getRect } = renderWithSpiedAnchor("keyboard");

      await waitFor(() => {
        expect(getRect).toHaveBeenCalled();
      });
      expect(modesUsed(getRect)).toEqual(new Set(["pinned"]));
    });

    it("moves onto the selection when a fresh request measures it elsewhere", async () => {
      const openedAt = 60;
      const movedTo = 400;
      let rect = createAnchorRect(openedAt);
      const request: ContextPopupRequest = {
        anchor: { contextElement: document.body, getRect: () => rect },
        source: "pointer",
      };
      const renderPopup = () => (
        <EditorContextPopup
          request={{ ...request }}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />
      );
      const view = render(renderPopup());

      await waitFor(() => {
        expect(wrapperTranslateY()).toEqual(expect.any(Number));
      });

      const placedAt = wrapperTranslateY();

      rect = createAnchorRect(movedTo);
      view.rerender(renderPopup());
      expectRepositioning(true);

      await waitFor(() => {
        expect(wrapperTranslateY()).toBe(placedAt + movedTo - openedAt);
      });
    });

    it("holds one rect for as long as focus stays inside the popup", async () => {
      let rect = createAnchorRect(60);
      const { getRect, request, view } = renderWithSpiedAnchor("keyboard", () => rect);

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      const placedAt = wrapperTranslateY();

      rect = createAnchorRect(400);

      // A fresh request would otherwise re-measure; a popup being worked in must not move.
      view.rerender(
        <EditorContextPopup
          request={{ ...request, source: "pointer" }}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );
      await flushPlacement();

      expect(modesUsed(getRect)).toEqual(new Set(["pinned"]));
      expect(getRect).toHaveBeenCalledTimes(1);
      expect(wrapperTranslateY()).toBe(placedAt);
      expectRepositioning(false);
    });
  });

  describe("visibility", () => {
    it("hides while none of the selection is visible and returns when it scrolls back", async () => {
      let rect = createAnchorRect(-5000);
      const onClose = vi.fn();

      render(
        <EditorContextPopup
          request={{
            anchor: { contextElement: document.body, getRect: () => rect },
            source: "pointer",
          }}
          commandState={enabledPopupCommandState}
          onClose={onClose}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(positioner()).toHaveAttribute("data-anchor-hidden");
      });
      expect(screen.getByTestId("editor-context-popup")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      rect = createAnchorRect();
      dispatchDOMEvent(window, "resize");

      await waitFor(() => {
        expect(positioner()).not.toHaveAttribute("data-anchor-hidden");
      });
    });

    it("keeps a popup holding focus visible when its selection leaves the viewport", async () => {
      render(
        <EditorContextPopup
          request={{
            anchor: {
              contextElement: document.body,
              // Mirrors the resolver: a pinned anchor stays inside the viewport, a live one
              // follows the selection out of it.
              getRect: (mode) => createAnchorRect(mode === "pinned" ? 0 : -5000),
            },
            source: "keyboard",
          }}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });
      expect(positioner()).not.toHaveAttribute("data-anchor-hidden");
    });
  });

  describe("scroll", () => {
    it("cancels selection easing before a scroll is positioned", async () => {
      const request: ContextPopupRequest = {
        anchor: ANCHOR,
        source: "pointer",
      };
      const renderPopup = () => (
        <EditorContextPopup
          request={{ ...request }}
          commandState={enabledPopupCommandState}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
        />
      );
      const view = render(renderPopup());

      await waitFor(() => {
        expect(wrapperTranslateY()).toEqual(expect.any(Number));
      });

      view.rerender(renderPopup());
      expectRepositioning(true);

      dispatchDOMEvent(document, "scroll");

      expectRepositioning(false);
    });

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
