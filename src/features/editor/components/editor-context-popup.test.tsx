// @vitest-environment happy-dom

import { StrictMode, useState } from "react";
import { describe, expect, it, vi, type Mock } from "vitest";

import { createActiveEditorCommandState, createEditorCommandState } from "@/test/factories/editor";
import { EXTENDED_TABLE_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { dispatchDOMEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { selectTableCellRange, setSelectionInTableCell } from "@/test/utils/prosemirror";
import { act, render, renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { getEditorCommandState, type EditorCommandId, type EditorCommandState } from "../commands";
import type { CalloutTypeChoice, CalloutTypeChoices } from "../commands/formatting/callouts";
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
const POINTER_REQUEST: ContextPopupRequest = {
  anchor: ANCHOR,
  container: null,
  selectionKind: "text",
  source: "pointer",
};
const KEYBOARD_REQUEST: ContextPopupRequest = {
  anchor: ANCHOR,
  container: null,
  selectionKind: "text",
  source: "keyboard",
};

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

const withEnabledCommands = (...commandIds: EditorCommandId[]) => ({
  ...enabledPopupCommandState,
  enabledCommands: {
    ...enabledPopupCommandState.enabledCommands,
    ...Object.fromEntries(commandIds.map((commandId) => [commandId, true])),
  },
});

const QUICK_ACTION_LABELS = ["Cut", "Copy", "Paste", "Delete"];
const INLINE_ACTION_LABELS = ["Strong", "Emphasis", "Inline code", "Link"];
const BLOCK_FORMATTING_LABELS = ["Blockquote", "Ordered list", "Unordered list", "Task list"];
const TABLE_ROW_LABELS = [
  "Add row above",
  "Add row below",
  "Move row up",
  "Move row down",
  "Delete row",
];
const TABLE_COLUMN_LABELS = [
  "Add column before",
  "Add column after",
  "Move column left",
  "Move column right",
  "Delete column",
];
const TABLE_LABELS = [...TABLE_ROW_LABELS, ...TABLE_COLUMN_LABELS, "Delete table"];

const mountEditor = setupMilkdownEditorMount();

const controlLabels = () =>
  screen
    .getAllByRole("button")
    .map((control) => control.getAttribute("aria-label") ?? control.textContent);

describe("editor-context-popup", () => {
  it("positions against the measured selection instead of a rendered anchor element", async () => {
    const getRect = vi.fn((_mode: ContextPopupAnchorMode) => createAnchorRect());

    render(
      <StrictMode>
        <EditorContextPopup
          request={{
            anchor: { contextElement: document.body, getRect },
            container: null,
            selectionKind: "text",
            source: "pointer",
          }}
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

  it.each<[string, Partial<ContextPopupRequest>, string[]]>([
    [
      "a caret",
      { selectionKind: "caret" },
      ["Paste", ...BLOCK_FORMATTING_LABELS, "Block type", "Insert"],
    ],
    [
      "a text selection",
      { selectionKind: "text" },
      [...QUICK_ACTION_LABELS, ...INLINE_ACTION_LABELS, "Block type"],
    ],
    [
      "a block selection",
      { selectionKind: "block" },
      [
        ...QUICK_ACTION_LABELS,
        "Move block up",
        "Move block down",
        ...BLOCK_FORMATTING_LABELS,
        "Block type",
        "Insert",
      ],
    ],
    [
      "a caret in code",
      { container: "code", selectionKind: "caret" },
      ["Paste", ...BLOCK_FORMATTING_LABELS, "Block type", "Insert"],
    ],
    [
      "a text selection in code",
      { container: "code", selectionKind: "text" },
      [...QUICK_ACTION_LABELS, "Block type"],
    ],
    [
      "a caret in a table",
      { container: "table", selectionKind: "caret" },
      ["Paste", ...TABLE_LABELS, "Insert"],
    ],
    [
      "a text or cell selection in a table",
      { container: "table", selectionKind: "text" },
      [...QUICK_ACTION_LABELS, ...INLINE_ACTION_LABELS, ...TABLE_LABELS],
    ],
  ])("offers %s its own actions", (_label, context, labels) => {
    render(
      <EditorContextPopup
        request={{ ...POINTER_REQUEST, ...context }}
        commandState={enabledPopupCommandState}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(controlLabels()).toEqual(labels);
  });

  it("places an object's actions directly under the quick actions", () => {
    const { rerender } = render(
      <EditorContextPopup
        request={{ ...POINTER_REQUEST, selectionKind: "block" }}
        commandState={withEnabledCommands("format.codeBlockLanguage")}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(controlLabels().slice(0, 6)).toEqual([
      ...QUICK_ACTION_LABELS,
      "Code block language...",
      "Move block up",
    ]);

    rerender(
      <EditorContextPopup
        request={{ ...POINTER_REQUEST, selectionKind: "caret" }}
        commandState={withEnabledCommands("edit.renameFootnote", "edit.jumpToFootnoteDefinition")}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(controlLabels().slice(0, 4)).toEqual([
      "Paste",
      "Rename footnote",
      "Jump to footnote definition",
      "Blockquote",
    ]);
  });

  describe("table commands", () => {
    const renderForEditor = async (
      selectionKind: ContextPopupRequest["selectionKind"],
      select: (mounted: Awaited<ReturnType<typeof mountEditor>>) => void,
    ) => {
      const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);
      const onExecute = vi.fn();

      select(mounted);
      render(
        <EditorContextPopup
          request={{ ...POINTER_REQUEST, container: "table", selectionKind }}
          commandState={getEditorCommandState(mounted.view)}
          onClose={vi.fn()}
          onExecute={onExecute}
          onReturnFocus={vi.fn()}
        />,
      );

      return onExecute;
    };

    const enabledTableLabels = () =>
      TABLE_LABELS.filter((label) => !screen.getByLabelText<HTMLButtonElement>(label).disabled);

    it("keeps the header row's protected row commands visible but disabled for a caret", async () => {
      await renderForEditor("caret", (mounted) => {
        setSelectionInTableCell(mounted, 0, 0);
      });

      expect(enabledTableLabels()).toEqual([
        "Add row below",
        ...TABLE_COLUMN_LABELS.filter((label) => label !== "Move column left"),
        "Delete table",
      ]);
    });

    it("keeps the header row's protected row commands disabled for a cell selection reaching it", async () => {
      await renderForEditor("text", (mounted) => {
        selectTableCellRange(mounted, { col: 0, row: 0 }, { col: 1, row: 1 });
      });

      expect(enabledTableLabels()).toEqual([
        "Add row below",
        "Add column before",
        "Add column after",
        "Delete column",
        "Delete table",
      ]);
    });

    it("runs the existing command for a body row", async () => {
      const onExecute = await renderForEditor("caret", (mounted) => {
        setSelectionInTableCell(mounted, 1, 0);
      });

      expect(enabledTableLabels()).toEqual(
        TABLE_LABELS.filter((label) => label !== "Move row up" && label !== "Move column left"),
      );

      screen.getByLabelText("Move row down").click();

      expect(onExecute).toHaveBeenCalledWith("format.table.moveRowDown");
    });
  });

  it("leaves no indicator column beside submenu rows that already carry an icon", async () => {
    const { user } = renderWithUser(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={enabledPopupCommandState}
        onClose={vi.fn()}
        onExecute={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Block type" }));

    const rows = await screen.findAllByRole("menuitem");

    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row).not.toHaveAttribute("data-inset");
    });
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

  it("offers each footnote action only where the footnote context supports it", async () => {
    const onExecute = vi.fn();
    const { rerender, user } = renderWithUser(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={enabledPopupCommandState}
        onClose={vi.fn()}
        onExecute={onExecute}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Rename footnote")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Jump to footnote definition")).not.toBeInTheDocument();

    rerender(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={withEnabledCommands("edit.renameFootnote", "edit.jumpToFootnoteDefinition")}
        onClose={vi.fn()}
        onExecute={onExecute}
        onReturnFocus={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText("Rename footnote"));
    await user.click(screen.getByLabelText("Jump to footnote definition"));

    expect(onExecute).toHaveBeenNthCalledWith(1, "edit.renameFootnote");
    expect(onExecute).toHaveBeenNthCalledWith(2, "edit.jumpToFootnoteDefinition");

    rerender(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={withEnabledCommands("edit.jumpToFootnoteDefinition")}
        onClose={vi.fn()}
        onExecute={onExecute}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Rename footnote")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Jump to footnote definition")).toBeEnabled();
  });

  it("offers the code block language only inside a fenced code block", async () => {
    const onExecute = vi.fn();
    const { rerender, user } = renderWithUser(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={enabledPopupCommandState}
        onClose={vi.fn()}
        onExecute={onExecute}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Code block language...")).not.toBeInTheDocument();

    rerender(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={{
          ...enabledPopupCommandState,
          enabledCommands: {
            ...enabledPopupCommandState.enabledCommands,
            "format.codeBlockLanguage": true,
          },
        }}
        onClose={vi.fn()}
        onExecute={onExecute}
        onReturnFocus={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText("Code block language..."));

    expect(onExecute).toHaveBeenCalledWith("format.codeBlockLanguage");
  });

  it("offers a callout's authored disclosure as a button, pressed while the callout opens expanded", async () => {
    const onExecute = vi.fn();
    const renderPopup = (commandState: EditorCommandState) => (
      <EditorContextPopup
        request={{ ...POINTER_REQUEST, selectionKind: "caret" }}
        commandState={commandState}
        onClose={vi.fn()}
        onExecute={onExecute}
        onReturnFocus={vi.fn()}
      />
    );
    const { rerender, user } = renderWithUser(renderPopup(enabledPopupCommandState));

    expect(screen.queryByRole("button", { name: "Callout type" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Callout opens expanded")).not.toBeInTheDocument();

    rerender(renderPopup(withEnabledCommands("format.calloutType")));

    expect(controlLabels()).toEqual([
      "Paste",
      ...BLOCK_FORMATTING_LABELS,
      "Callout type",
      "Block type",
      "Insert",
    ]);

    rerender(
      renderPopup({
        ...withEnabledCommands("format.calloutType", "format.calloutExpanded"),
        checkedCommands: { "format.calloutExpanded": true },
      }),
    );

    expect(controlLabels().slice(0, 2)).toEqual(["Paste", "Callout opens expanded"]);
    expect(screen.getByLabelText("Callout opens expanded")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByLabelText("Callout opens expanded"));

    expect(onExecute).toHaveBeenCalledWith("format.calloutExpanded");
  });

  describe("callout types", () => {
    const MKDOCS_CHOICES: CalloutTypeChoices = {
      current: "warning",
      options: [
        { label: "Note", token: "note" },
        { label: "Tip", token: "tip" },
        { label: "Warning", token: "warning" },
      ],
    };
    const GITHUB_CHOICES: CalloutTypeChoices = {
      current: null,
      options: [
        { label: "Note", token: "NOTE" },
        { label: "Tip", token: "TIP" },
      ],
    };

    const renderCalloutPopup = (commandState: EditorCommandState) => {
      const onChooseCalloutType = vi.fn();
      const readCalloutTypes = vi.fn((choice: CalloutTypeChoice) =>
        choice === "change" ? MKDOCS_CHOICES : GITHUB_CHOICES,
      );
      const rendered = renderWithUser(
        <EditorContextPopup
          request={{ ...KEYBOARD_REQUEST, selectionKind: "caret" }}
          commandState={commandState}
          onChooseCalloutType={onChooseCalloutType}
          onClose={vi.fn()}
          onExecute={vi.fn()}
          onReturnFocus={vi.fn()}
          readCalloutTypes={readCalloutTypes}
        />,
      );

      return { ...rendered, onChooseCalloutType, readCalloutTypes };
    };

    const iconOf = (item: HTMLElement) =>
      item.querySelector<HTMLElement>("[data-slot='callout-type-icon']");

    it("changes the callout's type from a named submenu marking its current type", async () => {
      const { onChooseCalloutType, readCalloutTypes, user } = renderCalloutPopup(
        withEnabledCommands("format.calloutType"),
      );

      expect(readCalloutTypes).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Callout type" }));

      const group = await screen.findByRole("group", { name: "Callout type" });
      const items = within(group).getAllByRole("menuitemradio");

      expect(readCalloutTypes).toHaveBeenCalledWith("change");
      expect(items.map((item) => item.textContent)).toEqual(["Note", "Tip", "Warning"]);
      expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
        "false",
        "false",
        "true",
      ]);
      expect(iconOf(items[0])).toHaveAttribute("aria-hidden", "true");
      expect(iconOf(items[0])?.style.maskImage).toBe('url("/callout-note.svg")');

      await user.click(items[1]);

      expect(onChooseCalloutType).toHaveBeenCalledWith("change", "tip");
    });

    it("reaches the type submenu from the keyboard", async () => {
      const { onChooseCalloutType, user } = renderCalloutPopup(
        withEnabledCommands("format.calloutType"),
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Paste")).toHaveFocus();
      });

      await user.keyboard("{ArrowDown}{ArrowDown}");

      expect(screen.getByRole("button", { name: "Callout type" })).toHaveFocus();

      await user.keyboard("{Enter}");
      await waitFor(() => {
        expect(screen.getByRole("menuitemradio", { name: "Note" })).toHaveFocus();
      });

      await user.keyboard("{ArrowDown}{Enter}");

      expect(onChooseCalloutType).toHaveBeenCalledWith("change", "tip");
    });

    it("inserts a callout of a chosen type from the Insert submenu's Callout submenu", async () => {
      const { onChooseCalloutType, readCalloutTypes, user } = renderCalloutPopup(
        withEnabledCommands("insert.callout"),
      );

      await user.click(screen.getByRole("button", { name: "Insert" }));

      const trigger = await screen.findByRole("menuitem", { name: "Callout" });

      expect(trigger).toHaveAttribute("aria-haspopup", "menu");

      await user.hover(trigger);
      await user.keyboard("{ArrowRight}");

      const group = await screen.findByRole("group", { name: "Callout" });
      const items = within(group).getAllByRole("menuitem");

      expect(readCalloutTypes).toHaveBeenCalledWith("insert");
      expect(items.map((item) => item.textContent)).toEqual(["Note", "Tip"]);
      expect(iconOf(items[1])?.style.maskImage).toBe('url("/callout-tip.svg")');

      await user.keyboard("{ArrowDown}{Enter}");

      expect(onChooseCalloutType).toHaveBeenCalledWith("insert", "TIP");
    });

    it("disables the Insert submenu's Callout submenu where no callout can be inserted", async () => {
      const { readCalloutTypes, user } = renderCalloutPopup(enabledPopupCommandState);

      await user.click(screen.getByRole("button", { name: "Insert" }));

      expect(await screen.findByRole("menuitem", { name: "Callout" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(readCalloutTypes).not.toHaveBeenCalled();
    });
  });

  it("offers image replacement only for a standalone image", async () => {
    const onExecute = vi.fn();
    const { rerender, user } = renderWithUser(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={enabledPopupCommandState}
        onClose={vi.fn()}
        onExecute={onExecute}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Replace image...")).not.toBeInTheDocument();

    rerender(
      <EditorContextPopup
        request={POINTER_REQUEST}
        commandState={{
          ...enabledPopupCommandState,
          enabledCommands: {
            ...enabledPopupCommandState.enabledCommands,
            "edit.replaceImage": true,
          },
        }}
        onClose={vi.fn()}
        onExecute={onExecute}
        onReturnFocus={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText("Replace image..."));

    expect(onExecute).toHaveBeenCalledWith("edit.replaceImage");
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

    it("keeps a context's unavailable command visible but disabled", () => {
      renderToolbar(
        { ...POINTER_REQUEST, selectionKind: "block" },
        { commandState: withEnabledCommands("edit.moveBlockDown") },
      );

      expect(screen.getByLabelText("Move block up")).toBeDisabled();
      expect(screen.getByLabelText("Move block down")).toBeEnabled();
    });

    it("keeps the toolbar to a single roving tab stop", () => {
      renderToolbar(POINTER_REQUEST);

      const controls = screen.getAllByRole("button");

      expect(controls).toHaveLength(9);
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

      await user.keyboard("{ArrowRight}{ArrowDown}");
      expect(screen.getByLabelText("Emphasis")).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("button", { name: "Block type" })).toHaveFocus();
    });

    it("wraps from the first row back to the last", async () => {
      const { user } = renderToolbar(KEYBOARD_REQUEST);

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("button", { name: "Block type" })).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByLabelText("Strong")).toHaveFocus();
    });

    it("walks every row of the caret layout", async () => {
      const { user } = renderToolbar({ ...KEYBOARD_REQUEST, selectionKind: "caret" });

      await waitFor(() => {
        expect(screen.getByLabelText("Paste")).toHaveFocus();
      });

      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("button", { name: "Insert" })).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByRole("button", { name: "Block type" })).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByLabelText("Blockquote")).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByLabelText("Paste")).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByLabelText("Blockquote")).toHaveFocus();
    });

    it("walks the table rows by column and clamps onto Delete table", async () => {
      const { user } = renderToolbar(
        { ...KEYBOARD_REQUEST, container: "table", selectionKind: "caret" },
        {
          commandState: withEnabledCommands(
            "format.table.addRowAbove",
            "format.table.moveRowDown",
            "format.table.addColumnBefore",
            "format.table.moveColumnRight",
            "format.table.delete",
          ),
        },
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Paste")).toHaveFocus();
      });

      await user.keyboard("{ArrowDown}");
      expect(screen.getByLabelText("Add row above")).toHaveFocus();

      await user.keyboard("{ArrowRight}");
      expect(screen.getByLabelText("Move row down")).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByLabelText("Move column right")).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByLabelText("Delete table")).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("button", { name: "Insert" })).toHaveFocus();

      await user.keyboard("{ArrowUp}{ArrowUp}");
      expect(screen.getByLabelText("Add column before")).toHaveFocus();
    });

    it("moves through an object's row to the selection's own rows", async () => {
      const { user } = renderToolbar(
        { ...KEYBOARD_REQUEST, selectionKind: "block" },
        { commandState: withEnabledCommands("format.codeBlockLanguage", "edit.moveBlockDown") },
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}");
      expect(screen.getByLabelText("Code block language...")).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByLabelText("Move block down")).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByLabelText("Ordered list")).toHaveFocus();
    });

    it("opens a submenu with ArrowDown instead of leaving its row", async () => {
      const { user } = renderToolbar(KEYBOARD_REQUEST);

      await waitFor(() => {
        expect(screen.getByLabelText("Cut")).toHaveFocus();
      });

      await user.keyboard("{ArrowUp}{ArrowDown}");

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
      expect(screen.getByRole("button", { name: "Block type" })).toHaveFocus();
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

      await user.keyboard("{ArrowUp}{Enter}");
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
      const request: ContextPopupRequest = {
        anchor: { contextElement: document.body, getRect },
        container: null,
        selectionKind: "text",
        source,
      };
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
        container: null,
        selectionKind: "text",
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
            container: null,
            selectionKind: "text",
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
            container: null,
            selectionKind: "text",
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
        container: null,
        selectionKind: "text",
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
