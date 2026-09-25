// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppCommandId, CommandState } from "@/commands";
import { getActiveDocumentKey, type ActiveDocumentState } from "@/features/document";
import type { EditorDocumentStatus } from "@/features/editor";
import { documentEditorBridge } from "@/features/session";
import { createSavedDocument } from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { setDefaultSettings, setDefaultUI } from "@/test/utils/appStores";
import { act, renderWithUser, screen } from "@/test/utils/react";

import { StatusBar } from "./status-bar";

const enabledState = { enabled: true } satisfies CommandState;
const disabledState = {
  enabled: false,
  reason: "Unavailable in this test.",
} satisfies CommandState;

const createStatus = (overrides: Partial<EditorDocumentStatus> = {}): EditorDocumentStatus => ({
  blockPath: ["Blockquote", "Task list", "Paragraph"],
  document: { characters: 2_468, charactersWithoutSpaces: 2_101, words: 450 },
  selection: null,
  ...overrides,
});

interface StatusBarTestOptions {
  activeDocument?: ActiveDocumentState;
  commandState?: (commandId: AppCommandId) => CommandState;
  status?: EditorDocumentStatus;
}

const renderStatusBar = ({
  activeDocument = createSavedDocument(),
  commandState = (commandId) =>
    commandId === "view.resetZoom"
      ? disabledState
      : commandId === "edit.lineEnding.lf"
        ? { enabled: true, checked: true }
        : enabledState,
  status = createStatus(),
}: StatusBarTestOptions = {}) => {
  let currentStatus = status;
  documentEditorBridge.set(
    getActiveDocumentKey(activeDocument),
    createMilkdownEditorBridge({ getDocumentStatus: () => currentStatus }),
  );
  const onExecute = vi.fn();

  return {
    ...renderWithUser(
      <StatusBar
        activeDocument={activeDocument}
        commandState={commandState}
        onExecute={onExecute}
      />,
    ),
    onExecute,
    updateStatus: (nextStatus: EditorDocumentStatus) => {
      currentStatus = nextStatus;
      act(() => documentEditorBridge.fireDocumentStatusChanged());
    },
  };
};

describe("StatusBar", () => {
  afterEach(() => {
    documentEditorBridge.clear();
  });

  it("shows the caret's block path and the document metrics in one labeled region", () => {
    renderStatusBar();

    const statusBar = screen.getByRole("contentinfo", { name: "Status bar" });

    expect(statusBar).toHaveTextContent("Blockquote › Task list › Paragraph");
    expect(statusBar).toHaveTextContent("~2 min read");
    expect(screen.getByTestId("status-bar-word-count")).toHaveTextContent(
      "450 words, 2,468 characters, 2,101 characters without spaces",
    );
    expect(screen.getByRole("button", { name: "Line ending: LF" })).toBeInTheDocument();
    expect(statusBar).not.toHaveAttribute("aria-live");
  });

  it("counts a selection against the document and drops the block path", () => {
    renderStatusBar({
      status: createStatus({
        blockPath: null,
        selection: { characters: 60, charactersWithoutSpaces: 51, words: 12 },
      }),
    });

    expect(screen.queryByTestId("status-bar-block-path")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-bar-word-count")).toHaveTextContent(
      "12 of 450 words, 60 of 2,468 characters, 51 of 2,101 characters without spaces",
    );
  });

  it("uses singular counts and a short reading time for a small document", () => {
    renderStatusBar({
      status: createStatus({
        document: { characters: 1, charactersWithoutSpaces: 1, words: 1 },
      }),
    });

    expect(screen.getByRole("contentinfo")).toHaveTextContent("<1 min read");
    expect(screen.getByTestId("status-bar-word-count")).toHaveTextContent(
      "1 word, 1 character, 1 character without spaces",
    );
  });

  it("follows status changes from the editor", () => {
    const { updateStatus } = renderStatusBar();

    updateStatus(createStatus({ blockPath: ["Heading 2"] }));

    expect(screen.getByTestId("status-bar-block-path")).toHaveTextContent("Heading 2");
  });

  it("shows no document metrics before the editor reports them", () => {
    renderStatusBar();
    act(() => documentEditorBridge.clear());

    expect(screen.queryByTestId("status-bar-word-count")).not.toBeInTheDocument();
    expect(screen.queryByTestId("status-bar-block-path")).not.toBeInTheDocument();
  });

  it("changes the line ending through the line ending commands", async () => {
    const { onExecute, user } = renderStatusBar();

    await user.click(screen.getByRole("button", { name: "Line ending: LF" }));

    expect(screen.getByRole("menuitemradio", { name: "Unix line ending (LF)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(screen.getByRole("menuitemradio", { name: "Windows line ending (CRLF)" }));

    expect(onExecute).toHaveBeenCalledWith("edit.lineEnding.crlf");
  });

  it("names the line ending a save will use when the file had none", () => {
    setDefaultSettings({ defaultNewDocumentLineEnding: "crlf" });
    renderStatusBar({ activeDocument: createSavedDocument({ lineEnding: null }) });

    expect(screen.getByRole("button", { name: "Line ending: CRLF" })).toBeInTheDocument();
  });

  it("shows the zoom level only away from the default and resets it", async () => {
    setDefaultUI({ zoom: 1.1 });
    const { onExecute, user } = renderStatusBar({ commandState: () => enabledState });

    await user.click(screen.getByRole("button", { name: "Zoom 110%, reset zoom" }));

    expect(onExecute).toHaveBeenCalledWith("view.resetZoom");
  });

  it("hides the zoom level at the default zoom", () => {
    renderStatusBar();

    expect(screen.queryByRole("button", { name: /^Zoom/u })).not.toBeInTheDocument();
  });
});
