// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { getActiveDocumentKey } from "@/features/document";
import { useSettingsStore } from "@/features/preferences";
import { documentEditorBridge, getActiveTab, useSessionStore } from "@/features/session";
import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import {
  replaceActiveDocument,
  setDefaultSession,
  setDefaultSettings,
} from "@/test/utils/appStores";
import { act, render, renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { DocumentScreen } from "./document-screen";

const MARKDOWN = "# Notes\n\nBody text.\n";

function ActiveDocumentScreen() {
  const tab = useSessionStore(getActiveTab);

  return tab ? <DocumentScreen active tab={tab} wikiCompletionPaths={[]} /> : null;
}

describe("DocumentScreen", () => {
  it("resets the viewport when another document replaces the active document", async () => {
    const activeDocument = createSavedDocument({ content: MARKDOWN });
    setDefaultSession({ activeDocument });
    render(<ActiveDocumentScreen />);
    await waitFor(() => {
      expect(documentEditorBridge.getCommandState(activeDocument.path).status).toBe("ready");
    });
    const viewport = screen
      .getByTestId("document-surface-scroll-area")
      .querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    viewport.scrollTop = 600;

    const replacement = createSavedDocument({ path: "C:/Notes/other.md", content: "# Other\n" });
    act(() => {
      replaceActiveDocument(replacement);
    });
    await waitFor(() => {
      expect(documentEditorBridge.getCommandState(replacement.path).status).toBe("ready");
    });

    expect(
      screen
        .getByTestId("document-surface-scroll-area")
        .querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!.scrollTop,
    ).toBe(0);
    expect(documentEditorBridge.getMarkdown(replacement.path)).toBe(replacement.content);
    expect(useSessionStore.getState().activeDocument?.isDirty).toBe(false);
  });

  it.each([false, true])("restores a same-document reload with focused=%s", async (focused) => {
    const activeDocument = createSavedDocument({ content: MARKDOWN });
    setDefaultSession({ activeDocument });
    render(<ActiveDocumentScreen />);
    await waitFor(() => {
      expect(documentEditorBridge.getCommandState(activeDocument.path).status).toBe("ready");
    });
    const viewport = screen
      .getByTestId("document-surface-scroll-area")
      .querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    viewport.scrollTop = 600;
    const reloaded = { ...activeDocument, content: `${MARKDOWN}\nNew text.\n` };
    act(() => {
      replaceActiveDocument(reloaded, {
        reload: true,
        viewState: { anchor: 10, head: 10, focused },
      });
    });
    await waitFor(() => {
      expect(documentEditorBridge.getMarkdown(reloaded.path)).toBe(reloaded.content);
    });

    expect(
      screen
        .getByTestId("document-surface-scroll-area")
        .querySelector('[data-slot="scroll-area-viewport"]'),
    ).toBe(viewport);
    expect(viewport.scrollTop).toBe(600);
    expect(documentEditorBridge.getViewState(reloaded.path)).toMatchObject({
      anchor: 10,
      head: 10,
      focused,
    });
  });

  it("keeps an edited document's text when its editor lets go while the document stays open", async () => {
    const activeDocument = createUntitledDocument({ content: MARKDOWN });
    const documentKey = getActiveDocumentKey(activeDocument);
    setDefaultSession({ activeDocument });
    const contentChanges: string[] = [];
    const subscription = documentEditorBridge.onDidChangeContent((key) => contentChanges.push(key));
    const { unmount } = render(<ActiveDocumentScreen />);
    await waitFor(() => {
      expect(documentEditorBridge.getCommandState(documentKey).status).toBe("ready");
    });

    act(() => {
      expect(documentEditorBridge.insertLink(documentKey, "Guide", "guide.md")).toBe(true);
    });
    // Reading the text settles the source projection around the new link, itself an edit.
    subscription.dispose();
    const edited = documentEditorBridge.getMarkdown(documentKey);

    expect(edited).toContain("[Guide](guide.md)");
    expect(contentChanges).toEqual([documentKey]);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      content: MARKDOWN,
      isDirty: true,
    });

    unmount();

    const retained = useSessionStore.getState().activeDocument!;
    expect(retained).toMatchObject({ content: edited, isDirty: true });

    render(<ActiveDocumentScreen />);
    await waitFor(() => {
      expect(documentEditorBridge.getMarkdown(documentKey)).toBe(edited);
    });
  });

  it("navigates to an exact heading from the floating outline without editing", async () => {
    setDefaultSettings();
    const activeDocument = createUntitledDocument({
      content: "# Same\n\n## Same\n\n#### Deep\n",
    });
    const documentKey = getActiveDocumentKey(activeDocument);
    setDefaultSession({ activeDocument });
    const { user } = renderWithUser(<ActiveDocumentScreen />);

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
    render(<ActiveDocumentScreen />);

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

    render(<ActiveDocumentScreen />);

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
