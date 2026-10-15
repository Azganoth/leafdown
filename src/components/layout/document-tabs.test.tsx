// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { useSessionStore } from "@/features/session";
import { createSavedDocument, createUntitledDocument } from "@/test/factories/document";
import { setDefaultSession } from "@/test/utils/appStores";
import { act, renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { DocumentTabs } from "./document-tabs";

vi.mock("@/components/screens/document-screen", () => ({
  DocumentScreen: ({
    active,
    tab,
  }: {
    active: boolean;
    tab: { document: { content: string } };
  }) => (
    <section data-testid={active ? "active-document-host" : "inactive-document-host"}>
      {tab.document.content}
    </section>
  ),
}));

const renderTabs = (onNewDocument = vi.fn()) =>
  renderWithUser(<DocumentTabs newDocumentLabel="New" onNewDocument={onNewDocument} />);

const getTabNames = () =>
  within(screen.getByRole("tablist", { name: "Open documents" }))
    .getAllByRole("tab")
    .map((tab) => tab.getAttribute("aria-label"));

describe("DocumentTabs", () => {
  it("shows a tab for each open document in order, with the active one selected", () => {
    setDefaultSession({
      documents: [
        createSavedDocument({ content: "# Readme" }),
        createUntitledDocument({ id: "untitled:2", content: "Draft", isDirty: true }),
      ],
      activeIndex: 1,
    });

    renderTabs();

    expect(getTabNames()).toEqual(["readme.md", "Untitled 2, unsaved"]);
    expect(screen.getByRole("tab", { name: "Untitled 2, unsaved" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("active-document-host")).toHaveTextContent("Draft");
    expect(screen.getByTestId("inactive-document-host")).toHaveTextContent("# Readme");
    expect(screen.getByTestId("inactive-document-host").closest("[hidden]")).not.toBeNull();
  });

  it("names the folder of documents that share a file name", () => {
    setDefaultSession({
      documents: [
        createSavedDocument({ path: "C:/Notes/guides/README.md" }),
        createSavedDocument({ path: "C:/Notes/api/readme.md" }),
        createSavedDocument({ path: "C:/Notes/plan.md" }),
      ],
    });

    renderTabs();

    expect(getTabNames()).toEqual(["README.md, guides", "readme.md, api", "plan.md"]);
    expect(screen.getByRole("tab", { name: "plan.md" })).toHaveAttribute(
      "title",
      "C:/Notes/plan.md",
    );
  });

  it("names a preview tab as one and keeps it when it is double-clicked", async () => {
    setDefaultSession({
      documents: [createSavedDocument(), createSavedDocument({ path: "C:/Notes/plan.md" })],
      previewIndex: 1,
      activeIndex: 1,
    });
    const { user } = renderTabs();

    expect(getTabNames()).toEqual(["readme.md", "plan.md, preview"]);
    expect(screen.getByRole("tab", { name: "plan.md, preview" })).toHaveAttribute("data-preview");

    await user.dblClick(screen.getByRole("tab", { name: "plan.md, preview" }));

    expect(getTabNames()).toEqual(["readme.md", "plan.md"]);
    expect(useSessionStore.getState().tabs[1].preview).toBe(false);
  });

  it("switches to a tab when it is chosen", async () => {
    setDefaultSession({
      documents: [createSavedDocument(), createSavedDocument({ path: "C:/Notes/plan.md" })],
    });
    const { user } = renderTabs();

    await user.click(screen.getByRole("tab", { name: "plan.md" }));

    expect(useSessionStore.getState().activeDocument).toMatchObject({
      path: "C:/Notes/plan.md",
    });
  });

  it("closes a tab from its close mark or a middle click without switching to it", async () => {
    setDefaultSession({
      documents: [
        createSavedDocument(),
        createSavedDocument({ path: "C:/Notes/plan.md" }),
        createSavedDocument({ path: "C:/Notes/todo.md" }),
      ],
    });
    const { user } = renderTabs();

    await user.click(
      within(screen.getByRole("tab", { name: "plan.md" })).getByTestId("document-tab-close"),
    );

    expect(getTabNames()).toEqual(["readme.md", "todo.md"]);
    expect(useSessionStore.getState().activeDocument).toMatchObject({
      path: "C:/Notes/readme.md",
    });

    act(() => {
      screen
        .getByRole("tab", { name: "todo.md" })
        .dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    });

    await waitFor(() => expect(getTabNames()).toEqual(["readme.md"]));
  });

  it("opens a new document from the button after the tabs", async () => {
    setDefaultSession({ activeDocument: createSavedDocument() });
    const onNewDocument = vi.fn();
    const { user } = renderTabs(onNewDocument);

    await user.click(screen.getByRole("button", { name: "New" }));

    expect(onNewDocument).toHaveBeenCalledOnce();
  });
});
