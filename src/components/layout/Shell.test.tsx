import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { useSessionStore } from "@/features/session";
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

import { Shell } from "./Shell";

vi.mock("@/components/screens/DocumentScreen", () => ({
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

    expect(screen.getByRole("button", { name: "Open file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Insert" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Format" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Help" })).toBeInTheDocument();
    expect(screen.getByText("No recent files.")).toBeInTheDocument();
    expect(screen.getByText("No recent folders.")).toBeInTheDocument();
    expect(screen.getByTestId("menu-bar-host")).toBeInTheDocument();
    expect(screen.getByTestId("article-navigator-host")).toBeInTheDocument();
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
      expect(toast.error).toHaveBeenCalledWith("Could not read Markdown file.", {
        description: "access failed",
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
      expect(toast.error).toHaveBeenCalledWith("Markdown file is too large.", {
        description: "5.0 MB selected. Files larger than 5 MB do not load.",
      });
    });

    expect(useSessionStore.getState()).toMatchObject({
      activeDocument,
      folderContext: nestedFolderContext,
    });
  });
});
