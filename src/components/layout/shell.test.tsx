// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { useSessionStore } from "@/features/session";
import { toastManager } from "@/lib/toast";
import { createSavedDocument } from "@/test/factories/document";
import {
  createArticleTree,
  createEmptyFolderContext,
  createFolderContext,
  createNestedArticleTree,
} from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH, TEST_NESTED_DIRECTORY_PATH } from "@/test/fixtures/paths";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { render, renderWithUser, screen, waitFor } from "@/test/utils/react";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import { Shell } from "./shell";

vi.mock("@/components/screens/document-screen", () => ({
  DocumentScreen: ({ activeDocument }: { activeDocument: { content: string } }) => (
    <section data-testid="active-document-host">{activeDocument.content}</section>
  ),
}));

vi.mock("@/features/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/session")>()),
  useFolderContextWatcher: vi.fn(),
}));

const SPEC_MARKDOWN_PATH = `${TEST_NESTED_DIRECTORY_PATH}/spec.md`;
const OVERSIZED_MARKDOWN_FILE_ERROR = {
  kind: "oversizedFile",
  path: "C:/Notes/large-document.md",
  sizeBytes: 5 * 1024 * 1024 + 1024,
  maxSizeBytes: 5 * 1024 * 1024,
} as const;

const nestedFolderContext = createFolderContext({
  tree: createNestedArticleTree(),
});

const emptyFolderContext = createEmptyFolderContext({
  path: "C:/Empty",
  tree: createArticleTree({
    name: "Empty",
    path: "C:/Empty",
    children: [{ kind: "directory", name: "nested", path: "C:/Empty/nested", children: [] }],
  }),
});

describe("Shell", () => {
  it("renders the welcome shell with menu, sidebar, document surface, and modal layer", () => {
    render(<Shell />);

    const titlebar = document.querySelector<HTMLElement>("#leafdown-titlebar");
    expect(titlebar).not.toBeNull();

    expect(screen.getByRole("button", { name: "Open file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Insert" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Format" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Help" })).toBeInTheDocument();
    expect(titlebar!).toContainElement(screen.getByRole("menuitem", { name: "File" }));
    expect(titlebar!).toContainElement(screen.getByRole("button", { name: "Hide sidebar" }));
    expect(screen.getByRole("button", { name: "Hide sidebar" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(titlebar!.querySelector("h1")).toBeNull();
    expect(screen.getByText("No recent files.")).toBeInTheDocument();
    expect(screen.getByText("No recent folders.")).toBeInTheDocument();
    expect(screen.getByTestId("menu-bar-host")).toBeInTheDocument();
    expect(screen.getByTestId("article-navigator-host")).toBeInTheDocument();
    const workspaceHost = screen.getByTestId("document-workspace-host");
    expect(workspaceHost).toHaveClass("px-3", "pt-1", "pb-3");
    const navigatorHost = screen.getByTestId("article-navigator-host");
    expect(navigatorHost).not.toHaveClass("pl-3");
    expect(navigatorHost).not.toHaveClass("pr-3");
    expect(navigatorHost.querySelector("[data-slot=card]")).toBeInTheDocument();
    const resizeHandle = screen.getByRole("separator", { name: "Resize article navigator" });
    expect(resizeHandle).toHaveClass("w-2", "bg-transparent");
    expect(resizeHandle.querySelector("[data-slot=resizable-grip]")).toBeInTheDocument();
    expect(screen.getByTestId("document-surface-host")).toBeInTheDocument();
    expect(screen.getByTestId("modal-layer-host")).toBeInTheDocument();
    expect(screen.getByText("No folder open")).toBeInTheDocument();
    expect(screen.queryByTestId("active-document-host")).not.toBeInTheDocument();
  });

  it("renders a folder-only placeholder while keeping nested articles collapsed", () => {
    setDefaultSession({
      folderContext: nestedFolderContext,
    });

    render(<Shell />);

    expect(screen.getByRole("treeitem", { name: "readme.md" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "draft.markdown" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "docs" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("treeitem", { name: "spec.md" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Article navigator" })).toContainElement(
      screen.getByRole("tree", { name: "Articles" }),
    );
    expect(screen.getByText("No document open")).toBeInTheDocument();
    expect(
      screen.getByText("Select a Markdown file from the sidebar or create a new document."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("active-document-host")).not.toBeInTheDocument();
  });

  it("reveals and selects the active saved document in the sidebar", async () => {
    setDefaultSession({
      folderContext: nestedFolderContext,
      activeDocument: createSavedDocument({
        path: SPEC_MARKDOWN_PATH,
        content: "# Spec",
      }),
    });

    render(<Shell />);

    await waitFor(() => {
      expect(screen.getByRole("treeitem", { name: "spec.md" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    expect(screen.getByRole("treeitem", { name: "docs" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("treeitem", { name: "empty" })).not.toHaveAttribute("aria-expanded");
    expect(screen.getByTestId("active-document-host")).toHaveTextContent("# Spec");
  });

  it("leaves focus on the revealed row after revealing from the File menu", async () => {
    setDefaultSession({
      folderContext: nestedFolderContext,
      activeDocument: createSavedDocument({
        path: SPEC_MARKDOWN_PATH,
        content: "# Spec",
      }),
    });

    const { user } = renderWithUser(<Shell />);

    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Reveal in sidebar/u }));

    expect(screen.getByRole("treeitem", { name: "spec.md" })).toHaveFocus();
  });

  it("shows the empty folder state while preserving empty directories", () => {
    setDefaultSession({
      folderContext: emptyFolderContext,
    });

    render(<Shell />);

    expect(screen.getByText("No Markdown files found")).toBeInTheDocument();
    expect(screen.getByText("No supported Markdown files found.")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "nested" })).not.toHaveAttribute("aria-expanded");
  });

  it("hides the sidebar when the persisted sidebar setting is off", () => {
    setDefaultSettings({ sidebarVisible: false });

    render(<Shell />);

    expect(screen.queryByTestId("article-navigator-host")).not.toBeInTheDocument();
  });

  it("keeps the workspace gutter once the sidebar is collapsed", () => {
    setDefaultSettings({ sidebarVisible: false });

    render(<Shell />);

    expect(screen.getByTestId("document-workspace-host")).toHaveClass("px-3", "pt-1", "pb-3");
  });

  it("toggles the sidebar from the titlebar", async () => {
    const { user } = renderWithUser(<Shell />);

    await user.click(screen.getByRole("button", { name: "Hide sidebar" }));

    expect(screen.queryByTestId("article-navigator-host")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show sidebar" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
  it("reports article open failures from the sidebar", async () => {
    setDefaultSession({
      folderContext: nestedFolderContext,
    });
    mockTauriApiCommand("openMarkdownFile", () =>
      Promise.reject({
        kind: "readFailed",
        message: "access failed",
        path: TEST_MARKDOWN_FILE_PATH,
      }),
    );

    const { user } = renderWithUser(<Shell />);
    await user.click(screen.getByRole("treeitem", { name: "readme.md" }));

    await waitFor(() => {
      expect(toastManager.add).toHaveBeenCalledWith({
        description: "access failed",
        title: "Could not read Markdown file.",
        type: "error",
      });
    });
  });

  it("reports oversized article open failures without changing the session", async () => {
    const activeDocument = createSavedDocument({ content: "# Current" });
    setDefaultSession({
      activeDocument,
      folderContext: nestedFolderContext,
    });
    mockTauriApiCommand("openMarkdownFile", () => Promise.reject(OVERSIZED_MARKDOWN_FILE_ERROR));

    const { user } = renderWithUser(<Shell />);
    await user.click(screen.getByRole("treeitem", { name: "draft.markdown" }));

    await waitFor(() => {
      expect(toastManager.add).toHaveBeenCalledWith({
        description: "5.0 MB selected. Files larger than 5 MB do not load.",
        title: "Markdown file is too large.",
        type: "error",
      });
    });

    expect(useSessionStore.getState()).toMatchObject({
      activeDocument,
      folderContext: nestedFolderContext,
    });
  });
});
