// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { getActiveDocumentKey } from "@/features/document";
import { useSettingsStore } from "@/features/preferences";
import { documentEditorBridge, useSessionStore } from "@/features/session";
import { createUntitledDocument } from "@/test/factories/document";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { act, render, renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { DocumentScreen } from "./document-screen";

const MARKDOWN = "# Notes\n\nBody text.\n";

describe("DocumentScreen", () => {
  it("navigates to an exact heading from the floating outline without editing", async () => {
    setDefaultSettings();
    const activeDocument = createUntitledDocument({
      content: "# Same\n\n## Same\n\n#### Deep\n",
    });
    const documentKey = getActiveDocumentKey(activeDocument);
    setDefaultSession({ activeDocument });
    const { user } = renderWithUser(<DocumentScreen activeDocument={activeDocument} />);

    const outline = await screen.findByRole("navigation", { name: "Document outline" });
    await waitFor(() => {
      expect(within(outline).getAllByRole("button", { name: /^Heading/u })).toHaveLength(2);
    });
    const second = within(outline).getByRole("button", { name: "Heading 2: Same" });

    await user.hover(second);
    await waitFor(() => {
      expect(screen.getByTestId("heading-outline")).toHaveAttribute("data-open");
    });
    await user.click(second);

    const position = Number(second.dataset.outlinePosition);
    expect(documentEditorBridge.getViewState(documentKey)?.head).toBe(position + 1);
    await waitFor(() => {
      expect(second).toHaveAttribute("aria-current", "location");
    });
    expect(documentEditorBridge.getMarkdown(documentKey)).toBe(activeDocument.content);
    expect(useSessionStore.getState().activeDocument?.isDirty).toBe(false);

    await user.click(
      within(outline).getByRole("button", { name: "Show headings down to level 4" }),
    );
    expect(useSettingsStore.getState().outlineDepth).toBe(4);
    expect(within(outline).getByRole("button", { name: "Heading 4: Deep" })).toBeInTheDocument();
  });

  it("leaves out the outline while the document has no headings", async () => {
    const activeDocument = createUntitledDocument({ content: "Body text.\n" });
    const documentKey = getActiveDocumentKey(activeDocument);
    setDefaultSession({ activeDocument });
    render(<DocumentScreen activeDocument={activeDocument} />);

    await waitFor(() => {
      expect(documentEditorBridge.getCommandState(documentKey).status).toBe("ready");
    });
    expect(screen.queryByRole("navigation", { name: "Document outline" })).not.toBeInTheDocument();
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
