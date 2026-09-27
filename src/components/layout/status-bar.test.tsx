// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppCommandId, CommandState, ReopenWithEncodingControl } from "@/commands";
import {
  getActiveDocumentKey,
  type ActiveDocumentState,
  type DocumentEncoding,
} from "@/features/document";
import type { EditorDocumentStatus } from "@/features/editor";
import { documentEditorBridge } from "@/features/session";
import { createSavedDocument } from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { setDefaultSettings, setDefaultUI } from "@/test/utils/appStores";
import { act, renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { StatusBar } from "./status-bar";

const enabledState = { enabled: true } satisfies CommandState;
const disabledState = {
  enabled: false,
  reason: "Unavailable in this test.",
} satisfies CommandState;

const createStatus = (overrides: Partial<EditorDocumentStatus> = {}): EditorDocumentStatus => ({
  blockPath: [{ kind: "blockquote" }, { kind: "taskList" }, { kind: "paragraph" }],
  document: { characters: 2_468, charactersWithoutSpaces: 2_101, words: 450 },
  selection: null,
  ...overrides,
});

interface StatusBarTestOptions {
  activeDocument?: ActiveDocumentState;
  commandState?: (commandId: AppCommandId) => CommandState;
  reopenWithEncoding?: Partial<ReopenWithEncodingControl>;
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
  reopenWithEncoding = {},
  status = createStatus(),
}: StatusBarTestOptions = {}) => {
  let currentStatus = status;
  documentEditorBridge.set(
    getActiveDocumentKey(activeDocument),
    createMilkdownEditorBridge({ getDocumentStatus: () => currentStatus }),
  );
  const onExecute = vi.fn();
  const reopen = vi.fn();

  return {
    ...renderWithUser(
      <StatusBar
        activeDocument={activeDocument}
        commandState={commandState}
        onExecute={onExecute}
        reopenWithEncoding={{
          state: enabledState,
          checkedEncoding: null,
          reopen,
          ...reopenWithEncoding,
        }}
      />,
    ),
    onExecute,
    reopen,
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

    updateStatus(createStatus({ blockPath: [{ kind: "heading", level: 2 }] }));

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
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("names the line ending a save will use when the file had none", () => {
    setDefaultSettings({ defaultNewDocumentLineEnding: "crlf" });
    renderStatusBar({ activeDocument: createSavedDocument({ lineEnding: null }) });

    expect(screen.getByRole("button", { name: "Line ending: CRLF" })).toBeInTheDocument();
  });

  it.each([
    [{ name: "UTF-8", bom: false }, "UTF-8"],
    [{ name: "UTF-8", bom: true }, "UTF-8 with BOM"],
    [{ name: "UTF-16LE", bom: true }, "UTF-16 LE with BOM"],
    [{ name: "UTF-16BE", bom: true }, "UTF-16 BE with BOM"],
    [{ name: "UTF-16LE", bom: false }, "UTF-16 LE"],
    [{ name: "windows-1252", bom: false }, "Windows-1252"],
    [{ name: "gb18030", bom: false }, "GB18030"],
  ] satisfies [DocumentEncoding, string][])("names the %j encoding %s", (encoding, label) => {
    renderStatusBar({ activeDocument: createSavedDocument({ encoding }) });

    expect(screen.getByTestId("status-bar-encoding").textContent).toBe(label);
  });

  it("converts the encoding and reopens through the encoding choices", async () => {
    const { onExecute, reopen, user } = renderStatusBar({
      activeDocument: createSavedDocument({ encoding: { name: "windows-1252", bom: false } }),
      reopenWithEncoding: { checkedEncoding: "windows-1252" },
      commandState: (commandId) =>
        commandId === "edit.encoding.file"
          ? { enabled: true, checked: true }
          : commandId === "view.resetZoom"
            ? disabledState
            : enabledState,
    });

    const encodingButton = screen.getByRole("button", { name: "Encoding: Windows-1252" });

    await user.click(encodingButton);

    expect(
      within(screen.getByRole("group", { name: "Save with encoding" }))
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual(["Windows-1252", "UTF-8", "UTF-8 with BOM"]);
    expect(screen.getByRole("menuitemradio", { name: "Windows-1252" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(screen.getByRole("menuitemradio", { name: "UTF-8" }));

    expect(onExecute).toHaveBeenCalledWith("edit.encoding.utf8");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    await user.click(encodingButton);
    await user.hover(screen.getByRole("menuitem", { name: "Reopen with encoding" }));
    await user.keyboard("{ArrowRight}");

    expect(
      await screen.findByRole("menuitemradio", { name: "Western (Windows-1252, ISO-8859-1)" }),
    ).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{End}{Enter}");

    expect(reopen).toHaveBeenCalledWith("UTF-16BE");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("disables reopening when the file's encoding is fixed", async () => {
    const { user } = renderStatusBar({
      reopenWithEncoding: { state: disabledState },
    });

    await user.click(screen.getByRole("button", { name: "Encoding: UTF-8" }));

    expect(screen.getByRole("menuitem", { name: "Reopen with encoding" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("offers the file's encoding only when it is not UTF-8", async () => {
    const { user } = renderStatusBar({
      commandState: (commandId) =>
        commandId === "edit.encoding.file" || commandId === "view.resetZoom"
          ? disabledState
          : enabledState,
    });

    await user.click(screen.getByRole("button", { name: "Encoding: UTF-8" }));

    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "UTF-8",
      "UTF-8 with BOM",
    ]);
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
