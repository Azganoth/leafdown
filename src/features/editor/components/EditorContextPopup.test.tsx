import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { render } from "@/test/utils/react";
import type { EditorCommandState } from "@/features/commands/types";

import { EditorContextPopup } from "./EditorContextPopup";

const enabledPopupCommandState: EditorCommandState = {
  enabledCommands: {
    "edit.cut": true,
    "edit.copy": true,
    "edit.paste": true,
    "edit.delete": true,
    "format.strong": true,
    "format.emphasis": true,
    "format.inlineCode": true,
    "insert.link": true,
    "format.blockquote": true,
    "format.orderedList": true,
    "format.unorderedList": true,
    "format.taskList": true,
    "format.paragraph": true,
    "format.heading1": true,
    "insert.paragraph": true,
  },
  hasActiveEditor: true,
  hasSelection: true,
  hasTableSelection: false,
};

describe("EditorContextPopup", () => {
  it("renders the initial five-row context UI", () => {
    render(
      <EditorContextPopup
        anchor={{ x: 40, y: 60 }}
        commandState={enabledPopupCommandState}
        onClose={vi.fn()}
        onExecuteCommand={vi.fn()}
        open
      />,
    );

    expect(screen.getByTestId("editor-context-popup")).toBeInTheDocument();
    expect(screen.getByLabelText("Cut")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy")).toBeInTheDocument();
    expect(screen.getByLabelText("Paste")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete")).toBeInTheDocument();
    expect(screen.getByLabelText("Strong")).toBeInTheDocument();
    expect(screen.getByLabelText("Emphasis")).toBeInTheDocument();
    expect(screen.getByLabelText("Inline code")).toBeInTheDocument();
    expect(screen.getByLabelText("Link")).toBeInTheDocument();
    expect(screen.getByLabelText("Blockquote")).toBeInTheDocument();
    expect(screen.getByLabelText("Ordered list")).toBeInTheDocument();
    expect(screen.getByLabelText("Unordered list")).toBeInTheDocument();
    expect(screen.getByLabelText("Task list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Block type" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert" })).toBeInTheDocument();
  });

  it("routes enabled icon commands and keeps disabled commands visible", () => {
    const onExecuteCommand = vi.fn();

    render(
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
        onExecuteCommand={onExecuteCommand}
        open
      />,
    );

    expect(screen.getByLabelText("Cut")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Copy"));

    expect(onExecuteCommand).toHaveBeenCalledWith("edit.copy");
  });
});
