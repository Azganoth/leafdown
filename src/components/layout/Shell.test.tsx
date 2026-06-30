import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

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

    expect(screen.getByRole("button", { name: "readme.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "draft.markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "spec.md" })).not.toBeInTheDocument();
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
      expect(screen.getByRole("button", { name: "spec.md" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    expect(screen.getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "empty" })).toBeDisabled();
    expect(screen.getByTestId("active-document-host")).toHaveTextContent("# Spec");
  });

  it("shows the empty folder state while preserving empty directories", () => {
    setDefaultSession({
      folderContext: emptyFolderContext,
    });

    render(<Shell />);

    expect(screen.getByText("No Markdown files found")).toBeInTheDocument();
    expect(screen.getByText("No supported Markdown files found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "nested" })).toBeDisabled();
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
    await user.click(screen.getByRole("button", { name: "readme.md" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not read Markdown file.", {
        description: "access failed",
      });
    });
  });
});
