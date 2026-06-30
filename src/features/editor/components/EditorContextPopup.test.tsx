import { describe, expect, it, vi } from "vitest";

import { createActiveEditorCommandState, createEditorCommandState } from "@/test/factories/editor";
import { render, renderWithUser, screen } from "@/test/utils/react";

import { EditorContextPopup } from "./EditorContextPopup";

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
  it("renders the initial five-row context UI", () => {
    render(
      <EditorContextPopup
        anchor={{ x: 40, y: 60 }}
        commandState={enabledPopupCommandState}
        onClose={vi.fn()}
        onExecute={vi.fn()}
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
        anchor={{ x: 40, y: 60 }}
        commandState={{
          ...enabledPopupCommandState,
          enabledCommands: {
            ...enabledPopupCommandState.enabledCommands,
            "edit.cut": false,
          },
        }}
        onClose={vi.fn()}
        onExecute={onExecute}
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
        anchor={{ x: 40, y: 60 }}
        commandState={createEditorCommandState({
          enabledCommandIds: ["edit.copy"],
        })}
        onClose={vi.fn()}
        onExecute={onExecute}
      />,
    );

    expect(screen.getByLabelText("Copy")).toBeDisabled();
    await user.click(screen.getByLabelText("Copy"));

    expect(onExecute).not.toHaveBeenCalled();
  });
});
