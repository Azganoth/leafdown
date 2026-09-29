// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { getActiveDocumentKey } from "@/features/document";
import { useSettingsStore } from "@/features/preferences";
import { documentEditorBridge, useSessionStore } from "@/features/session";
import { createUntitledDocument } from "@/test/factories/document";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { act, render, screen, waitFor } from "@/test/utils/react";

import { DocumentScreen } from "./document-screen";

const MARKDOWN = "# Notes\n\nBody text.\n";

describe("DocumentScreen", () => {
  it("publishes live headings and navigates to an exact heading without editing", async () => {
    const activeDocument = createUntitledDocument({ content: "# Same\n\n## Same\n" });
    const documentKey = getActiveDocumentKey(activeDocument);
    setDefaultSession({ activeDocument });
    render(<DocumentScreen activeDocument={activeDocument} />);

    await waitFor(() => {
      expect(documentEditorBridge.getHeadingOutline(documentKey).headings).toHaveLength(2);
    });
    const second = documentEditorBridge.getHeadingOutline(documentKey).headings[1];
    expect(documentEditorBridge.navigateToOutlineHeading(documentKey, second.position)).toBe(true);
    expect(documentEditorBridge.getViewState(documentKey)?.head).toBe(second.position + 1);
    expect(documentEditorBridge.getHeadingOutline(documentKey).activePosition).toBe(
      second.position,
    );
    expect(documentEditorBridge.getMarkdown(documentKey)).toBe(activeDocument.content);
    expect(useSessionStore.getState().activeDocument?.isDirty).toBe(false);
  });

  it("previews document typography without modifying the document", async () => {
    setDefaultSettings();
    const activeDocument = createUntitledDocument({ content: MARKDOWN });
    const documentKey = getActiveDocumentKey(activeDocument);
    setDefaultSession({ activeDocument });

    render(<DocumentScreen activeDocument={activeDocument} />);

    const host = screen.getByTestId("milkdown-editor-host");
    await waitFor(() => {
      expect(documentEditorBridge.getCommandState(documentKey).status).toBe("ready");
    });
    const editorRoot = host.querySelector(".ProseMirror");
    expect(host).toHaveAttribute("data-document-font", "inter");
    expect(host).toHaveAttribute("data-text-size", "16");
    expect(host).toHaveAttribute("data-line-spacing", "default");

    act(() => {
      const { updateSetting } = useSettingsStore.getState();
      updateSetting("documentFont", "system");
      updateSetting("textSize", 20);
      updateSetting("lineSpacing", "relaxed");
    });

    expect(screen.getByTestId("milkdown-editor-host")).toBe(host);
    expect(host.querySelector(".ProseMirror")).toBe(editorRoot);
    expect(host).toHaveAttribute("data-document-font", "system");
    expect(host).toHaveAttribute("data-text-size", "20");
    expect(host).toHaveAttribute("data-line-spacing", "relaxed");
    expect(documentEditorBridge.getMarkdown(documentKey)).toBe(MARKDOWN);
    expect(documentEditorBridge.getCommandState(documentKey).enabledCommands["edit.undo"]).toBe(
      false,
    );
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: MARKDOWN,
      isDirty: false,
    });
  });
});
